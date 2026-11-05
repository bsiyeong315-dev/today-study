// 채점 결과 보여주기 (개발 단위 10) — Design Ref: DESIGN.md §5.4
// 문제마다 O/X, 학생 답, 정답, 단계별 풀이, 틀린 곳 한 줄을 보여주고
// 맨 위에 "4문제 중 3문제 정답"을 보여준다. (PRD must 2 규칙 5, 6)

import type { GradeResult, Question } from "@/lib/quiz";

type Props = {
  result: GradeResult;
  /** 문제 내용을 다시 보여주기 위해 받는다 (번호 순서 그대로) */
  questions: Question[];
  /** 복습 문제 채점 결과인지 (복습이면 제목이 달라진다) */
  isReview?: boolean;
};

export default function QuizResult({ result, questions, isReview = false }: Props) {
  const allCorrect = result.correctCount === result.total;
  return (
    <section aria-label={isReview ? "복습 채점 결과" : "채점 결과"} className="space-y-3">
      {/* 맞은 개수 (규칙 5) */}
      <p
        role="status"
        className={`rounded-lg px-4 py-3 text-base font-semibold ${
          allCorrect ? "bg-green-50 text-green-800" : "bg-zinc-100 text-zinc-900"
        }`}
      >
        {isReview ? "복습 결과: " : ""}
        {result.total}문제 중 {result.correctCount}문제 정답 {allCorrect ? "🎉" : ""}
      </p>

      <ol className="space-y-3">
        {result.items.map((item, index) => {
          const question = questions.find((q) => q.id === item.id);
          return (
            <li
              key={item.id}
              className={`rounded-lg border p-4 ${
                item.correct ? "border-green-300 bg-green-50/40" : "border-red-300 bg-red-50/40"
              }`}
            >
              {/* O/X와 문제 */}
              <div className="flex items-start gap-2">
                <span
                  aria-label={item.correct ? "정답" : "오답"}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                    item.correct ? "bg-green-600" : "bg-red-500"
                  }`}
                >
                  {item.correct ? "O" : "X"}
                </span>
                <p className="text-sm leading-6 text-zinc-800">
                  <span className="font-semibold">{index + 1}.</span> [{item.difficulty}] {question?.text}
                </p>
              </div>

              {/* 내 답과 정답 */}
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded bg-white px-3 py-1.5">
                  <dt className="text-xs text-zinc-500">내 답</dt>
                  <dd className="font-medium text-zinc-900">{item.studentAnswer || "(비어 있음)"}</dd>
                </div>
                <div className="rounded bg-white px-3 py-1.5">
                  <dt className="text-xs text-zinc-500">정답</dt>
                  <dd className="font-medium text-zinc-900">{item.correctAnswer}</dd>
                </div>
              </dl>

              {/* 틀린 곳 한 줄 (규칙 6) */}
              {item.mistake && <p className="mt-2 text-sm text-red-700">❗ {item.mistake}</p>}

              {/* 복습 문제를 또 틀렸을 때 개념 설명 (규칙 8) */}
              {item.concept && (
                <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">📘 {item.concept}</p>
              )}

              {/* 단계별 풀이 (규칙 6) */}
              <details className="mt-2" open={!item.correct}>
                <summary className="cursor-pointer text-sm font-medium text-blue-700">풀이 보기</summary>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
                  {item.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
