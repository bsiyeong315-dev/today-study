// 공부 계획 입력값의 규칙과 검사 (개발 단위 3)
// 화면과 서버(개발 단위 5) 양쪽에서 같은 규칙으로 검사할 수 있게 한 곳에 모아 둔다.

import { findUnit } from "./units";

/** 공부 기간(일) 범위 */
export const DAYS_MIN = 1;
export const DAYS_MAX = 30;

/** 하루 공부 시간(분) 범위 */
export const MINUTES_MIN = 30;
export const MINUTES_MAX = 480;

/** 한 번 보낼 때 입력 전체 글자 수 제한 (PRD 7번 ③) */
export const INPUT_CHAR_LIMIT = 500;

/** 계획 입력값 */
export type PlanInput = {
  /** 고른 단원의 id 목록 (lib/units.ts의 id) */
  unitIds: string[];
  /** 공부할 기간(일) */
  days: number;
  /** 하루 공부 시간(분) */
  minutesPerDay: number;
};

/**
 * 입력 전체의 글자 수를 센다.
 * 학생이 보고 고른 내용(단원 이름 + 숫자)을 기준으로 센다.
 */
export function countInputChars(input: PlanInput): number {
  const unitNames = input.unitIds.map((id) => findUnit(id)?.name ?? id).join(", ");
  return unitNames.length + String(input.days).length + String(input.minutesPerDay).length;
}

/**
 * 입력값을 검사해서 문제가 있으면 한국어 안내 문구 목록을 돌려준다.
 * 문제가 없으면 빈 목록을 돌려준다.
 */
export function validatePlanInput(input: PlanInput): string[] {
  const errors: string[] = [];

  if (input.unitIds.length === 0) {
    errors.push("공부할 단원을 1개 이상 골라 주세요.");
  }
  if (input.unitIds.some((id) => !findUnit(id))) {
    errors.push("수학 단원을 목록에서 골라 주세요.");
  }
  if (!Number.isInteger(input.days) || input.days < DAYS_MIN || input.days > DAYS_MAX) {
    errors.push(`공부 기간은 ${DAYS_MIN}일부터 ${DAYS_MAX}일까지 정수로 입력해 주세요.`);
  }
  if (
    !Number.isInteger(input.minutesPerDay) ||
    input.minutesPerDay < MINUTES_MIN ||
    input.minutesPerDay > MINUTES_MAX
  ) {
    errors.push(`하루 공부 시간은 ${MINUTES_MIN}분부터 ${MINUTES_MAX}분까지 정수로 입력해 주세요.`);
  }
  if (countInputChars(input) > INPUT_CHAR_LIMIT) {
    errors.push(`입력이 너무 길어요. 전체 ${INPUT_CHAR_LIMIT}자 이내로 줄여 주세요.`);
  }

  return errors;
}
