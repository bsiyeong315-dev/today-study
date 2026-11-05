// 채점·풀이 API (개발 단위 9) — Design Ref: DESIGN.md §2.2, §4, §6
// 잠금 토큰을 풀어 "출제 때 확인한 정답"으로 채점한다.
// - O/X는 코드가 정한다. (빈 답·"모르겠어요"는 X, 같은 값이면 O, 다른 값이면 X)
// - 코드로 판단할 수 없는 답만 AI에게 같은 값인지 묻는다.
// - 단계별 풀이와 틀린 곳 한 줄은 AI가 쓴다.
// 요청: POST /api/grade  { sealed: string, answers: { q1: "5", ... } }
// 응답: 200 GradeResult / 실패 시 { error: "한국어 안내 문구" }

import { checkAnswerInput, compareAnswers, isBlankOrUnknown, type MatchVerdict } from "@/lib/answerMatch";
import {
  ANSWER_MAX_LENGTH,
  ANSWERS_TOTAL_LIMIT,
  type GradeItem,
  type GradeResult,
} from "@/lib/quiz";
import { computeNextSet } from "@/lib/quizFlow";
import { findUnit } from "@/lib/units";
import { AiError, askOpenAiJson } from "@/lib/server/openai";
import { SealError, unseal, type SealedQuiz } from "@/lib/server/seal";

/** 요청 본문 최대 크기 (16KB, DESIGN.md §7) */
const MAX_BODY_CHARS = 16_000;

/** 요청 한 번에 쓸 수 있는 전체 시간 (재요청 포함 30초) */
const TOTAL_TIME_MS = 30_000;

/** AI가 형식을 어겼을 때 다시 요청하는 최대 횟수 (첫 요청 포함 2번) */
const MAX_ATTEMPTS = 2;

/** AI가 돌려주는 문제별 풀이 */
type AiExplanation = {
  id: string;
  /** 판단 필요(unknown)였던 답이 정답과 같은 값인지 */
  equivalent: boolean;
  steps: string[];
  /** 틀린 곳 한 줄 (맞으면 빈 글자) */
  mistake: string;
  /** 복습 문제를 틀렸을 때만 짧은 개념 설명 (아니면 빈 글자) */
  concept: string;
};

export async function POST(request: Request) {
  // 1) 요청 읽기
  const bodyText = await request.text();
  if (bodyText.length > MAX_BODY_CHARS) {
    return Response.json({ error: "입력이 너무 길어요." }, { status: 400 });
  }
  let sealedToken: string;
  let rawAnswers: Record<string, unknown>;
  try {
    const body = JSON.parse(bodyText);
    sealedToken = typeof body.sealed === "string" ? body.sealed : "";
    rawAnswers = body.answers && typeof body.answers === "object" ? body.answers : {};
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  // 2) 잠금 토큰 풀기 → 출제 때의 문제와 정답 (화면이 보낸 문제 내용은 믿지 않는다)
  let quiz: SealedQuiz;
  try {
    quiz = unseal(sealedToken);
  } catch (error) {
    if (error instanceof SealError && error.reason === "expired") {
      return Response.json({ error: "시간이 오래 지났어요. 문제를 다시 받아 주세요.", code: "NEED_NEW_QUESTIONS" }, { status: 410 });
    }
    return Response.json({ error: "문제를 다시 받아 주세요.", code: "NEED_NEW_QUESTIONS" }, { status: 400 });
  }

  // 3) 학생 답 정리와 검사 (DESIGN.md §6: 개인정보 → 허용 글자 순서)
  const studentAnswers = quiz.questions.map((q) => {
    const value = rawAnswers[q.id];
    return typeof value === "string" ? value.trim() : "";
  });
  for (let i = 0; i < studentAnswers.length; i++) {
    const answer = studentAnswers[i];
    if (answer.length > ANSWER_MAX_LENGTH) {
      return Response.json({ error: `${i + 1}번 답은 ${ANSWER_MAX_LENGTH}자 이내로 적어 주세요.` }, { status: 400 });
    }
    const problem = checkAnswerInput(answer);
    if (problem) {
      return Response.json({ error: `${i + 1}번 답: ${problem.message}` }, { status: 400 });
    }
  }
  const totalChars = studentAnswers.reduce((sum, a) => sum + a.length, 0);
  if (totalChars > ANSWERS_TOTAL_LIMIT) {
    return Response.json({ error: `답 전체를 ${ANSWERS_TOTAL_LIMIT}자 이내로 줄여 주세요.` }, { status: 400 });
  }

  // 4) 코드로 먼저 채점 (규칙 12, 13). 같음·다름은 코드 판단이 최종이다.
  const verdicts: MatchVerdict[] = quiz.questions.map((q, i) =>
    isBlankOrUnknown(studentAnswers[i]) ? "different" : compareAnswers(studentAnswers[i], q.answer),
  );

  // 5) AI에게 풀이 요청 (판단 불가인 답은 같은 값인지도 함께 묻는다)
  const isReview = quiz.set === "review";
  let explanations: Map<string, AiExplanation>;
  try {
    explanations = await askExplanations(quiz, studentAnswers, verdicts, isReview);
  } catch (error) {
    if (error instanceof AiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("채점 API 오류:", error);
    return Response.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 500 });
  }

  // 6) 결과 만들기
  const items: GradeItem[] = quiz.questions.map((q, i) => {
    const ai = explanations.get(q.id)!;
    const correct = verdicts[i] === "same" || (verdicts[i] === "unknown" && ai.equivalent);
    return {
      id: q.id,
      difficulty: q.difficulty,
      correct,
      studentAnswer: studentAnswers[i],
      correctAnswer: q.answer,
      steps: ai.steps,
      mistake: correct ? null : ai.mistake.trim() || "답이 정답과 달라요. 풀이를 차근차근 다시 확인해 보세요.",
      concept: isReview && !correct ? ai.concept.trim() || null : null,
    };
  });

  const result: GradeResult = {
    items,
    correctCount: items.filter((item) => item.correct).length,
    total: items.length,
    // 원래 세트만 다음 세트를 정한다. 복습 채점은 null (규칙 9)
    nextSet: isReview ? null : computeNextSet(quiz.set as "basic" | "advanced", items),
  };
  return Response.json(result);
}

/** AI에게 문제별 단계별 풀이와 틀린 곳을 받는다. 형식을 어기면 전체 30초 안에서 한 번 더 요청한다. */
async function askExplanations(
  quiz: SealedQuiz,
  studentAnswers: string[],
  verdicts: MatchVerdict[],
  isReview: boolean,
): Promise<Map<string, AiExplanation>> {
  const ids = quiz.questions.map((q) => q.id);
  const unit = findUnit(quiz.unitId);

  const system = [
    "너는 고등학생의 수학 답안을 보고 풀이를 써 주는 친절한 선생님이다. JSON으로만 답한다.",
    "",
    "[규칙]",
    "1. 정답은 주어진 '정답'이 맞다. 정답을 바꾸거나 의심하지 않는다.",
    "2. 모든 문제에 대해 steps에 계산 과정을 단계별로 쓴다. 한 단계는 한 문장, 2~6단계, 한 단계 150자 이내.",
    "3. 판정이 '틀림'인 문제는 mistake에 학생이 어디서 틀렸는지 한 줄(80자 이내)로 쓴다. 학생 답이 비어 있으면 '답을 적지 않았어요. 풀이를 따라 해 보세요.'처럼 쓴다. 판정이 '맞음'이면 mistake는 빈 글자다.",
    "4. 판정이 '판단 필요'인 문제는 학생 답이 정답과 같은 값인지 equivalent에 true/false로 적는다. 모양만 다르고 값이 같으면 true다. 그 외 문제는 equivalent를 판정과 같게(맞음=true, 틀림=false) 적는다.",
    isReview
      ? "5. 이 문제들은 복습 문제다. 틀린 문제(판단 필요인데 다른 값이면 포함)는 concept에 그 문제를 푸는 핵심 개념을 2~3문장(200자 이내)으로 쉽게 설명한다. 맞은 문제는 concept을 빈 글자로 둔다."
      : "5. concept은 항상 빈 글자로 둔다.",
    "6. 수식은 글자로 적되 제곱근은 √, 거듭제곱은 ²·³, 분수는 a/b로 쓴다. LaTeX, $, ^, sqrt는 쓰지 않는다.",
    "7. 쉬운 한국어로, 고등학생이 혼자 읽고 이해할 수 있게 쓴다.",
  ].join("\n");

  const verdictLabel: Record<MatchVerdict, string> = { same: "맞음", different: "틀림", unknown: "판단 필요" };
  const user = [
    `단원: ${unit ? `${unit.subject} > ${unit.name}` : quiz.unitId}`,
    ...quiz.questions.map((q, i) =>
      [
        `[${q.id}] (${q.difficulty}) ${q.text}`,
        `정답: ${q.answer}`,
        `학생 답: ${studentAnswers[i] || "(비어 있음)"}`,
        `판정: ${verdictLabel[verdicts[i]]}`,
      ].join("\n"),
    ),
  ].join("\n\n");

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "equivalent", "steps", "mistake", "concept"],
          properties: {
            id: { type: "string", enum: ids },
            equivalent: { type: "boolean" },
            steps: { type: "array", items: { type: "string" } },
            mistake: { type: "string" },
            concept: { type: "string" },
          },
        },
      },
    },
  };

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const deadline = Date.now() + TOTAL_TIME_MS;
  let lastProblems: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const timeLeft = deadline - Date.now();
    if (timeLeft < 3_000) break;
    const result = await askOpenAiJson<{ items: AiExplanation[] }>({
      messages,
      schemaName: "grading_explanations",
      schema,
      timeoutMs: timeLeft,
    });

    // 형식 검사: 모든 문제가 한 번씩, 풀이가 있어야 한다
    const map = new Map(result.items.map((item) => [item.id, item]));
    lastProblems = [];
    if (map.size !== ids.length || result.items.length !== ids.length) {
      lastProblems.push(`문제 ${ids.length}개(${ids.join(", ")})의 풀이를 하나씩 정확히 주세요.`);
    }
    for (const id of ids) {
      const item = map.get(id);
      if (!item) continue;
      if (item.steps.length === 0 || item.steps.some((s) => !s.trim())) lastProblems.push(`${id}의 풀이 단계가 비어 있습니다.`);
      if (item.steps.join("").match(/\\[a-zA-Z]+|\$|\^|sqrt/i)) lastProblems.push(`${id}의 풀이에 LaTeX, $, ^, sqrt가 쓰였습니다.`);
    }
    if (lastProblems.length === 0) return map;

    messages.push(
      { role: "assistant", content: JSON.stringify(result) },
      { role: "user", content: `다음을 고쳐서 전체를 다시 주세요.\n- ${lastProblems.join("\n- ")}` },
    );
  }

  console.error("채점 풀이 형식 위반:", lastProblems);
  throw new AiError(
    lastProblems.length > 0 ? "풀이를 만들지 못했어요. 잠시 후 다시 시도해 주세요." : "AI 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.",
    lastProblems.length > 0 ? 502 : 504,
  );
}
