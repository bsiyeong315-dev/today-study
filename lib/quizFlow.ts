// 문제 풀기 흐름 규칙 — Design Ref: DESIGN.md §2.2 "다음 세트 계산"
// 개발 단위 9: 다음 세트 계산 (화면 상태 정리는 개발 단위 12에서 이 파일에 더한다)

import type { Difficulty, QuizSet } from "./quiz";

/** [심화] 문제를 이 개수 이상 틀리면 기본 세트로 돌아간다 (PRD must 2 규칙 9) */
const ADVANCED_FAIL_LIMIT = 2;

/**
 * 원래 세트의 채점 결과로 다음 세트 종류를 정한다. (PRD must 2 규칙 9)
 * - 기본 세트: 모두 맞히면 심화, 하나라도 틀리면 기본
 * - 심화 세트: [심화] 문제만 틀린 개수를 센다. 0~1개 → 심화 유지, 2개 이상 → 기본
 * 복습 문제 결과는 쓰지 않는다. (복습 채점에서는 이 함수를 부르지 않는다)
 */
export function computeNextSet(
  set: QuizSet,
  results: { difficulty: Difficulty; correct: boolean }[],
): QuizSet {
  if (set === "basic") {
    return results.every((r) => r.correct) ? "advanced" : "basic";
  }
  const advancedWrong = results.filter((r) => r.difficulty === "심화" && !r.correct).length;
  return advancedWrong >= ADVANCED_FAIL_LIMIT ? "basic" : "advanced";
}

/** 세트 이름 (화면 표시용) */
export const SET_LABEL: Record<QuizSet, string> = { basic: "기본 세트", advanced: "심화 세트" };

/**
 * 다음 세트를 왜 그렇게 정했는지 학생에게 보여줄 한 줄 (개발 단위 12)
 * 원래 세트(current)와 계산된 다음 세트(next)로 문구를 고른다.
 */
export function describeNextSet(current: QuizSet, next: QuizSet): string {
  if (current === "basic") {
    return next === "advanced"
      ? "🎉 모두 맞혔어요! 다음은 한 단계 어려운 심화 세트예요."
      : "모두 맞히면 심화 세트로 올라가요. 기본 세트를 한 번 더 풀어 봐요.";
  }
  return next === "advanced"
    ? "💪 [심화] 문제를 1개 이하로 틀렸어요. 심화 세트를 이어서 풀어요."
    : "[심화] 문제를 2개 이상 틀렸어요. 기본 세트로 돌아가서 다시 다져 봐요.";
}
