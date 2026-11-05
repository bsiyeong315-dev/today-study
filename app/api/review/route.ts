// 복습 문제 API (개발 단위 11) — Design Ref: DESIGN.md §4 "/api/review"
// 원래 세트에서 틀린 문제마다 같은 유형의 복습 문제를 1개씩(최대 5개) 만든다. (PRD must 2 규칙 7)
// 복습은 한 번만 한다. 복습 세트 토큰으로는 다시 복습할 수 없다. (규칙 8)
// 요청: POST /api/review  { sealed: "원래 세트 토큰", wrongIds: ["q2", "q4"] }
// 응답: 200 { unitId, set: "review", questions, sealed: "복습 세트 토큰" } / 실패 시 { error }

import { findUnit } from "@/lib/units";
import {
  MAX_REVIEW_QUESTIONS,
  numberQuestions,
  reviewDifficultyOf,
  toPublicQuestions,
  type Composition,
} from "@/lib/quiz";
import { AiError } from "@/lib/server/openai";
import { generateVerifiedQuestions } from "@/lib/server/questionGen";
import { SealError, seal, unseal, type SealedQuiz } from "@/lib/server/seal";

/** 요청 본문 최대 크기 (16KB) */
const MAX_BODY_CHARS = 16_000;

/** 요청 한 번에 쓸 수 있는 전체 시간 (검증 포함 30초) */
const TOTAL_TIME_MS = 30_000;

export async function POST(request: Request) {
  // 1) 요청 읽기
  const bodyText = await request.text();
  if (bodyText.length > MAX_BODY_CHARS) {
    return Response.json({ error: "입력이 너무 길어요." }, { status: 400 });
  }
  let sealedToken: string;
  let wrongIds: string[];
  try {
    const body = JSON.parse(bodyText);
    sealedToken = typeof body.sealed === "string" ? body.sealed : "";
    wrongIds = Array.isArray(body.wrongIds) ? body.wrongIds.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  // 2) 원래 세트 토큰 풀기
  let quiz: SealedQuiz;
  try {
    quiz = unseal(sealedToken);
  } catch (error) {
    if (error instanceof SealError && error.reason === "expired") {
      return Response.json({ error: "시간이 오래 지났어요. 문제를 다시 받아 주세요.", code: "NEED_NEW_QUESTIONS" }, { status: 410 });
    }
    return Response.json({ error: "문제를 다시 받아 주세요.", code: "NEED_NEW_QUESTIONS" }, { status: 400 });
  }

  // 3) 막는 장치 (DESIGN.md §4, 규칙 8)
  if (quiz.set === "review") {
    return Response.json({ error: "복습은 한 번만 할 수 있어요." }, { status: 400 });
  }
  const uniqueIds = [...new Set(wrongIds)]; // 같은 번호가 여러 번 오면 하나로
  if (uniqueIds.length === 0) {
    return Response.json({ error: "복습할 문제가 없어요." }, { status: 400 });
  }
  const wrongQuestions = uniqueIds.map((id) => quiz.questions.find((q) => q.id === id));
  if (wrongQuestions.some((q) => !q)) {
    return Response.json({ error: "문제 번호가 올바르지 않아요." }, { status: 400 });
  }
  const targets = wrongQuestions.slice(0, MAX_REVIEW_QUESTIONS) as SealedQuiz["questions"];

  const unit = findUnit(quiz.unitId);
  if (!unit) {
    return Response.json({ error: "문제를 다시 받아 주세요.", code: "NEED_NEW_QUESTIONS" }, { status: 400 });
  }

  // 4) 복습 문제 구성: 틀린 문제마다 1개, 같거나 한 단계 쉬운 난이도 (규칙 7)
  const composition: Composition = { 쉬움: 0, 응용: 0, 심화: 0 };
  for (const q of targets) composition[reviewDifficultyOf(q.difficulty)] += 1;

  const extraRules = [
    "이번 문제들은 학생이 틀린 문제를 다시 연습하는 복습 문제다. 아래 '틀린 문제' 하나마다 같은 유형의 새 문제를 1개씩 만든다.",
    "같은 유형이란 같은 단원에서 같은 공식이나 개념을 쓰는 문제다. 숫자와 상황만 바꾸고, 원래 문제를 그대로 베끼지 않는다.",
    ...targets.map(
      (q, i) =>
        `틀린 문제 ${i + 1} ([${q.difficulty}] → 복습 문제는 [${reviewDifficultyOf(q.difficulty)}]): ${q.text}`,
    ),
  ];

  // 5) 검증을 거친 문제 만들기 → 복습 세트 토큰으로 잠그기
  try {
    const questions = await generateVerifiedQuestions({
      unit,
      composition,
      deadline: Date.now() + TOTAL_TIME_MS,
      extraRules,
    });
    // 개수와 난이도를 코드로 다시 확인한다 (DESIGN.md §4)
    for (const d of ["쉬움", "응용", "심화"] as const) {
      if (questions.filter((q) => q.difficulty === d).length !== composition[d]) {
        throw new AiError("복습 문제를 만들지 못했어요. 잠시 후 다시 시도해 주세요.", 502);
      }
    }
    const numbered = numberQuestions(questions);
    const sealed = seal({ unitId: unit.id, set: "review", questions: numbered });
    return Response.json({ unitId: unit.id, set: "review", questions: toPublicQuestions(numbered), sealed });
  } catch (error) {
    if (error instanceof AiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("복습 API 오류:", error);
    return Response.json({ error: "문제가 생겼어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
