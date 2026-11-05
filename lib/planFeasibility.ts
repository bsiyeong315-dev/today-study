// 계획 가능 여부 검사 (개발 단위 4, PRD must 1 규칙 5)
// AI에게 계획을 요청하기 전에 코드로 먼저 계산한다. 들어가지 않는 계획이면 AI를 부르지 않는다.
//
// 사용하는 규칙
// - 규칙 1: 하루 계획 시간의 합은 하루 공부 시간을 넘지 않는다.
// - 규칙 2: 하루에 새로 시작하는 단원은 최대 2개.
// - 규칙 4: 기간이 5일 이상이면 마지막 날은 복습일 (새 단원을 넣지 않는다).
// - 규칙 5: 위 규칙을 함께 지킬 수 없으면, 기간이나 하루 시간을 얼마나 늘려야 하는지 알려준다.

import { DAYS_MAX, MINUTES_MAX, type PlanInput } from "./planInput";

/** 하루에 새로 시작할 수 있는 단원 수 (규칙 2) */
export const MAX_NEW_UNITS_PER_DAY = 2;

/** 이 기간(일) 이상이면 마지막 날을 복습일로 둔다 (규칙 4) */
export const REVIEW_DAY_FROM = 5;

/**
 * 단원 하나를 공부하는 데 필요한 최소 시간(분).
 * 개념 / 기본 문제 / 응용 문제 / 정리(규칙 3)를 한 번씩 하려면 최소 이만큼은 필요하다고 본다.
 * PRD에 숫자가 없어 개발 중에 정한 값이며, 바꾸고 싶으면 이 숫자만 고치면 된다.
 */
export const MIN_MINUTES_PER_UNIT = 120;

/** 검사 결과 */
export type FeasibilityResult =
  | {
      ok: true;
      /** 새 단원을 공부하는 날 수 (복습일 제외) */
      studyDays: number;
      /** 마지막 날이 복습일인지 */
      hasReviewDay: boolean;
    }
  | {
      ok: false;
      /** 학생에게 보여줄 안내 문구 (한국어) */
      message: string;
      /** 하루 시간은 그대로 두고 기간만 늘릴 때 필요한 기간(일). 30일 안에서 불가능하면 null */
      suggestedDays: number | null;
      /** 기간은 그대로 두고 하루 시간만 늘릴 때 필요한 시간(분). 480분 안에서 불가능하면 null */
      suggestedMinutes: number | null;
      /** 지금 기간과 하루 시간으로 공부할 수 있는 최대 단원 수 */
      maxUnitsNow: number;
    };

/** 전체 기간 중 새 단원을 공부하는 날 수 (기간이 5일 이상이면 복습일 1일을 뺀다) */
export function getStudyDays(days: number): number {
  return days >= REVIEW_DAY_FROM ? days - 1 : days;
}

/** 새 단원 공부일이 studyDays일 필요할 때, 복습일까지 포함한 최소 전체 기간 */
function totalDaysFor(studyDays: number): number {
  // 공부일이 4일 이하면 전체 기간도 4일 이하라 복습일이 없다.
  // 공부일이 5일 이상이면 전체 기간이 5일 이상이 되므로 복습일 1일이 더 붙는다.
  return studyDays >= REVIEW_DAY_FROM ? studyDays + 1 : studyDays;
}

/** 주어진 조건에서 공부할 수 있는 최대 단원 수 */
function maxUnits(studyDays: number, minutesPerDay: number): number {
  const byCount = studyDays * MAX_NEW_UNITS_PER_DAY; // 규칙 2 기준
  const byTime = Math.floor((studyDays * minutesPerDay) / MIN_MINUTES_PER_UNIT); // 규칙 1 기준
  return Math.min(byCount, byTime);
}

/** 고른 단원이 기간과 하루 시간 안에 들어가는지 검사한다 */
export function checkPlanFeasibility(input: PlanInput): FeasibilityResult {
  const unitCount = input.unitIds.length;
  const studyDays = getStudyDays(input.days);
  const hasReviewDay = input.days >= REVIEW_DAY_FROM;

  if (unitCount <= maxUnits(studyDays, input.minutesPerDay)) {
    return { ok: true, studyDays, hasReviewDay };
  }

  // ── 들어가지 않는 경우: 어떻게 늘려야 하는지 계산한다 ──

  // ① 하루 시간은 그대로, 기간만 늘리기
  const neededStudyDays = Math.max(
    Math.ceil(unitCount / MAX_NEW_UNITS_PER_DAY), // 규칙 2: 하루 2단원씩
    Math.ceil((unitCount * MIN_MINUTES_PER_UNIT) / input.minutesPerDay), // 규칙 1: 필요한 총 시간
  );
  const neededDays = totalDaysFor(neededStudyDays);
  const suggestedDays = neededDays <= DAYS_MAX ? neededDays : null;

  // ② 기간은 그대로, 하루 시간만 늘리기 (10분 단위로 올림)
  // 하루 2단원 제한(규칙 2) 때문에 기간 자체가 모자라면 시간만 늘려서는 해결되지 않는다
  let suggestedMinutes: number | null = null;
  if (unitCount <= studyDays * MAX_NEW_UNITS_PER_DAY) {
    const rawMinutes = (unitCount * MIN_MINUTES_PER_UNIT) / studyDays;
    const neededMinutes = Math.ceil(rawMinutes / 10) * 10;
    if (neededMinutes <= MINUTES_MAX) suggestedMinutes = neededMinutes;
  }

  const maxUnitsNow = maxUnits(studyDays, input.minutesPerDay);

  // 안내 문구 만들기
  let message = `고른 단원 ${unitCount}개가 ${input.days}일, 하루 ${input.minutesPerDay}분 안에 다 들어가지 않아요.`;
  if (suggestedDays !== null && suggestedMinutes !== null) {
    message += ` 기간을 ${suggestedDays}일 이상으로 늘리거나, 하루 공부 시간을 ${suggestedMinutes}분 이상으로 늘려 주세요.`;
  } else if (suggestedDays !== null) {
    message += ` 기간을 ${suggestedDays}일 이상으로 늘려 주세요.`;
  } else if (suggestedMinutes !== null) {
    message += ` 하루 공부 시간을 ${suggestedMinutes}분 이상으로 늘려 주세요.`;
  } else {
    message += ` 기간이나 하루 시간을 늘려도 맞출 수 없어요. 단원 수를 줄여 주세요.`;
  }
  message +=
    maxUnitsNow > 0
      ? ` (지금 조건으로는 최대 ${maxUnitsNow}개까지 공부할 수 있어요)`
      : ` (지금 조건으로는 단원 1개도 공부하기 어려워요)`;

  return { ok: false, message, suggestedDays, suggestedMinutes, maxUnitsNow };
}
