// 답 칸 검사와 같은 값 비교 (개발 단위 9) — Design Ref: DESIGN.md §2.2, §6
// 화면과 서버가 함께 쓴다.
// - 답 칸 검사: 개인정보 → 허용 글자 순서로 검사 (PRD 공통 예외 1, 2)
// - 같은 값 비교: 코드가 "같음 / 다름 / 판단 불가"로 판단한다. 같음·다름은 코드 판단이 최종이다. (must 2 규칙 12)

/** 모른다는 뜻으로 받아들이는 답 (빈 칸과 똑같이 X로 채점, 규칙 13) */
const UNKNOWN_WORDS = ["모르겠어요", "모르겠음", "모르겠다", "몰라요", "모름"];

/** 답 칸에 쓸 수 있는 글자 ("루트"는 따로 허용) */
const ALLOWED_CHARS = /^[0-9\s+\-.,()√/²³π°]+$/;

/** 빈 칸이거나 "모르겠어요"인지 */
export function isBlankOrUnknown(answer: string): boolean {
  const text = answer.trim().replace(/[.!?~\s]/g, "");
  return text === "" || UNKNOWN_WORDS.includes(text);
}

/** 개인정보로 보이는지 (전화번호, 이메일, 학교·이름 낱말) */
export function looksLikePersonalInfo(answer: string): boolean {
  if (/\d{2,3}-\d{3,4}-\d{4}/.test(answer)) return true; // 전화번호 모양
  if (/\d{9,}/.test(answer.replace(/[\s-]/g, ""))) return true; // 숫자 9자리 이상 연속
  if (answer.includes("@")) return true; // 이메일 모양
  if (/(학교|고등학교|중학교|이름)/.test(answer)) return true;
  return false;
}

/**
 * 답 하나를 검사한다. 문제가 없으면 null, 있으면 학생에게 보여줄 안내 문구.
 * 빈 칸과 "모르겠어요"는 통과시킨다 (X로 채점).
 */
export function checkAnswerInput(answer: string): { kind: "personal" | "chars"; message: string } | null {
  if (isBlankOrUnknown(answer)) return null;
  // 1) 개인정보 검사 먼저
  if (looksLikePersonalInfo(answer)) {
    return { kind: "personal", message: "개인정보는 빼고 다시 입력해 주세요." };
  }
  // 2) 허용 글자 검사 ("루트"는 √로 보고 검사)
  if (!ALLOWED_CHARS.test(answer.replace(/루트/g, "√"))) {
    return { kind: "chars", message: "숫자나 좌표로 답을 적어 주세요." };
  }
  return null;
}

// ─────────────────────────────────────────────
// 같은 값 비교
// ─────────────────────────────────────────────

export type MatchVerdict = "same" | "different" | "unknown";

/** 비교하기 쉽게 모양을 다듬는다: 띄어쓰기·도(°) 빼기, 루트→√, 여러 가지 빼기 기호 통일 */
function normalize(text: string): string {
  return text
    .trim()
    .replace(/루트/g, "√")
    .replace(/[−–—]/g, "-")
    .replace(/[\s°]/g, "")
    .replace(/\.$/, "");
}

/** 좌표 괄호를 벗기고 쉼표로 나눈다. "(4,4)" → ["4","4"], "5" → ["5"] */
function splitParts(text: string): string[] {
  let t = text;
  if (t.startsWith("(") && t.endsWith(")") && t.includes(",")) t = t.slice(1, -1);
  return t.split(",");
}

/**
 * 아주 작은 계산기: 숫자, + - / , 괄호, √, ², ³, π, 곱하기 생략(2√3)을 계산한다.
 * 계산할 수 없는 모양이면 null을 돌려준다. (eval을 쓰지 않고 한 글자씩 읽는다)
 */
function evaluate(expression: string): number | null {
  let pos = 0;
  const s = expression;

  const peek = () => s[pos];
  const startsPrimary = (c: string | undefined) => !!c && /[0-9.π√(]/.test(c);

  function parseExpr(): number {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = s[pos++];
      const right = parseTerm();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }
  function parseTerm(): number {
    let value = parseUnary();
    for (;;) {
      if (peek() === "/") {
        pos++;
        value /= parseUnary();
      } else if (peek() === "*" || peek() === "×") {
        pos++;
        value *= parseUnary();
      } else if (startsPrimary(peek())) {
        value *= parseUnary(); // 곱하기 생략: 2√3, 2π, 3(1+2)
      } else break;
    }
    return value;
  }
  function parseUnary(): number {
    if (peek() === "-") {
      pos++;
      return -parseUnary();
    }
    if (peek() === "+") {
      pos++;
      return parseUnary();
    }
    return parsePower();
  }
  function parsePower(): number {
    let value = parsePrimary();
    while (peek() === "²" || peek() === "³") {
      value = s[pos++] === "²" ? value ** 2 : value ** 3;
    }
    return value;
  }
  function parsePrimary(): number {
    const c = peek();
    if (c === "(") {
      pos++;
      const value = parseExpr();
      if (peek() !== ")") throw new Error("괄호");
      pos++;
      return value;
    }
    if (c === "π") {
      pos++;
      return Math.PI;
    }
    if (c === "√") {
      pos++;
      const inner = parsePower(); // √3² 는 √(3²)로 읽는다
      if (inner < 0) throw new Error("음수 제곱근");
      return Math.sqrt(inner);
    }
    const match = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(pos));
    if (!match) throw new Error("숫자 아님");
    pos += match[0].length;
    return Number(match[0]);
  }

  try {
    if (!s) return null;
    const value = parseExpr();
    if (pos !== s.length || !Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}

/** 두 수가 같은지 (계산 오차는 무시) */
function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * 학생 답과 정답이 같은 값인지 판단한다.
 * - same: 같은 값 (예: 1/2 와 0.5, (4,4) 와 4, 4, √2 와 루트2)
 * - different: 다른 값
 * - unknown: 코드로 계산할 수 없는 모양이라 판단 불가 → 이 경우에만 AI에게 묻는다
 */
export function compareAnswers(student: string, correct: string): MatchVerdict {
  const a = normalize(student);
  const b = normalize(correct);
  if (a === b) return "same";

  const partsA = splitParts(a);
  const partsB = splitParts(b);
  const valuesA = partsA.map(evaluate);
  const valuesB = partsB.map(evaluate);

  // 둘 중 하나라도 계산할 수 없으면 판단 불가
  if (valuesA.some((v) => v === null) || valuesB.some((v) => v === null)) return "unknown";
  // 좌표의 칸 수가 다르면 다른 답 (예: 정답은 좌표인데 숫자 하나만 씀)
  if (valuesA.length !== valuesB.length) return "different";
  return valuesA.every((v, i) => nearlyEqual(v as number, valuesB[i] as number)) ? "same" : "different";
}
