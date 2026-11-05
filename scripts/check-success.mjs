// 성공 기준 자동 점검 스크립트 (개발 단위 14) — Design Ref: DESIGN.md §9.5, PLAN.md SC-1~SC-7
//
// 하는 일
//  1) 계획표 10개를 만들어 하루 공부 시간 초과(SC-4)와 계획 규칙 위반을 센다. 걸린 시간(SC-1)도 잰다.
//  2) 문제 20개(기본 세트 3개 + 심화 세트 2개)를 만들어 난이도 표시 누락(SC-7)과 형식 위반을 센다. 걸린 시간(SC-2)도 잰다.
//  3) 각 세트를 빈 답으로 채점해서 정답과 단계별 풀이를 받는다. 걸린 시간(SC-3)도 잰다.
//  4) 문제·정답·풀이를 scripts/output/ 에 파일로 저장한다. → 박시영 님이 직접 풀어 정답·풀이(SC-5)와 범위(SC-6)를 확인한다.
//
// 실행 방법 (개발 서버가 켜져 있어야 한다)
//   npm run check                      ← http://localhost:3000 에 연결
//   npm run check -- http://localhost:3001   ← 다른 주소로 연결
//
// 이 스크립트는 API 키를 읽지 않는다. 내 컴퓨터의 개발 서버에만 요청을 보낸다.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "output");

/** PRD 3번 목표 시간 (밀리초) */
const LIMIT = { plan: 60_000, questions: 30_000, grade: 30_000 };

/** 단원 이름 (결과 파일을 읽기 쉽게 하려고 적어 둔다) */
const UNIT_NAMES = {
  "c1-polynomial-operations": "다항식의 연산",
  "c1-remainder-theorem": "나머지정리",
  "c1-factorization": "인수분해",
  "c1-complex-quadratic": "복소수와 이차방정식",
  "c1-quadratic-function": "이차방정식과 이차함수",
  "c1-equations-inequalities": "여러 가지 방정식과 부등식",
  "c1-counting": "경우의 수",
  "c1-permutation-combination": "순열과 조합",
  "c1-matrix": "행렬과 그 연산",
  "c2-plane-coordinates": "평면좌표",
  "c2-line-equation": "직선의 방정식",
  "c2-circle-equation": "원의 방정식",
  "c2-transformation": "도형의 이동",
  "c2-sets": "집합",
  "c2-propositions": "명제",
  "c2-functions": "함수",
  "c2-rational-irrational": "유리함수와 무리함수",
  "g-conic-sections": "이차곡선",
  "g-conic-tangent": "이차곡선과 직선",
  "g-space-figures": "공간도형",
  "g-space-coordinates": "공간좌표",
  "g-vector-operations": "벡터의 연산",
  "g-vector-dot-product": "벡터의 내적",
  "g-vector-figures": "도형의 방정식과 벡터",
};
const ALL_UNITS = Object.keys(UNIT_NAMES);
const C1 = ALL_UNITS.filter((id) => id.startsWith("c1-"));
const C2 = ALL_UNITS.filter((id) => id.startsWith("c2-"));
const G = ALL_UNITS.filter((id) => id.startsWith("g-"));

/** 계획표 10개: 여러 단원 수·기간·하루 시간 조합 (모두 기간 안에 들어가는 조합) */
const PLAN_CASES = [
  { unitIds: C2.slice(0, 2), days: 3, minutesPerDay: 120 },
  { unitIds: C2.slice(0, 4), days: 5, minutesPerDay: 120 },
  { unitIds: C2, days: 7, minutesPerDay: 160 },
  { unitIds: ["g-vector-dot-product"], days: 3, minutesPerDay: 60 },
  { unitIds: C1.slice(0, 3), days: 4, minutesPerDay: 90 },
  { unitIds: C1, days: 14, minutesPerDay: 120 },
  { unitIds: G.slice(0, 2), days: 2, minutesPerDay: 240 },
  { unitIds: G, days: 10, minutesPerDay: 150 },
  { unitIds: ["c1-counting", "c1-permutation-combination"], days: 1, minutesPerDay: 240 },
  { unitIds: ALL_UNITS, days: 30, minutesPerDay: 120 },
];

/** 문제 20개: 기본 세트 3개 + 심화 세트 2개 (서로 다른 5개 단원 × 4문제) */
const QUIZ_CASES = [
  { unitId: "c1-factorization", set: "basic" },
  { unitId: "c2-circle-equation", set: "basic" },
  { unitId: "g-space-coordinates", set: "basic" },
  { unitId: "c2-line-equation", set: "advanced" },
  { unitId: "g-vector-dot-product", set: "advanced" },
];
const EXPECTED = {
  basic: { 쉬움: 2, 응용: 2, 심화: 0 },
  advanced: { 쉬움: 0, 응용: 2, 심화: 2 },
};

// ─────────────────────────────────────────────

/** API에 요청하고 걸린 시간을 잰다 */
async function post(path, body) {
  const started = Date.now();
  try {
    const response = await fetch(BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, status: 0, data: { error: String(error) }, ms: Date.now() - started };
  }
}

const seconds = (ms) => (ms / 1000).toFixed(1) + "초";
const mark = (pass) => (pass ? "✅" : "❌");

/** 계획표 한 개를 검사해서 위반 내용을 돌려준다 (서버 검사와 별도로 한 번 더 센다) */
function checkPlan(plan, input) {
  const violations = [];
  let overTime = 0;
  if (plan.days.length !== input.days) violations.push(`기간 ${input.days}일인데 ${plan.days.length}일`);
  const started = new Set();
  plan.days.forEach((day, i) => {
    const total = day.concept + day.basic + day.applied + day.wrapup;
    if (total > input.minutesPerDay) {
      overTime += 1;
      violations.push(`${i + 1}일째 ${total}분 > ${input.minutesPerDay}분`);
    }
    if (day.newUnitIds.length > 2) violations.push(`${i + 1}일째 새 단원 ${day.newUnitIds.length}개`);
    day.newUnitIds.forEach((id) => started.add(id));
  });
  if (input.days >= 5 && plan.days.at(-1)?.type !== "review") violations.push("마지막 날이 복습일이 아님");
  const missing = input.unitIds.filter((id) => !started.has(id));
  if (missing.length > 0) violations.push(`빠진 단원 ${missing.length}개`);
  return { overTime, violations };
}

/** 문제 세트 한 개를 검사해서 위반 내용을 돌려준다 */
function checkQuestions(data, set) {
  const violations = [];
  let missingLabel = 0;
  const counts = { 쉬움: 0, 응용: 0, 심화: 0 };
  for (const q of data.questions ?? []) {
    if (!["쉬움", "응용", "심화"].includes(q.difficulty)) missingLabel += 1;
    else counts[q.difficulty] += 1;
    if ("answer" in q) violations.push(`${q.id} 화면 응답에 정답이 들어 있음 (규칙 4)`);
    if (/\\[a-zA-Z]+|\$|\^|sqrt/i.test(q.text)) violations.push(`${q.id} 수식 표기 규칙 위반 (규칙 11)`);
    if (/[①②③④⑤]/.test(q.text)) violations.push(`${q.id} 객관식 보기 있음 (규칙 10)`);
  }
  for (const d of ["쉬움", "응용", "심화"]) {
    if (counts[d] !== EXPECTED[set][d]) violations.push(`[${d}] ${counts[d]}개 (기대 ${EXPECTED[set][d]}개)`);
  }
  if (missingLabel > 0) violations.push(`난이도 표시 누락 ${missingLabel}개`);
  return { missingLabel, violations, count: (data.questions ?? []).length };
}

// ─────────────────────────────────────────────

async function main() {
  console.log(`오늘공부 성공 기준 자동 점검 — 서버: ${BASE_URL}\n`);
  const report = { startedAt: new Date().toISOString(), baseUrl: BASE_URL, plans: [], quizzes: [] };

  // 1) 계획표 10개
  console.log("① 계획표 10개 만들기");
  for (const [i, input] of PLAN_CASES.entries()) {
    const res = await post("/api/plan", input);
    const entry = { no: i + 1, input, status: res.status, ms: res.ms };
    if (res.ok) Object.assign(entry, checkPlan(res.data.plan, input));
    else Object.assign(entry, { overTime: 0, violations: [`실패: ${res.data.error ?? res.status}`] });
    report.plans.push(entry);
    console.log(
      `  ${String(i + 1).padStart(2)}. 단원 ${String(input.unitIds.length).padStart(2)}개 · ${input.days}일 · 하루 ${input.minutesPerDay}분 → ${res.status} ${seconds(res.ms)} ${entry.violations.length === 0 ? "규칙 위반 없음" : entry.violations.join(", ")}`,
    );
  }

  // 2) 문제 20개 + 3) 빈 답으로 채점해 정답·풀이 받기
  console.log("\n② 문제 20개 만들기 (기본 3세트 + 심화 2세트) → ③ 빈 답으로 채점해 정답·풀이 받기");
  for (const [i, c] of QUIZ_CASES.entries()) {
    const q = await post("/api/questions", c);
    const entry = { no: i + 1, ...c, status: q.status, ms: q.ms };
    if (!q.ok) {
      Object.assign(entry, { missingLabel: 0, count: 0, violations: [`실패: ${q.data.error ?? q.status}`] });
      report.quizzes.push(entry);
      console.log(`  ${i + 1}. ${UNIT_NAMES[c.unitId]} (${c.set === "basic" ? "기본" : "심화"}) → ${q.status} ${seconds(q.ms)} 실패: ${q.data.error}`);
      continue;
    }
    Object.assign(entry, checkQuestions(q.data, c.set));
    const g = await post("/api/grade", { sealed: q.data.sealed, answers: {} });
    entry.gradeStatus = g.status;
    entry.gradeMs = g.ms;
    entry.items = q.data.questions.map((question) => {
      const graded = g.ok ? g.data.items.find((it) => it.id === question.id) : null;
      return { ...question, answer: graded?.correctAnswer ?? "(채점 실패)", steps: graded?.steps ?? [] };
    });
    if (!g.ok) entry.violations.push(`채점 실패: ${g.data.error ?? g.status}`);
    report.quizzes.push(entry);
    console.log(
      `  ${i + 1}. ${UNIT_NAMES[c.unitId]} (${c.set === "basic" ? "기본" : "심화"}) → 출제 ${q.status} ${seconds(q.ms)}, 채점 ${g.status} ${seconds(g.ms)} ${entry.violations.length === 0 ? "형식 위반 없음" : entry.violations.join(", ")}`,
    );
  }

  // 4) 성공 기준 요약
  const planTimes = report.plans.map((p) => p.ms);
  const questionTimes = report.quizzes.map((q) => q.ms);
  const gradeTimes = report.quizzes.filter((q) => q.gradeMs).map((q) => q.gradeMs);
  const totalQuestions = report.quizzes.reduce((sum, q) => sum + (q.count ?? 0), 0);
  const summary = [
    { id: "SC-1", text: "계획표 1분 이내", value: `최대 ${seconds(Math.max(...planTimes))}`, pass: Math.max(...planTimes) <= LIMIT.plan },
    { id: "SC-2", text: "문제 받기 30초 이내", value: `최대 ${seconds(Math.max(...questionTimes))}`, pass: Math.max(...questionTimes) <= LIMIT.questions && report.quizzes.every((q) => q.status === 200) },
    { id: "SC-3", text: "채점·풀이 30초 이내", value: gradeTimes.length ? `최대 ${seconds(Math.max(...gradeTimes))}` : "측정 못 함", pass: gradeTimes.length === report.quizzes.length && Math.max(...gradeTimes) <= LIMIT.grade },
    { id: "SC-4", text: "계획표 10개 중 시간 초과 0건", value: `${report.plans.reduce((s, p) => s + p.overTime, 0)}건 (실패 ${report.plans.filter((p) => p.status !== 200).length}개)`, pass: report.plans.every((p) => p.status === 200 && p.overTime === 0) },
    { id: "SC-5", text: "문제 20개 중 정답·풀이 오류 1개 이하", value: "결과 파일을 직접 풀어 확인", pass: null },
    { id: "SC-6", text: "문제 20개 중 교육과정 밖 0건", value: "결과 파일을 직접 확인", pass: null },
    { id: "SC-7", text: "문제 20개 중 난이도 표시 누락 0건", value: `${report.quizzes.reduce((s, q) => s + (q.missingLabel ?? 0), 0)}건 (문제 ${totalQuestions}개)`, pass: totalQuestions === 20 && report.quizzes.every((q) => q.missingLabel === 0) },
  ];
  report.summary = summary;

  console.log("\n④ 성공 기준 요약");
  for (const s of summary) console.log(`  ${s.pass === null ? "📝" : mark(s.pass)} ${s.id} ${s.text}: ${s.value}`);

  // 5) 파일로 저장
  await mkdir(OUTPUT_DIR, { recursive: true });
  // 파일 이름에 넣을 내 컴퓨터 시각 (예: 20261104-1630)
  const now = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const mdPath = join(OUTPUT_DIR, `check-${stamp}.md`);
  const jsonPath = join(OUTPUT_DIR, `check-${stamp}.json`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(mdPath, toMarkdown(report), "utf8");
  console.log(`\n저장했어요:\n  ${mdPath}\n  ${jsonPath}`);
  console.log("결과 파일의 문제 20개를 직접 풀어 보고, '확인' 칸에 O/X를 적어 SC-5·SC-6을 판단해 주세요.");
}

/** 사람이 읽고 직접 확인하기 좋은 마크다운으로 만든다 */
function toMarkdown(report) {
  const lines = [];
  lines.push("# 오늘공부 성공 기준 점검 결과", "");
  lines.push(`- 점검 시각: ${new Date(report.startedAt).toLocaleString("ko-KR")}`, `- 서버: ${report.baseUrl}`, "");
  lines.push("## 성공 기준 요약", "", "| 기준 | 내용 | 결과 | 판정 |", "|---|---|---|---|");
  for (const s of report.summary) lines.push(`| ${s.id} | ${s.text} | ${s.value} | ${s.pass === null ? "📝 직접 확인" : mark(s.pass)} |`);
  lines.push("", "## 계획표 10개", "", "| # | 단원 수 | 기간 | 하루 | 상태 | 시간 | 규칙 위반 |", "|---|---|---|---|---|---|---|");
  for (const p of report.plans) {
    lines.push(`| ${p.no} | ${p.input.unitIds.length} | ${p.input.days}일 | ${p.input.minutesPerDay}분 | ${p.status} | ${seconds(p.ms)} | ${p.violations.length ? p.violations.join("; ") : "없음"} |`);
  }
  lines.push("", "## 문제 20개 (직접 풀어 확인하기)", "");
  lines.push("> 각 문제를 직접 풀어 보고 **확인** 칸에 적어 주세요.", "> - 정답·풀이가 맞으면 O, 틀리면 X (SC-5: X가 1개 이하면 통과)", "> - 고른 단원 밖이거나 고등학교 교육과정 밖이면 '범위 밖' (SC-6: 0건이어야 통과)", "");
  let n = 0;
  for (const q of report.quizzes) {
    lines.push(`### ${q.no}. ${UNIT_NAMES[q.unitId]} — ${q.set === "basic" ? "기본 세트" : "심화 세트"} (출제 ${seconds(q.ms)}${q.gradeMs ? `, 채점 ${seconds(q.gradeMs)}` : ""})`, "");
    if (q.violations.length) lines.push(`⚠️ 형식 위반: ${q.violations.join("; ")}`, "");
    for (const item of q.items ?? []) {
      n += 1;
      lines.push(`**문제 ${n}. [${item.difficulty}]** ${item.text}`, "");
      lines.push(`- 정답: \`${item.answer}\``);
      if (item.steps.length) lines.push(`- 풀이: ${item.steps.map((s, i) => `${i + 1}) ${s}`).join(" ")}`);
      lines.push("- 확인: ☐ 정답·풀이 맞음 ☐ 틀림 ☐ 범위 밖", "");
    }
  }
  return lines.join("\n");
}

main().catch((error) => {
  console.error("점검 중 오류:", error);
  process.exit(1);
});
