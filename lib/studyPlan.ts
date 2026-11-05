// AI가 만든 계획표의 모양과 검사 규칙 (개발 단위 5)
// AI가 규칙을 어길 수 있으므로, 받은 계획표를 서버 코드에서 한 번 더 검사한다. (CLAUDE.md 6번)

import { getStudyDays, MAX_NEW_UNITS_PER_DAY, REVIEW_DAY_FROM } from "./planFeasibility";
import type { PlanInput } from "./planInput";

/** 계획표의 하루 */
export type PlanDay = {
  /** 몇째 날인지 (1부터 시작) */
  day: number;
  /** study: 공부하는 날, review: 복습일 */
  type: "study" | "review";
  /** 이날 공부(또는 복습)하는 단원 id 목록 */
  unitIds: string[];
  /** 이날 새로 시작하는 단원 id 목록 (규칙 2: 최대 2개) */
  newUnitIds: string[];
  /** 개념 공부 시간(분) */
  concept: number;
  /** 기본 문제 시간(분) */
  basic: number;
  /** 응용 문제 시간(분) */
  applied: number;
  /** 정리 시간(분) */
  wrapup: number;
  /** 이날의 짧은 공부 팁 (한국어) */
  tip: string;
};

/** 계획표 전체 */
export type StudyPlan = {
  days: PlanDay[];
};

/** 하루 4칸 시간의 합 */
export function dayTotalMinutes(day: PlanDay): number {
  return day.concept + day.basic + day.applied + day.wrapup;
}

/**
 * OpenAI에 "이 모양으로만 답해"라고 알려주는 JSON 스키마.
 * 단원 id는 학생이 고른 것만 쓸 수 있게 enum으로 묶는다.
 */
export function buildPlanJsonSchema(unitIds: string[]) {
  const unitIdList = { type: "array", items: { type: "string", enum: unitIds } };
  return {
    type: "object",
    additionalProperties: false,
    required: ["days"],
    properties: {
      days: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["day", "type", "unitIds", "newUnitIds", "concept", "basic", "applied", "wrapup", "tip"],
          properties: {
            day: { type: "integer" },
            type: { type: "string", enum: ["study", "review"] },
            unitIds: unitIdList,
            newUnitIds: unitIdList,
            concept: { type: "integer" },
            basic: { type: "integer" },
            applied: { type: "integer" },
            wrapup: { type: "integer" },
            tip: { type: "string" },
          },
        },
      },
    },
  };
}

/**
 * 계획표가 PRD must 1 규칙을 지키는지 검사한다.
 * 어긴 점을 한국어 문장 목록으로 돌려준다. 문제가 없으면 빈 목록.
 */
export function validateStudyPlan(plan: StudyPlan, input: PlanInput): string[] {
  const errors: string[] = [];
  const selected = new Set(input.unitIds);
  const needsReviewDay = input.days >= REVIEW_DAY_FROM;

  if (!plan || !Array.isArray(plan.days)) {
    return ["계획표 형식이 올바르지 않습니다."];
  }
  if (plan.days.length !== input.days) {
    errors.push(`계획표는 정확히 ${input.days}일이어야 하는데 ${plan.days.length}일입니다.`);
  }

  const started = new Set<string>(); // 지금까지 새로 시작한 단원

  plan.days.forEach((day, index) => {
    const label = `${index + 1}일째`;
    const isLastDay = index === input.days - 1;

    if (day.day !== index + 1) errors.push(`${label}의 day 값이 ${index + 1}이어야 합니다.`);

    // 규칙 3: 네 칸 모두 0 이상의 정수(분)
    for (const [name, value] of [
      ["개념", day.concept],
      ["기본 문제", day.basic],
      ["응용 문제", day.applied],
      ["정리", day.wrapup],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) errors.push(`${label} ${name} 시간이 0 이상의 정수가 아닙니다.`);
    }

    // 규칙 1: 하루 시간 합계는 하루 공부 시간을 넘지 않는다
    const total = dayTotalMinutes(day);
    if (total > input.minutesPerDay) {
      errors.push(`${label} 시간 합계 ${total}분이 하루 공부 시간 ${input.minutesPerDay}분을 넘습니다.`);
    }
    if (total <= 0) errors.push(`${label}에 공부 시간이 없습니다.`);

    // 규칙 4: 기간이 5일 이상이면 마지막 날만 복습일
    const shouldBeReview = needsReviewDay && isLastDay;
    if (shouldBeReview && day.type !== "review") errors.push(`${label}(마지막 날)은 복습일이어야 합니다.`);
    if (!shouldBeReview && day.type === "review") errors.push(`${label}은 복습일이 아니라 공부하는 날이어야 합니다.`);

    // 규칙 2: 하루에 새로 시작하는 단원은 최대 2개, 복습일에는 새 단원 없음
    if (day.newUnitIds.length > MAX_NEW_UNITS_PER_DAY) {
      errors.push(`${label}에 새 단원이 ${day.newUnitIds.length}개입니다. 최대 ${MAX_NEW_UNITS_PER_DAY}개입니다.`);
    }
    if (day.type === "review" && day.newUnitIds.length > 0) {
      errors.push(`${label}(복습일)에는 새 단원을 넣으면 안 됩니다.`);
    }

    for (const id of day.newUnitIds) {
      if (!selected.has(id)) errors.push(`${label}에 고르지 않은 단원(${id})이 있습니다.`);
      if (started.has(id)) errors.push(`${label}에 이미 시작한 단원(${id})을 새 단원으로 다시 넣었습니다.`);
      if (!day.unitIds.includes(id)) errors.push(`${label}의 새 단원(${id})이 그날 공부 단원 목록에 없습니다.`);
      started.add(id);
    }
    for (const id of day.unitIds) {
      if (!selected.has(id)) errors.push(`${label}에 고르지 않은 단원(${id})이 있습니다.`);
      else if (!started.has(id)) errors.push(`${label}에 아직 시작하지 않은 단원(${id})이 있습니다.`);
    }
    if (day.type === "study" && day.unitIds.length === 0) errors.push(`${label}에 공부할 단원이 없습니다.`);

    if (typeof day.tip !== "string" || day.tip.length > 100) errors.push(`${label}의 팁은 100자 이내여야 합니다.`);
  });

  // 고른 단원은 모두 한 번씩 새로 시작해야 한다
  for (const id of input.unitIds) {
    if (!started.has(id)) errors.push(`단원(${id})이 계획표에 빠졌습니다.`);
  }

  // 새 단원은 복습일을 뺀 공부일 안에서만 시작한다 (참고용 확인)
  const studyDays = getStudyDays(input.days);
  if (plan.days.slice(studyDays).some((d) => d.newUnitIds.length > 0)) {
    errors.push("복습일에 새 단원이 들어 있습니다.");
  }

  // 같은 문장이 여러 번 나오지 않게 정리한다
  return [...new Set(errors)];
}
