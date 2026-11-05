// 오늘공부 첫 화면 (개발 단위 2: 화면 뼈대)
// 한 화면 안에 "공부 계획"과 "문제 풀기" 두 영역을 둔다. (PRD 6번: 웹 화면 1개)
// 각 영역의 실제 입력칸과 기능은 다음 개발 단위에서 채운다.

import PlanForm from "./components/PlanForm";
import QuizPanel from "./components/QuizPanel";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-6 py-5">
          <h1 className="text-2xl font-bold text-zinc-900">오늘공부</h1>
          <p className="mt-1 text-sm text-zinc-600">
            남은 단원으로 공부 계획을 짜고, 난이도별 수학 문제를 풀어보세요.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-6">
        {/* 개인정보 안내 문구 (PRD 7번 ②: 사용자 대부분이 미성년자) */}
        <p
          role="note"
          className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          ⚠️ 이름·학교·연락처는 적지 마세요.
        </p>

        {/* 넓은 화면에서는 두 영역을 나란히, 좁은 화면에서는 위아래로 놓는다 */}
        <div className="grid gap-6 md:grid-cols-2">
          <section
            aria-labelledby="plan-title"
            className="rounded-xl border border-zinc-200 bg-white p-6"
          >
            <h2 id="plan-title" className="text-lg font-semibold text-zinc-900">
              📅 공부 계획
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              남은 단원과 공부 시간을 입력하면 날짜별 계획표를 만들어 드려요.
            </p>
            {/* 개발 단위 3: 계획 입력칸 (4~6에서 계획표가 이어서 들어간다) */}
            <PlanForm />
          </section>

          <section
            aria-labelledby="quiz-title"
            className="rounded-xl border border-zinc-200 bg-white p-6"
          >
            <h2 id="quiz-title" className="text-lg font-semibold text-zinc-900">
              ✏️ 문제 풀기
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              공부한 단원을 고르면 문제를 내고, 채점과 풀이까지 해 드려요.
            </p>
            {/* 개발 단위 8: 문제 풀이 화면 (9~12에서 채점·복습·다음 세트가 이어서 들어간다) */}
            <QuizPanel />
          </section>
        </div>
      </main>
    </div>
  );
}
