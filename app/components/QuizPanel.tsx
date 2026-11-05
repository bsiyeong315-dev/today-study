"use client";

// 문제 풀기 화면 — Design Ref: DESIGN.md §2.2, §5.1, §5.4
// 개발 단위 8: 단원 고르기 → 문제 받기 → 답 입력
// 개발 단위 10: 채점하기 → 결과와 풀이
// 개발 단위 11: 틀린 문제가 있으면 복습 문제 풀기 → 복습 채점 (복습은 한 번만, 다시 틀리면 개념 설명)
// 개발 단위 12: 원래 세트를 채점하면 항상 "다음 세트" 버튼 (기본/심화는 규칙 9로 계산된 nextSet대로)

import { useRef, useState } from "react";
import { getUnitsBySubject, type Subject } from "@/lib/units";
import { checkAnswerInput, isBlankOrUnknown } from "@/lib/answerMatch";
import {
  ANSWER_MAX_LENGTH,
  MAX_REVIEW_QUESTIONS,
  type Difficulty,
  type GradeResult,
  type Question,
} from "@/lib/quiz";
import { SET_LABEL, describeNextSet } from "@/lib/quizFlow";
import QuizResult from "./QuizResult";

const SUBJECTS: Subject[] = ["공통수학1", "공통수학2", "기하"];

/** 난이도 배지 색 */
const BADGE_COLORS: Record<Difficulty, string> = {
  쉬움: "bg-emerald-100 text-emerald-800",
  응용: "bg-sky-100 text-sky-800",
  심화: "bg-violet-100 text-violet-800",
};

/** 원래 세트(main)와 복습 세트(review) */
type Stage = "main" | "review";

/** 문제 한 세트와 그 답·채점 결과 */
type Round = {
  /** 이 세트의 단원 (다음 세트를 같은 단원으로 받기 위해 기억한다) */
  unitId: string;
  set: "basic" | "advanced" | "review";
  questions: Question[];
  /** 정답이 잠겨 있는 토큰. 학생은 열어볼 수 없고, 채점할 때 서버로 다시 보낸다. */
  sealed: string;
  /** 문제 번호(q1, q2, ...)별 학생의 답 */
  answers: Record<string, string>;
  /** 답 칸별 검사 안내 */
  inputErrors: Record<string, string>;
  result: GradeResult | null;
};

type Loading = "questions" | "grade-main" | "review" | "grade-review" | null;

/** 화면에 보여줄 오류와, 버튼을 눌렀을 때 다시 할 일 */
type PanelError = { message: string; retry: (() => void) | null; retryLabel?: string };

const LOADING_TEXT: Record<Exclude<Loading, null>, string> = {
  questions: "AI가 문제를 만들고 정답을 확인하고 있어요.",
  "grade-main": "채점하고 풀이를 쓰고 있어요.",
  review: "틀린 문제와 같은 유형으로 복습 문제를 만들고 있어요.",
  "grade-review": "복습 문제를 채점하고 있어요.",
};

/** 서버에 JSON을 보내고 답을 받는다. 인터넷이 끊기면 null */
async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> } | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch {
    return null;
  }
}

const NETWORK_ERROR = "인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요.";

export default function QuizPanel() {
  const [unitId, setUnitId] = useState("");
  const [main, setMain] = useState<Round | null>(null);
  const [review, setReview] = useState<Round | null>(null);
  const [loading, setLoading] = useState<Loading>(null);
  const [error, setError] = useState<PanelError | null>(null);
  // 요청 번호. 기다리는 사이 단원을 바꾸면 늦게 온 예전 답은 버린다.
  const requestNumber = useRef(0);

  const getRound = (stage: Stage) => (stage === "main" ? main : review);
  const setRound = (stage: Stage, update: (round: Round) => Round) =>
    (stage === "main" ? setMain : setReview)((prev) => (prev ? update(prev) : prev));

  // 원래 세트에서 틀린 문제 번호
  const wrongIds = main?.result?.items.filter((item) => !item.correct).map((item) => item.id) ?? [];

  // ── 문제 받기 ──
  async function requestQuestions(set: "basic" | "advanced" = "basic", forUnit: string = unitId) {
    if (!forUnit) {
      setError({ message: "수학 단원을 목록에서 골라 주세요.", retry: null });
      return;
    }
    const myNumber = ++requestNumber.current;
    setLoading("questions");
    setError(null);
    const res = await postJson("/api/questions", { unitId: forUnit, set });
    if (myNumber !== requestNumber.current) return;
    setLoading(null);
    if (!res || !res.ok || !Array.isArray(res.data.questions)) {
      setError({
        message: (res?.data.error as string) ?? NETWORK_ERROR,
        retry: () => requestQuestions(set, forUnit),
      });
      return;
    }
    setMain({
      unitId: forUnit,
      set,
      questions: res.data.questions as Question[],
      sealed: res.data.sealed as string,
      answers: {},
      inputErrors: {},
      result: null,
    });
    setReview(null);
  }

  // ── 복습 문제 받기 (개발 단위 11) ──
  async function requestReview() {
    if (!main || wrongIds.length === 0 || review) return; // 복습은 한 번만 (규칙 8)
    const myNumber = ++requestNumber.current;
    setLoading("review");
    setError(null);
    const res = await postJson("/api/review", { sealed: main.sealed, wrongIds });
    if (myNumber !== requestNumber.current) return;
    setLoading(null);
    if (!res || !res.ok || !Array.isArray(res.data.questions)) {
      // 토큰이 만료되었거나 열리지 않으면 서버가 code로 알려준다 → 문제를 새로 받아야 한다
      const expired = res?.data.code === "NEED_NEW_QUESTIONS";
      setError({
        message: (res?.data.error as string) ?? NETWORK_ERROR,
        retry: expired ? () => requestQuestions(main.set === "advanced" ? "advanced" : "basic", main.unitId) : requestReview,
        retryLabel: expired ? "새 문제 받기" : undefined,
      });
      return;
    }
    setReview({
      unitId: main.unitId,
      set: "review",
      questions: res.data.questions as Question[],
      sealed: res.data.sealed as string,
      answers: {},
      inputErrors: {},
      result: null,
    });
  }

  // ── 채점하기 (원래 세트와 복습 세트 공통) ──
  async function grade(stage: Stage) {
    const round = getRound(stage);
    if (!round) return;

    // 1) 화면에서 먼저 답 칸 검사 (개인정보 → 허용 글자, DESIGN.md §6)
    const found: Record<string, string> = {};
    for (const q of round.questions) {
      const problem = checkAnswerInput(round.answers[q.id] ?? "");
      if (problem) found[q.id] = problem.message;
    }
    setRound(stage, (r) => ({ ...r, inputErrors: found }));
    if (Object.keys(found).length > 0) {
      setError({ message: "빨간 글씨로 표시된 답을 고쳐 주세요.", retry: null });
      return;
    }

    // 2) 잠금 토큰과 답만 보낸다 (문제 내용은 보내지 않음)
    const myNumber = ++requestNumber.current;
    setLoading(stage === "main" ? "grade-main" : "grade-review");
    setError(null);
    const res = await postJson("/api/grade", { sealed: round.sealed, answers: round.answers });
    if (myNumber !== requestNumber.current) return;
    setLoading(null);
    if (!res || !res.ok || !Array.isArray(res.data.items)) {
      // 토큰이 만료되었거나 열리지 않으면 서버가 code로 알려준다 → 문제를 새로 받아야 한다
      const expired = res?.data.code === "NEED_NEW_QUESTIONS";
      setError({
        message: (res?.data.error as string) ?? NETWORK_ERROR,
        retry: expired
          ? () => requestQuestions(main?.set === "advanced" ? "advanced" : "basic", main?.unitId)
          : res?.status === 400
            ? null
            : () => grade(stage),
        retryLabel: expired ? "새 문제 받기" : undefined,
      });
      return;
    }
    setRound(stage, (r) => ({ ...r, result: res.data as unknown as GradeResult }));
  }

  function changeUnit(id: string) {
    requestNumber.current += 1; // 기다리던 요청의 답은 무시한다
    setUnitId(id);
    setLoading(null);
    setError(null);
  }

  function changeAnswer(stage: Stage, id: string, value: string) {
    setRound(stage, (r) => {
      const inputErrors = { ...r.inputErrors };
      delete inputErrors[id]; // 고치는 중에는 그 칸의 안내를 지운다
      return { ...r, answers: { ...r.answers, [id]: value }, inputErrors };
    });
  }

  return (
    <div className="mt-4 space-y-5">
      {/* 1) 단원 고르기 + 문제 받기 */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1 text-sm font-medium text-zinc-800">
          <span className="sr-only">단원 고르기</span>
          <select
            value={unitId}
            onChange={(e) => changeUnit(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900"
          >
            <option value="">단원을 골라 주세요</option>
            {SUBJECTS.map((subject) => (
              <optgroup key={subject} label={subject}>
                {getUnitsBySubject(subject).map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => requestQuestions("basic")}
          disabled={loading !== null}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-300"
        >
          {loading === "questions" ? "문제 만드는 중…" : "문제 받기"}
        </button>
      </div>

      {/* 2) 원래 세트: 문제 → 채점 결과 */}
      {main && !main.result && (
        <QuestionForm
          stage="main"
          round={main}
          loading={loading}
          onAnswerChange={(id, value) => changeAnswer("main", id, value)}
          onSubmit={() => grade("main")}
        />
      )}
      {main?.result && <QuizResult result={main.result} questions={main.questions} />}

      {/* 3) 복습 문제 풀기 버튼 (틀린 문제가 있고, 아직 복습하지 않았을 때만: 규칙 8) */}
      {main?.result && wrongIds.length > 0 && !review && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <span className="text-sm text-amber-900">
            틀린 {wrongIds.length}문제와 같은 유형으로 복습 문제{" "}
            {Math.min(wrongIds.length, MAX_REVIEW_QUESTIONS)}개를 풀어 볼까요?
          </span>
          <button
            type="button"
            onClick={requestReview}
            disabled={loading !== null}
            className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-wait disabled:bg-amber-300"
          >
            {loading === "review" ? "만드는 중…" : "복습 문제 풀기"}
          </button>
        </div>
      )}

      {/* 4) 복습 세트: 문제 → 복습 채점 결과 (다시 틀리면 개념 설명) */}
      {review && !review.result && (
        <QuestionForm
          stage="review"
          round={review}
          loading={loading}
          onAnswerChange={(id, value) => changeAnswer("review", id, value)}
          onSubmit={() => grade("review")}
        />
      )}
      {review?.result && <QuizResult result={review.result} questions={review.questions} isReview />}
      {review?.result && (
        <p className="text-sm text-zinc-600">
          ✅ 복습을 마쳤어요. 복습은 한 번만 할 수 있어요. 다른 단원을 고르거나 새 문제를 받아 보세요.
        </p>
      )}

      {/* 5) 다음 세트 (개발 단위 12, 규칙 9). 원래 세트를 채점하면 항상 보여주고, 복습을 푸는 중에만 잠시 숨긴다. */}
      {main?.result?.nextSet && main.set !== "review" && (!review || review.result) && (
        <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-blue-900">{describeNextSet(main.set, main.result.nextSet)}</span>
          <button
            type="button"
            onClick={() => requestQuestions(main.result!.nextSet!, main.unitId)}
            disabled={loading !== null}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-300"
          >
            {loading === "questions" ? "문제 만드는 중…" : `다음: ${SET_LABEL[main.result.nextSet]} 풀기`}
          </button>
        </div>
      )}

      {/* 기다리는 중 / 오류 (화면 맨 아래, 방금 누른 버튼 가까이) */}
      {loading && (
        <p role="status" className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
          ⏳ {LOADING_TEXT[loading]} 잠시만 기다려 주세요.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>⚠️ {error.message}</span>
          {error.retry && (
            <button
              type="button"
              onClick={error.retry}
              className="shrink-0 rounded border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              {error.retryLabel ?? "다시 시도"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 문제와 답 입력칸 (채점 전). 원래 세트와 복습 세트가 같이 쓴다. */
function QuestionForm({
  stage,
  round,
  loading,
  onAnswerChange,
  onSubmit,
}: {
  stage: Stage;
  round: Round;
  loading: Loading;
  onAnswerChange: (id: string, value: string) => void;
  onSubmit: () => void;
}) {
  const blankCount = round.questions.filter((q) => isBlankOrUnknown(round.answers[q.id] ?? "")).length;
  const gradingThis = loading === (stage === "main" ? "grade-main" : "grade-review");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
      noValidate
    >
      <p className="text-sm font-semibold text-zinc-900">
        {round.set === "review" ? "🔁 복습 문제 (틀린 문제와 같은 유형)" : `📝 ${SET_LABEL[round.set]}`}
      </p>
      {/* 개인정보 안내 (PRD 7번 ②: 입력창 옆) */}
      <p className="text-xs text-amber-800">⚠️ 이름·학교·연락처는 적지 마세요.</p>

      <ol className="space-y-3">
        {round.questions.map((q, index) => (
          <li key={q.id} className="rounded-lg border border-zinc-200 p-4">
            <div className="flex items-start gap-2">
              <span className="font-semibold text-zinc-900">{index + 1}.</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${BADGE_COLORS[q.difficulty]}`}>
                {q.difficulty}
              </span>
              <p className="text-sm leading-6 text-zinc-800">{q.text}</p>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
              답
              <input
                type="text"
                value={round.answers[q.id] ?? ""}
                maxLength={ANSWER_MAX_LENGTH}
                onChange={(e) => onAnswerChange(q.id, e.target.value)}
                placeholder="예: 5, (4, 4), 2√3, 루트2"
                aria-label={`${stage === "review" ? "복습 " : ""}${index + 1}번 답`}
                aria-invalid={round.inputErrors[q.id] ? true : undefined}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-zinc-900 ${
                  round.inputErrors[q.id] ? "border-red-500" : "border-zinc-300"
                }`}
              />
            </label>
            {round.inputErrors[q.id] && <p className="mt-1 text-xs text-red-600">{round.inputErrors[q.id]}</p>}
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-end gap-3">
        {blankCount > 0 && <span className="text-xs text-zinc-500">빈 칸 {blankCount}개는 틀린 것으로 채점돼요</span>}
        <button
          type="submit"
          disabled={loading !== null}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-300"
        >
          {gradingThis ? "채점하는 중…" : stage === "review" ? "복습 채점하기" : "채점하기"}
        </button>
      </div>
    </form>
  );
}
