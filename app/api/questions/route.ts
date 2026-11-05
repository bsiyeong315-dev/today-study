// 문제 출제 API (개발 단위 7, 8) — Design Ref: DESIGN.md §2.2, §4
// 고른 단원으로 난이도별 주관식 단답 문제를 만들고, 정답은 잠금 토큰(sealed)에만 넣어 돌려준다. (PRD must 2 규칙 4)
// 문제는 "출제 → 정답을 모르는 다시 풀기 → 코드로 두 답 비교" 검증을 통과한 것만 쓴다. (lib/server/questionGen.ts)
// 요청: POST /api/questions  { unitId: string, set?: "basic" | "advanced" }
// 응답: 200 { unitId, set, questions: [{ id, difficulty, text }], sealed } / 실패 시 { error: "한국어 안내 문구" }

import { findUnit } from "@/lib/units";
import { COMPOSITIONS, numberQuestions, toPublicQuestions, type QuizSet } from "@/lib/quiz";
import { AiError } from "@/lib/server/openai";
import { generateVerifiedQuestions } from "@/lib/server/questionGen";
import { seal } from "@/lib/server/seal";

/** 요청 본문 최대 크기(글자) */
const MAX_BODY_CHARS = 500;

/** 요청 한 번에 쓸 수 있는 전체 시간 (검증·재요청 포함 30초, DESIGN.md §4) */
const TOTAL_TIME_MS = 30_000;

export async function POST(request: Request) {
  // 1) 요청 읽기와 검사
  const bodyText = await request.text();
  if (bodyText.length > MAX_BODY_CHARS) {
    return Response.json({ error: "입력이 너무 길어요." }, { status: 400 });
  }
  let unitId: string;
  let set: QuizSet;
  try {
    const body = JSON.parse(bodyText);
    unitId = typeof body.unitId === "string" ? body.unitId : "";
    set = body.set === "advanced" ? "advanced" : "basic";
  } catch {
    return Response.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  // 목록에 있는 단원만 받는다 (규칙 3, PRD 6번)
  const unit = findUnit(unitId);
  if (!unit) {
    return Response.json({ error: "수학 단원을 목록에서 골라 주세요." }, { status: 400 });
  }

  // 2) 검증을 거친 문제 만들기 (전체 30초 안에서)
  try {
    const questions = await generateVerifiedQuestions({
      unit,
      composition: COMPOSITIONS[set],
      deadline: Date.now() + TOTAL_TIME_MS,
      // 심화 세트는 후보 묶음 2개를 동시에 만든다 (30초 안에 검증 통과 문제를 모으기 위해, 2026-11-04 결정)
      parallelBatches: set === "advanced" ? 2 : 1,
    });
    // 정답은 잠금 토큰 안에만 넣고, 화면에는 문제만 보낸다 (규칙 4)
    const numbered = numberQuestions(questions);
    const sealed = seal({ unitId: unit.id, set, questions: numbered });
    return Response.json({ unitId: unit.id, set, questions: toPublicQuestions(numbered), sealed });
  } catch (error) {
    if (error instanceof AiError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("문제 출제 API 오류:", error);
    return Response.json({ error: "문제가 생겼어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

// Vercel에서 AI 응답을 기다리는 시간(최대 약 37초)이 기본 제한(10초)을 넘지 않도록 60초로 늘린다.
export const maxDuration = 60;
