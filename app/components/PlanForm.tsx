"use client";

// 공부 계획 입력칸 (개발 단위 3) + 계획 가능 여부 검사 (개발 단위 4) + 계획 API 연결과 계획표 (개발 단위 6)
// 단원은 목록에서만 고르고(PRD 6번), 기간(일)과 하루 공부 시간(분)을 입력한다.
// 학생이 클릭하고 입력하는 화면이라 브라우저에서 동작하는 클라이언트 컴포넌트로 만든다.

import { useRef, useState, type FormEvent } from "react";
import { getUnitsBySubject, type Subject } from "@/lib/units";
import {
  DAYS_MAX,
  DAYS_MIN,
  INPUT_CHAR_LIMIT,
  MINUTES_MAX,
  MINUTES_MIN,
  countInputChars,
  validatePlanInput,
  type PlanInput,
} from "@/lib/planInput";
import { checkPlanFeasibility } from "@/lib/planFeasibility";
import type { StudyPlan } from "@/lib/studyPlan";
import PlanTable from "./PlanTable";

const SUBJECTS: Subject[] = ["공통수학1", "공통수학2", "기하"];

export default function PlanForm() {
  // 고른 단원 id 목록
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 숫자 입력칸은 지우고 다시 쓰는 중에도 자연스럽도록 글자 그대로 보관한다
  const [daysText, setDaysText] = useState("7");
  const [minutesText, setMinutesText] = useState("120");
  // 검사 결과 안내 문구
  const [errors, setErrors] = useState<string[]>([]);
  // 기간 안에 다 들어가지 않을 때 보여줄 안내 문구 (개발 단위 4)
  const [notFitMessage, setNotFitMessage] = useState<string | null>(null);
  // AI에게 계획을 요청하는 중인지
  const [loading, setLoading] = useState(false);
  // 계획 API가 실패했을 때 보여줄 안내 문구 (PRD 공통 예외 처리 3)
  const [apiError, setApiError] = useState<string | null>(null);
  // 다시 시도하면 해결될 수 있는 오류인지 (AI 오류·시간 초과·인터넷 끊김이면 true, 입력 오류면 false)
  const [canRetry, setCanRetry] = useState(false);
  // 받은 계획표와 계획을 만든 날
  const [result, setResult] = useState<{
    plan: StudyPlan;
    startDate: Date;
    minutesPerDay: number;
  } | null>(null);
  // 요청 번호. 기다리는 사이 입력을 바꾸면 늦게 온 예전 답은 버린다.
  const requestNumber = useRef(0);

  const input: PlanInput = {
    unitIds: selectedIds,
    days: Number(daysText),
    minutesPerDay: Number(minutesText),
  };
  const charCount = countInputChars(input);

  // 입력이 바뀌면 이전 결과(확인 문구, 기간 초과 안내)를 지운다
  function clearResults() {
    requestNumber.current += 1; // 기다리던 요청의 답은 무시한다
    setLoading(false);
    setResult(null);
    setApiError(null);
    setNotFitMessage(null);
  }

  // 단원 하나를 고르거나 빼기
  function toggleUnit(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    clearResults();
  }

  // 과목 단원 전체를 한 번에 고르거나 빼기
  function toggleSubject(subject: Subject) {
    const ids = getUnitsBySubject(subject).map((u) => u.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) =>
      allSelected ? prev.filter((x) => !ids.includes(x)) : [...new Set([...prev, ...ids])],
    );
    clearResults();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); // 페이지가 새로고침되지 않게 막는다
    clearResults();

    // 1단계: 입력값 검사 (개발 단위 3)
    const found = validatePlanInput(input);
    setErrors(found);
    if (found.length > 0) return;

    // 2단계: 기간 안에 다 들어가는지 검사 (개발 단위 4). 들어가지 않으면 AI에게 요청하지 않는다.
    const feasibility = checkPlanFeasibility(input);
    if (!feasibility.ok) {
      setNotFitMessage(feasibility.message);
      return;
    }

    // 3단계: 서버의 계획 API에 요청 (개발 단위 5). 입력 내용은 그대로 둔다.
    requestPlan(input);
  }

  async function requestPlan(planInput: PlanInput) {
    const myNumber = ++requestNumber.current;
    setLoading(true);
    setApiError(null);
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planInput),
      });
      const data = await response.json().catch(() => ({}));
      if (myNumber !== requestNumber.current) return; // 그사이 입력이 바뀌었으면 버린다
      if (!response.ok || !data.plan) {
        setApiError(data.error ?? "잠시 후 다시 시도해 주세요.");
        setCanRetry(response.status !== 400 && response.status !== 422);
        return;
      }
      setResult({ plan: data.plan, startDate: new Date(), minutesPerDay: planInput.minutesPerDay });
    } catch {
      // 인터넷이 끊긴 경우 등
      if (myNumber !== requestNumber.current) return;
      setApiError("인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.");
      setCanRetry(true);
    } finally {
      if (myNumber === requestNumber.current) setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-4 space-y-5" noValidate>
        {/* 1) 단원 고르기 */}
        <fieldset>
          <legend className="text-sm font-medium text-zinc-800">
            남은 단원 고르기 <span className="text-zinc-500">({selectedIds.length}개 선택)</span>
          </legend>
          <div className="mt-2 max-h-72 space-y-3 overflow-y-auto rounded-lg border border-zinc-200 p-3">
            {SUBJECTS.map((subject) => {
              const units = getUnitsBySubject(subject);
              const allSelected = units.every((u) => selectedIds.includes(u.id));
              return (
                <div key={subject}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-700">{subject}</p>
                    <button
                      type="button"
                      onClick={() => toggleSubject(subject)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {allSelected ? "전체 해제" : "전체 선택"}
                    </button>
                  </div>
                  <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {units.map((unit) => (
                      <li key={unit.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-zinc-700 hover:bg-zinc-50">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(unit.id)}
                            onChange={() => toggleUnit(unit.id)}
                            className="h-4 w-4 accent-blue-600"
                          />
                          <span>{unit.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </fieldset>

        {/* 2) 기간과 하루 공부 시간 */}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-zinc-800">
            공부할 기간 (일)
            <input
              type="number"
              inputMode="numeric"
              min={DAYS_MIN}
              max={DAYS_MAX}
              value={daysText}
              onChange={(e) => {
                setDaysText(e.target.value);
                clearResults();
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
            />
            <span className="mt-1 block text-xs font-normal text-zinc-500">
              {DAYS_MIN}~{DAYS_MAX}일
            </span>
          </label>
          <label className="text-sm font-medium text-zinc-800">
            하루 공부 시간 (분)
            <input
              type="number"
              inputMode="numeric"
              min={MINUTES_MIN}
              max={MINUTES_MAX}
              step={10}
              value={minutesText}
              onChange={(e) => {
                setMinutesText(e.target.value);
                clearResults();
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
            />
            <span className="mt-1 block text-xs font-normal text-zinc-500">
              {MINUTES_MIN}~{MINUTES_MAX}분
            </span>
          </label>
        </div>

        {/* 3) 글자 수와 제출 버튼 */}
        <div className="flex items-center justify-between">
          <span
            className={`text-xs ${charCount > INPUT_CHAR_LIMIT ? "text-red-600" : "text-zinc-500"}`}
          >
            입력 {charCount} / {INPUT_CHAR_LIMIT}자
          </span>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-300"
          >
            {loading ? "계획 만드는 중…" : "계획 만들기"}
          </button>
        </div>

        {/* 검사 결과 */}
        {errors.length > 0 && (
          <ul role="alert" className="space-y-1 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {errors.map((message) => (
              <li key={message}>• {message}</li>
            ))}
          </ul>
        )}
        {notFitMessage && (
          <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            ⏰ {notFitMessage}
          </p>
        )}
        {loading && (
          <p role="status" className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
            ⏳ AI가 계획표를 만들고 있어요. 잠시만 기다려 주세요.
          </p>
        )}
        {apiError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>⚠️ {apiError}</span>
            {/* 입력 오류(400)나 기간 초과(422)는 다시 시도해도 같으므로 버튼을 숨긴다 */}
            {canRetry && (
              <button
                type="button"
                onClick={() => requestPlan(input)}
                className="shrink-0 rounded border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                다시 시도
              </button>
            )}
          </div>
        )}
      </form>

      {/* 개발 단위 6: 받은 계획표 */}
      {result && (
        <PlanTable plan={result.plan} startDate={result.startDate} minutesPerDay={result.minutesPerDay} />
      )}
    </>
  );
}
