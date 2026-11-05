// 문제 출제의 모양과 검사 규칙 (개발 단위 7, PRD must 2 규칙 1~4, 10, 11)

/** 난이도 (규칙 2) */
export type Difficulty = "쉬움" | "응용" | "심화";

/** 한 세트의 난이도 구성 */
export type Composition = Record<Difficulty, number>;

/** 세트 종류 (규칙 1, 9) */
export type QuizSet = "basic" | "advanced";

/** 세트 종류별 구성. basic: [쉬움] 2 + [응용] 2, advanced: [응용] 2 + [심화] 2 */
export const COMPOSITIONS: Record<QuizSet, Composition> = {
  basic: { 쉬움: 2, 응용: 2, 심화: 0 },
  advanced: { 쉬움: 0, 응용: 2, 심화: 2 },
};

/** 한 번에 낼 수 있는 최대 문제 수 (규칙 1) */
export const MAX_QUESTIONS = 10;

/** 화면으로 보내는 문제 (정답과 풀이는 넣지 않는다: 규칙 4) */
export type Question = {
  /** 문제 번호 (q1, q2, ...) */
  id: string;
  difficulty: Difficulty;
  /** 문제 내용 */
  text: string;
};

/** AI가 만든 문제 (정답 포함). 서버 안에서만 쓰고, 정답은 화면으로 보내지 않는다. */
export type GeneratedQuestion = {
  difficulty: Difficulty;
  text: string;
  answer: string;
};

/** OpenAI에 "이 모양으로만 답해"라고 알려주는 JSON 스키마 */
export const QUESTIONS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["difficulty", "text", "answer"],
        properties: {
          difficulty: { type: "string", enum: ["쉬움", "응용", "심화"] },
          text: { type: "string" },
          answer: { type: "string" },
        },
      },
    },
  },
};

/** 구성의 전체 문제 수 */
export function countOf(composition: Composition): number {
  return composition.쉬움 + composition.응용 + composition.심화;
}

/** 구성을 "[쉬움] 2개, [응용] 2개" 같은 문장으로 만든다 */
export function describeComposition(composition: Composition): string {
  return (Object.keys(composition) as Difficulty[])
    .filter((d) => composition[d] > 0)
    .map((d) => `[${d}] ${composition[d]}개`)
    .join(", ");
}

/** 정답으로 쓸 수 있는 글자: 숫자, 부호, 소수점, 쉼표, 괄호, √, 분수(/), ²·³, π, ° (규칙 10) */
const ANSWER_PATTERN = /^[0-9\s+\-.,()√/²³π°]+$/;

/** 수식 표기 규칙(규칙 11)에 어긋나는 표현 */
const FORBIDDEN_NOTATION: { pattern: RegExp; label: string }[] = [
  { pattern: /\\[a-zA-Z]+/, label: "LaTeX 명령어(\\frac, \\sqrt 등)" },
  { pattern: /\$/, label: "$ 기호" },
  { pattern: /sqrt/i, label: "sqrt (√로 써야 함)" },
  { pattern: /\^/, label: "^ 기호 (²·³로 써야 함)" },
];

/**
 * AI가 만든 문제가 규칙을 지키는지 검사한다.
 * 어긴 점을 한국어 문장 목록으로 돌려준다. 문제가 없으면 빈 목록.
 */
export function validateQuestions(questions: GeneratedQuestion[], composition: Composition): string[] {
  const errors: string[] = [];
  if (!Array.isArray(questions)) return ["문제 목록 형식이 올바르지 않습니다."];

  const total = countOf(composition);
  if (questions.length !== total) errors.push(`문제는 정확히 ${total}개여야 하는데 ${questions.length}개입니다.`);
  if (questions.length > MAX_QUESTIONS) errors.push(`문제는 최대 ${MAX_QUESTIONS}개까지입니다.`);

  // 난이도 구성 (규칙 1, 2)
  for (const difficulty of Object.keys(composition) as Difficulty[]) {
    const count = questions.filter((q) => q.difficulty === difficulty).length;
    if (count !== composition[difficulty]) {
      errors.push(`[${difficulty}] 문제가 ${composition[difficulty]}개여야 하는데 ${count}개입니다.`);
    }
  }

  questions.forEach((q, i) => {
    const label = `${i + 1}번 문제`;
    if (!q.text?.trim()) errors.push(`${label} 내용이 비어 있습니다.`);
    if (q.text && q.text.length > 300) errors.push(`${label}가 300자를 넘습니다.`);
    // 주관식 단답형 (규칙 10): 정답이 있어야 하고, 짧아야 한다
    if (!q.answer?.trim()) errors.push(`${label}의 정답이 비어 있습니다.`);
    if (q.answer && q.answer.length > 30) errors.push(`${label}의 정답이 너무 깁니다. 숫자나 좌표 하나로 답할 수 있어야 합니다.`);
    // 정답에는 숫자·좌표에 쓰는 기호만 들어가야 한다 (x, y 같은 문자가 들어간 식은 안 됨)
    if (q.answer && !ANSWER_PATTERN.test(q.answer.trim())) {
      errors.push(`${label}의 정답 "${q.answer}"이 숫자나 좌표가 아닙니다. 식이 아니라 값 하나를 묻도록 문제를 바꿔야 합니다.`);
    }
    // 객관식 보기 금지 (규칙 10)
    if (/[①②③④⑤]/.test(q.text ?? "")) errors.push(`${label}에 객관식 보기가 있습니다.`);
    // 수식 표기 (규칙 11)
    for (const { pattern, label: what } of FORBIDDEN_NOTATION) {
      if (pattern.test(q.text ?? "") || pattern.test(q.answer ?? "")) {
        errors.push(`${label}에 ${what}가 쓰였습니다.`);
      }
    }
  });

  return [...new Set(errors)];
}

/** 정답까지 들어 있는 문제 (번호 포함). 서버와 정답 잠금 토큰 안에서만 쓴다. */
export type NumberedQuestion = Question & { answer: string };

/** 쉬움 → 응용 → 심화 순서로 정렬하고 q1, q2, ... 번호를 붙인다 */
export function numberQuestions(questions: GeneratedQuestion[]): NumberedQuestion[] {
  const order: Record<Difficulty, number> = { 쉬움: 0, 응용: 1, 심화: 2 };
  return [...questions]
    .sort((a, b) => order[a.difficulty] - order[b.difficulty])
    .map((q, i) => ({ id: `q${i + 1}`, difficulty: q.difficulty, text: q.text.trim(), answer: q.answer.trim() }));
}

/** 정답을 뺀 화면용 문제로 바꾼다 (규칙 4) */
export function toPublicQuestions(questions: NumberedQuestion[]): Question[] {
  return questions.map(({ id, difficulty, text }) => ({ id, difficulty, text }));
}

// ─────────────────────────────────────────────
// 채점 결과 (개발 단위 9) — Design Ref: DESIGN.md §3
// ─────────────────────────────────────────────

/** 답 하나의 최대 글자 수 */
export const ANSWER_MAX_LENGTH = 30;

/** 학생이 입력한 답 전체의 최대 글자 수 (PRD 7번 ③) */
export const ANSWERS_TOTAL_LIMIT = 500;

/** 채점 결과 — 문제 하나 */
export type GradeItem = {
  id: string;
  difficulty: Difficulty;
  /** O(true) / X(false) */
  correct: boolean;
  studentAnswer: string;
  /** 채점 뒤에만 보여주는 정답 */
  correctAnswer: string;
  /** 단계별 풀이 */
  steps: string[];
  /** 틀린 곳 한 줄 (맞으면 null) */
  mistake: string | null;
  /** 복습 문제를 또 틀렸을 때만 짧은 개념 설명 */
  concept: string | null;
};

/** 채점 결과 — 전체 */
export type GradeResult = {
  items: GradeItem[];
  correctCount: number;
  total: number;
  /** 원래 세트 채점이면 다음 세트 종류, 복습 채점이면 null */
  nextSet: QuizSet | null;
};

// ─────────────────────────────────────────────
// 복습 문제 (개발 단위 11) — PRD must 2 규칙 7, 8
// ─────────────────────────────────────────────

/** 한 번에 내는 복습 문제의 최대 개수 (규칙 7) */
export const MAX_REVIEW_QUESTIONS = 5;

/**
 * 틀린 문제의 난이도로 복습 문제 난이도를 정한다. (규칙 7: 같거나 한 단계 쉬운 난이도)
 * [쉬움] → [쉬움], [응용] → [응용], [심화] → [응용]
 */
export function reviewDifficultyOf(original: Difficulty): Difficulty {
  return original === "심화" ? "응용" : original;
}
