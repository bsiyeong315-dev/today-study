// 검증을 거친 문제 출제 (서버 전용) — Design Ref: DESIGN.md §2.2 "출제 검증"
// ⚠️ 서버 쪽 코드(app/api/...)에서만 불러온다.
//
// AI가 낸 문제의 정답이 틀리는 일을 막기 위한 2단계 방식 (2026-11-04 박시영 님 결정)
//  1) 출제: 필요한 개수보다 난이도마다 1개씩 더 만든다. (예: 쉬움 2 + 응용 2 → 쉬움 3 + 응용 3)
//  2) 검증: 다른 AI 호출이 "정답을 모르는 채로" 문제를 다시 푼다.
//  3) 코드가 두 답이 같은 값인지 비교해서, 같은 문제만 남긴다. 풀 수 없다고 한 문제도 버린다.
//  4) 난이도별로 필요한 개수가 모이면 끝. 모자라면 남은 시간 안에서 모자란 만큼 다시 만든다.

import { compareAnswers } from "@/lib/answerMatch";
import {
  MAX_QUESTIONS,
  QUESTIONS_JSON_SCHEMA,
  describeComposition,
  validateQuestions,
  type Composition,
  type Difficulty,
  type GeneratedQuestion,
} from "@/lib/quiz";
import type { Unit } from "@/lib/units";
import { AiError, askOpenAiJson } from "./openai";

const DIFFICULTIES: Difficulty[] = ["쉬움", "응용", "심화"];

/** 다음 단계를 시작하려면 최소 이만큼 시간이 남아 있어야 한다 */
const MIN_TIME_FOR_STEP_MS = 4_000;

type Message = { role: "system" | "user" | "assistant"; content: string };

/** 난이도별 여유분. (심화를 2개로 늘려 보니 출제 시간이 길어져 오히려 30초를 더 자주 넘겼다) */
const SPARE: Record<Difficulty, number> = { 쉬움: 1, 응용: 1, 심화: 1 };

/** 필요한 개수에 여유분을 더한 구성 (전체 최대 10개) */
function withSpare(need: Composition): Composition {
  const extended = { ...need };
  for (const d of DIFFICULTIES) {
    if (need[d] > 0) extended[d] += Math.min(SPARE[d], MAX_QUESTIONS - countAll(extended));
  }
  return extended;
}

function countAll(c: Composition): number {
  return c.쉬움 + c.응용 + c.심화;
}

/**
 * 검증을 통과한 문제를 정확히 composition 개수만큼 만들어 돌려준다.
 * 시간(deadline) 안에 다 모으지 못하면 AiError를 던진다.
 */
export async function generateVerifiedQuestions(options: {
  unit: Unit;
  composition: Composition;
  /** 이 시각(밀리초)까지 끝내야 한다 */
  deadline: number;
  /** 복습 문제처럼 출제에 더할 지시 (없으면 빈 목록) */
  extraRules?: string[];
  /**
   * 후보 문제 묶음을 동시에 몇 개 만들지 (기본 1).
   * 심화 세트는 검증에서 떨어지는 문제가 많아 2로 둔다. 기다리는 시간은 거의 같고, 고를 후보가 두 배가 된다.
   */
  parallelBatches?: number;
}): Promise<GeneratedQuestion[]> {
  const { unit, composition, deadline } = options;
  const batches = Math.max(1, options.parallelBatches ?? 1);
  const accepted: GeneratedQuestion[] = [];
  let discarded = 0; // 검증에서 버린 문제 수 (기록용)
  let formatFailures = 0; // 형식 검사를 통과한 묶음이 하나도 없었던 횟수

  while (true) {
    // 아직 모자란 개수
    const missing = { ...composition };
    for (const q of accepted) missing[q.difficulty] = Math.max(0, missing[q.difficulty] - 1);
    if (countAll(missing) === 0) break;

    if (deadline - Date.now() < MIN_TIME_FOR_STEP_MS * 2) {
      console.error("문제 출제 시간 부족:", { 모은문제: accepted.length, 버린문제: discarded });
      throw new AiError("AI 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.", 504);
    }

    // 1) 출제 (모자란 개수 + 여유분). 묶음 여러 개를 동시에 만든다.
    const want = withSpare(missing);
    const results = await Promise.allSettled(
      Array.from({ length: batches }, () => generate(unit, want, deadline, options.extraRules ?? [], accepted)),
    );
    const candidates = results.flatMap((r) => (r.status === "fulfilled" && r.value ? r.value : []));
    if (candidates.length === 0) {
      // 모든 묶음이 AI 오류로 실패했으면 그 오류를 그대로 알린다 (시간 초과, 요청 많음 등)
      const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (rejected && results.every((r) => r.status === "rejected")) throw rejected.reason;
      formatFailures += 1;
      if (formatFailures >= 3) throw new AiError("문제를 만들지 못했어요. 잠시 후 다시 시도해 주세요.", 502);
      continue;
    }

    // 2) 검증: 정답을 모르는 채로 다시 풀기
    if (deadline - Date.now() < MIN_TIME_FOR_STEP_MS) {
      throw new AiError("AI 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.", 504);
    }
    const solved = await solveIndependently(candidates, deadline);

    // 3) 두 답이 같은 값인 문제만 남긴다 (코드가 비교)
    candidates.forEach((q, i) => {
      const check = solved.get(`c${i + 1}`);
      const agree = check && check.solvable && compareAnswers(check.answer, q.answer) === "same";
      if (agree && missing[q.difficulty] > 0) {
        accepted.push(q);
        missing[q.difficulty] -= 1;
      } else if (!agree) {
        discarded += 1;
        console.warn("검증에서 버린 문제:", q.difficulty, q.text.slice(0, 40));
      }
    });
  }

  // 쉬움 → 응용 → 심화 순서 그대로 돌려준다 (번호는 numberQuestions에서 붙인다)
  return accepted;
}

/** 1단계: 출제. 형식 검사를 통과하지 못하면 null */
async function generate(
  unit: Unit,
  want: Composition,
  deadline: number,
  extraRules: string[],
  alreadyAccepted: GeneratedQuestion[],
): Promise<GeneratedQuestion[] | null> {
  const messages: Message[] = buildGenerateMessages(unit, want, extraRules, alreadyAccepted);
  const result = await askOpenAiJson<{ questions: GeneratedQuestion[] }>({
    messages,
    schemaName: "quiz_questions",
    schema: QUESTIONS_JSON_SCHEMA,
    reasoningEffort: "low", // 정답 확인은 2단계 검증이 맡으므로 빠르게 만든다
    timeoutMs: deadline - Date.now(),
  });
  const errors = validateQuestions(result.questions, want);
  if (errors.length > 0) {
    console.warn("출제 형식 위반:", errors);
    return null;
  }
  return result.questions;
}

/** 검증 풀기 지시문 */
const SOLVER_SYSTEM = [
  "너는 고등학교 수학 문제를 꼼꼼하게 푸는 검토자다. JSON으로만 답한다.",
  "문제를 처음부터 직접 풀어서 정답을 구한다. 다른 사람이 낸 정답은 모른다고 생각하고 스스로 계산한다.",
  "- 조건이 서로 모순이거나, 답이 하나로 정해지지 않거나, 문제 문장이 애매하면 solvable을 false로 한다.",
  "- 그 밖에는 solvable을 true로 하고, answer에 정답만 짧게 적는다. (예: 5, (4, 4), -3/2, 2√3)",
  "- 제곱근은 √, 거듭제곱은 ²·³, 분수는 a/b로 쓴다. LaTeX, $, ^, sqrt는 쓰지 않는다.",
  "- 각도·길이처럼 조건(예각, 양수 등)이 있으면 그 조건을 꼭 지킨다.",
].join("\n");

const SOLVER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["solvable", "answer"],
  properties: {
    solvable: { type: "boolean" },
    answer: { type: "string" },
  },
};

/**
 * 2단계: 정답을 보여주지 않고 문제만 주어 다시 풀게 한다.
 * 시간을 줄이려고 문제마다 따로, 동시에 푼다. 한 문제의 풀기가 실패하면 그 문제만 "검증 실패"로 본다.
 */
async function solveIndependently(
  questions: GeneratedQuestion[],
  deadline: number,
): Promise<Map<string, { solvable: boolean; answer: string }>> {
  const results = await Promise.allSettled(
    questions.map((q) =>
      askOpenAiJson<{ solvable: boolean; answer: string }>({
        messages: [
          { role: "system", content: SOLVER_SYSTEM },
          { role: "user", content: q.text },
        ],
        schemaName: "independent_solution",
        schema: SOLVER_SCHEMA,
        reasoningEffort: "low",
        timeoutMs: deadline - Date.now(),
      }),
    ),
  );
  const map = new Map<string, { solvable: boolean; answer: string }>();
  results.forEach((r, i) => {
    if (r.status === "fulfilled") map.set(`c${i + 1}`, r.value);
  });
  return map;
}

/** 출제 지시문 (PRD must 2 규칙 1~3, 10, 11을 빠짐없이 넣는다) */
function buildGenerateMessages(
  unit: Unit,
  want: Composition,
  extraRules: string[],
  alreadyAccepted: GeneratedQuestion[],
): Message[] {
  const system = [
    "너는 고등학생에게 수학 연습 문제를 내는 선생님이다. 주어진 단원으로만 문제를 만들어 JSON으로 답한다.",
    "",
    "[규칙]",
    `1. 문제 구성은 정확히 ${describeComposition(want)}이다. 그 밖의 개수나 난이도로 내지 않는다.`,
    "2. 모든 문제의 difficulty에 쉬움 / 응용 / 심화 중 하나를 정확히 적는다.",
    "   - 쉬움: 공식이나 개념을 한 번 적용하면 풀리는 기본 문제",
    "   - 응용: 두세 단계를 거치거나 개념을 조금 응용해야 하는 문제",
    "   - 심화: 여러 개념을 엮어야 하는 어려운 문제. 그래도 고등학교 교육과정 안에서만 낸다.",
    "3. 주어진 단원과 핵심 개념 밖의 내용, 고등학교 교육과정 밖의 내용은 어떤 난이도에서도 내지 않는다.",
    "4. 모든 문제는 객관식 보기 없이, 답을 숫자나 좌표 하나로 쓸 수 있는 주관식 단답형으로 낸다. (예: 5, (4, 4), -3/2, 2√3)",
    "   - 답이 여러 개이거나, 식이나 문장으로 답해야 하는 문제는 내지 않는다. 필요하면 '모든 값의 합', '최댓값'처럼 하나의 값으로 묻는다.",
    "   - 정답에 x, y 같은 문자가 들어가면 안 된다. 인수분해·식 정리처럼 답이 원래 식인 단원은 '(x+a)(x+b)로 인수분해될 때 a+b의 값', '정리한 식에서 x의 계수'처럼 숫자 하나를 묻는다.",
    "5. 수식은 글자로 적되 제곱근은 √, 거듭제곱은 ²·³, 분수는 a/b 형태로 통일한다. LaTeX, $, ^, sqrt는 쓰지 않는다.",
    ...extraRules.map((rule, i) => `${6 + i}. ${rule}`),
    "",
    "[작성 방법]",
    "- 문제를 만든 뒤 직접 풀어서 정답이 하나로 딱 떨어지는지 확인한다. 조건끼리 모순되지 않는지도 확인한다.",
    "- 조건을 너무 많이 겹치지 않는다. 조건이 많을수록 서로 모순되기 쉽다.",
    "- answer에는 정답만 짧게 적는다. (예: 5, (4, 4), 2√3)",
    "- text는 한국어로, 300자 이내로 쓴다. 그림이 없어도 글만 읽고 풀 수 있게 쓴다.",
    "- 교과서나 시중 문제집의 문제를 그대로 베끼지 않고 새로 만든다.",
  ].join("\n");

  const user = [
    `단원: ${unit.subject} > ${unit.chapter} > ${unit.name}`,
    `핵심 개념: ${unit.topics.join(", ")}`,
    `문제 구성: ${describeComposition(want)}`,
    ...(alreadyAccepted.length > 0
      ? ["", "이미 만든 문제와 겹치지 않게 새로 만든다:", ...alreadyAccepted.map((q) => `- ${q.text}`)]
      : []),
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
