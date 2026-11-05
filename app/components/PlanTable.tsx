// 날짜별 계획표 보여주기 (개발 단위 6)
// 하루마다 날짜, 공부할 단원(새 단원 표시), 개념 / 기본 문제 / 응용 문제 / 정리 시간(분), 팁을 보여준다.
// 첫째 날을 "오늘"로 보고, 오늘 할 분량을 맨 위에서 바로 확인할 수 있게 강조한다. (PRD 4번 이용 흐름 ①)

import { findUnit } from "@/lib/units";
import { dayTotalMinutes, type StudyPlan } from "@/lib/studyPlan";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 시작 날짜에서 n일 뒤의 날짜를 "11/4 (수)" 모양으로 만든다 */
function formatDate(startDate: Date, offset: number): string {
  const date = new Date(startDate);
  date.setDate(date.getDate() + offset);
  return `${date.getMonth() + 1}/${date.getDate()} (${WEEKDAYS[date.getDay()]})`;
}

/** 하루 네 칸의 이름과 색 */
const BLOCKS = [
  { key: "concept", label: "개념", color: "bg-sky-100 text-sky-800" },
  { key: "basic", label: "기본 문제", color: "bg-emerald-100 text-emerald-800" },
  { key: "applied", label: "응용 문제", color: "bg-violet-100 text-violet-800" },
  { key: "wrapup", label: "정리", color: "bg-zinc-200 text-zinc-700" },
] as const;

type Props = {
  plan: StudyPlan;
  /** 계획을 만든 날 (첫째 날 = 오늘) */
  startDate: Date;
  minutesPerDay: number;
};

export default function PlanTable({ plan, startDate, minutesPerDay }: Props) {
  return (
    <section aria-label="날짜별 계획표" className="mt-6">
      <h3 className="text-base font-semibold text-zinc-900">
        🗓️ 날짜별 계획표 <span className="text-sm font-normal text-zinc-500">(하루 {minutesPerDay}분)</span>
      </h3>

      <ol className="mt-3 space-y-3">
        {plan.days.map((day, index) => {
          const isToday = index === 0;
          const isReview = day.type === "review";
          return (
            <li
              key={day.day}
              className={`rounded-lg border p-4 ${
                isToday ? "border-blue-400 bg-blue-50" : "border-zinc-200 bg-white"
              }`}
            >
              {/* 날짜와 구분 */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-zinc-900">
                  {day.day}일째 · {formatDate(startDate, index)}
                </span>
                {isToday && (
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                    오늘
                  </span>
                )}
                {isReview && (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
                    복습일
                  </span>
                )}
                <span className="ml-auto text-xs text-zinc-500">합계 {dayTotalMinutes(day)}분</span>
              </div>

              {/* 단원 */}
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {day.unitIds.map((id) => {
                  const isNew = day.newUnitIds.includes(id);
                  return (
                    <li
                      key={id}
                      className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-sm text-zinc-800"
                    >
                      {findUnit(id)?.name ?? id}
                      {isNew && <span className="ml-1 text-xs font-semibold text-blue-600">새 단원</span>}
                    </li>
                  );
                })}
              </ul>

              {/* 네 칸 시간 */}
              <ul className="mt-3 grid grid-cols-2 gap-1.5">
                {BLOCKS.map((block) => (
                  <li key={block.key} className={`rounded px-2 py-1 text-xs ${block.color}`}>
                    {block.label} <span className="font-semibold">{day[block.key]}분</span>
                  </li>
                ))}
              </ul>

              {/* 팁 */}
              {day.tip && <p className="mt-2 text-sm text-zinc-600">💡 {day.tip}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
