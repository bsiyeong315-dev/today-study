// 날짜별 계획표 보여주기 (개발 단위 6)
// 하루마다 날짜, 공부할 단원(새 단원 표시), 개념 / 기본 문제 / 응용 문제 / 정리 시간(분), 팁을 보여준다.
// 첫째 날을 "오늘"로 보고, 오늘 할 분량을 맨 위에서 바로 확인할 수 있게 강조한다. (PRD 4번 이용 흐름 ①)
// 실천 체크: 네 칸을 끝낼 때마다 체크하면 "계획 대비 실천 %"(분 기준)를 보여주고, 80%에 닿으면 한 번 축하한다.
// 체크는 화면 안에서만 기억한다. (새로고침하면 사라짐 — PRD 6번 "기록 저장 안 함")

"use client";

import { useState } from "react";

import { findUnit } from "@/lib/units";
import { dayTotalMinutes, type StudyPlan } from "@/lib/studyPlan";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 시작 날짜에서 n일 뒤의 날짜를 "11/4 (수)" 모양으로 만든다 */
function formatDate(startDate: Date, offset: number): string {
  const date = new Date(startDate);
  date.setDate(date.getDate() + offset);
  return `${date.getMonth() + 1}/${date.getDate()} (${WEEKDAYS[date.getDay()]})`;
}

/** 이 비율(%) 이상 실천하면 달성으로 보고 축하한다 */
const GOAL_PERCENT = 80;

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
  // 체크한 칸 ("날짜순번-칸이름" 모양). 예: "0-concept"
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // 80% 축하를 이미 보여줬는지, 지금 보여주는 중인지
  const [celebrated, setCelebrated] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  // 계획 대비 실천 비율: 체크한 칸의 분 합계 ÷ 계획 전체 분 합계
  const totalMinutes = plan.days.reduce((sum, day) => sum + dayTotalMinutes(day), 0);
  function doneMinutes(set: Set<string>): number {
    let sum = 0;
    plan.days.forEach((day, index) => {
      for (const block of BLOCKS) if (set.has(`${index}-${block.key}`)) sum += day[block.key];
    });
    return sum;
  }
  function toPercent(minutes: number): number {
    return totalMinutes === 0 ? 0 : Math.round((minutes / totalMinutes) * 100);
  }
  const percent = toPercent(doneMinutes(checked));
  const reached = percent >= GOAL_PERCENT;

  function toggle(key: string) {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChecked(next);
    // 처음으로 80%에 닿는 순간 한 번만 축하한다
    if (!celebrated && toPercent(doneMinutes(next)) >= GOAL_PERCENT) {
      setCelebrated(true);
      setShowCelebration(true);
    }
  }

  return (
    <section aria-label="날짜별 계획표" className="mt-6">
      <h3 className="text-base font-semibold text-zinc-900">
        🗓️ 날짜별 계획표 <span className="text-sm font-normal text-zinc-500">(하루 {minutesPerDay}분)</span>
      </h3>

      {/* 실천 진행 막대 */}
      <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-zinc-800">계획 대비 실천</span>
          <span className={`font-semibold ${reached ? "text-emerald-600" : "text-zinc-700"}`}>
            {percent}% {reached && "· 목표 달성 🎉"}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="계획 대비 실천 비율"
          className="relative mt-2 h-3 overflow-hidden rounded-full bg-zinc-200"
        >
          <div
            className={`h-full rounded-full transition-all ${reached ? "bg-emerald-500" : "bg-blue-500"}`}
            style={{ width: `${percent}%` }}
          />
          {/* 목표(80%) 위치 표시 */}
          <div className="absolute top-0 h-full w-0.5 bg-zinc-500" style={{ left: `${GOAL_PERCENT}%` }} />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          공부를 마친 칸을 체크하세요. 시간(분) 기준으로 계산하고, {GOAL_PERCENT}%를 넘으면 목표 달성이에요. 새로고침하면 체크가 지워져요.
        </p>
      </div>

      {/* 80% 축하 (처음 닿았을 때 한 번) */}
      {showCelebration && (
        <div
          role="status"
          className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900"
        >
          <p className="text-sm">
            <span className="text-lg">🎉🎊</span> <strong>축하해요! 계획의 {GOAL_PERCENT}%를 실천했어요.</strong>
            <br />꾸준히 해낸 나를 칭찬해 주세요. 남은 계획도 힘내요!
          </p>
          <button
            type="button"
            onClick={() => setShowCelebration(false)}
            className="shrink-0 rounded border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            닫기
          </button>
        </div>
      )}

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
                {BLOCKS.map((block) => {
                  const key = `${index}-${block.key}`;
                  return (
                    <li key={block.key}>
                      <label
                        className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs ${block.color} ${
                          checked.has(key) ? "opacity-60 line-through" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked.has(key)}
                          onChange={() => toggle(key)}
                          className="h-3.5 w-3.5 accent-emerald-600"
                        />
                        <span>
                          {block.label} <span className="font-semibold">{day[block.key]}분</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
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
