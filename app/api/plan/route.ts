// 공부 계획 API (개발 단위 5)
// 화면에서 받은 입력을 검사하고, OpenAI에게 계획표를 요청한 뒤, 규칙을 지켰는지 다시 검사해서 돌려준다.
// 요청: POST /api/plan  { unitIds: string[], days: number, minutesPerDay: number }
// 응답: 200 { plan, studyDays, hasReviewDay } / 실패 시 { error: "한국어 안내 문구" }

import { checkPlanFeasibility, MIN_MINUTES_PER_UNIT, MAX_NEW_UNITS_PER_DAY, REVIEW_DAY_FROM } from "@/lib/planFeasibility";
import { validatePlanInput, type PlanInput } from "@/lib/planInput";
import { buildPlanJsonSchema, validateStudyPlan, type StudyPlan } from "@/lib/studyPlan";
import { findUnit } from "@/lib/units";
import { AiError, askOpenAiJson } from "@/lib/server/openai";

/** 요청 본문 최대 크기(글자). 비정상적으로 큰 요청을 막는다. */
const MAX_BODY_CHARS = 2000;

/** AI가 규칙을 어겼을 때 다시 요청하는 최대 횟수 (첫 요청 포함 2번) */
const MAX_ATTEMPTS = 2;

export async function POST(request: Request) {
  // 1) 요청 읽기
  const bodyText = await request.text();
  if (bodyText.length > MAX_BODY_CHARS) {
    return Response.json({ error: "입력이 너무 길어요." }, { status: 400 });
  }
  let input: PlanInput;
  try {
    const body = JSON.parse(bodyText);
    input = {
      unitIds: Array.isArray(body.unitIds) ? body.unitIds.filter((x: unknown) => typeof x === "string") : [],
      days: Number(body.days),
      minutesPerDay: Number(body.minutesPerDay),
    };
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }
  input.unitIds = [...new Set(input.unitIds)]; // 같은 단원이 두 번 들어오면 하나로

  // 2) 입력 검사 (화면과 같은 규칙으로 서버에서도 한 번 더)
  const inputErrors = validatePlanInput(input);
  if (inputErrors.length > 0) {
    return Response.json({ error: inputErrors.join(" ") }, { status: 400 });
  }

  // 3) 기간 안에 들어가는지 검사 (must 1 규칙 5). 들어가지 않으면 AI를 부르지 않는다.
  const feasibility = checkPlanFeasibility(input);
  if (!feasibility.ok) {
    return Response.json({ error: feasibility.message }, { status: 422 });
  }

  // 4) AI에게 계획표 요청 → 규칙 검사 → 어겼으면 이유를 알려주고 한 번 더 요청
  const messages = buildMessages(input, feasibility.studyDays, feasibility.hasReviewDay);
  let lastErrors: string[] = [];

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const plan = await askOpenAiJson<StudyPlan>({
        messages,
        schemaName: "study_plan",
        schema: buildPlanJsonSchema(input.unitIds),
      });

      lastErrors = validateStudyPlan(plan, input);
      if (lastErrors.length === 0) {
        return Response.json({
          plan,
          studyDays: feasibility.studyDays,
          hasReviewDay: feasibility.hasReviewDay,
        });
      }

      // 다음 요청에 어긴 점을 알려준다
      messages.push(
        { role: "assistant", content: JSON.stringify(plan) },
        {
          role: "user",
          content: `위 계획표가 다음 규칙을 어겼습니다. 모두 고쳐서 전체 계획표를 다시 주세요.\n- ${lastErrors.join("\n- ")}`,
        },
      );
    }
  } catch (error) {
    if (error instanceof AiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("계획 API 오류:", error);
    return Response.json({ error: "문제가 생겼어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }

  // 두 번 모두 규칙을 어긴 경우
  console.error("AI 계획표 규칙 위반:", lastErrors);
  return Response.json(
    { error: "계획표를 만들지 못했어요. 잠시 후 다시 시도해 주세요." },
    { status: 502 },
  );
}

/** AI에게 보낼 지시문 (PRD must 1 규칙 1~4를 빠짐없이 넣는다) */
function buildMessages(input: PlanInput, studyDays: number, hasReviewDay: boolean) {
  const unitLines = input.unitIds.map((id, i) => {
    const unit = findUnit(id)!; // 입력 검사에서 목록에 있는 단원만 통과했다
    return `${i + 1}. id=${unit.id} | ${unit.subject} > ${unit.chapter} > ${unit.name} | 핵심 개념: ${unit.topics.join(", ")}`;
  });

  const system = [
    "너는 혼자 공부하는 고등학생의 수학 공부 계획을 짜 주는 도우미다.",
    "주어진 단원만으로 날짜별 공부 계획표를 JSON으로 만든다. 반드시 아래 규칙을 모두 지킨다.",
    "",
    "[규칙]",
    "1. 하루 네 칸 시간(concept + basic + applied + wrapup)의 합은 하루 공부 시간을 절대 넘지 않는다. 가능하면 하루 공부 시간을 거의 다 쓴다.",
    `2. 하루에 새로 시작하는 단원(newUnitIds)은 최대 ${MAX_NEW_UNITS_PER_DAY}개다. 각 단원은 전체 기간 중 딱 한 번만 newUnitIds에 들어간다.`,
    "3. 하루 시간은 개념(concept) / 기본 문제(basic) / 응용 문제(applied) / 정리(wrapup) 네 칸으로 나누고, 각 칸은 분 단위 정수로 적는다.",
    `4. 기간이 ${REVIEW_DAY_FROM}일 이상이면 마지막 날은 복습일(type="review")로 둔다. 복습일에는 newUnitIds를 비우고, unitIds에는 복습할 단원(특히 어려운 단원)을 넣는다. 그 외의 날은 모두 type="study"다.`,
    "",
    "[작성 방법]",
    "- 단원은 주어진 순서대로 배치한다. 앞 단원을 먼저 배운다.",
    `- 단원 하나에 최소 ${MIN_MINUTES_PER_UNIT}분 정도가 돌아가도록 고르게 나눈다. 단원이 공부일보다 적으면 한 단원을 여러 날에 걸쳐 이어서 공부해도 된다(이어서 하는 날은 unitIds에만 넣고 newUnitIds에는 넣지 않는다).`,
    "- unitIds에는 그날 공부하는 모든 단원(새로 시작하는 단원 + 이어서 하는 단원)을 넣는다.",
    "- day는 1부터 순서대로 적는다.",
    "- tip은 그날 공부에 도움이 되는 한국어 한 문장(100자 이내)이다. 쉬운 말로 쓴다.",
    "- 주어진 단원 밖의 내용이나 고등학교 교육과정 밖의 내용은 넣지 않는다.",
  ].join("\n");

  const user = [
    `기간: ${input.days}일 (새 단원 공부일 ${studyDays}일${hasReviewDay ? " + 마지막 날 복습일 1일" : ", 복습일 없음"})`,
    `하루 공부 시간: ${input.minutesPerDay}분`,
    `단원 ${input.unitIds.length}개 (이 순서대로 공부):`,
    ...unitLines,
  ].join("\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ] as { role: "system" | "user" | "assistant"; content: string }[];
}

// Vercel에서 AI 응답을 기다리는 시간(최대 약 37초)이 기본 제한(10초)을 넘지 않도록 60초로 늘린다.
export const maxDuration = 60;
