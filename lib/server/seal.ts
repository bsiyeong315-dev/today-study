// 정답 잠금 / 풀기 (서버 전용) — Design Ref: DESIGN.md §3, §7
// ⚠️ 서버 쪽 코드(app/api/...)에서만 불러온다. 화면 코드에서 import하지 않는다.
//
// 문제와 정답을 서버만 열 수 있는 자물쇠(AES-256-GCM)로 잠가 "토큰" 글자로 만든다.
// 이 토큰을 문제와 함께 화면에 보내 두었다가, 채점할 때 다시 받아 풀어서 출제 때 정답으로 채점한다.
// 데이터베이스 없이도 정답을 화면에 노출하지 않을 수 있다. (PRD must 2 규칙 4)
// 누가 토큰을 한 글자라도 고치면 풀리지 않는다.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { Difficulty } from "@/lib/quiz";

/** 토큰 유효 시간: 3시간 */
const TOKEN_LIFETIME_MS = 3 * 60 * 60 * 1000;

/** 토큰 안에 든 내용 */
export type SealedQuiz = {
  unitId: string;
  set: "basic" | "advanced" | "review";
  questions: { id: string; difficulty: Difficulty; text: string; answer: string }[];
  /** 이 시각(밀리초)이 지나면 채점을 거부한다 */
  expiresAt: number;
};

/** 토큰을 풀 수 없을 때의 오류. invalid: 고쳐졌거나 형식이 틀림, expired: 시간이 지남 */
export class SealError extends Error {
  constructor(public reason: "invalid" | "expired") {
    super(reason === "expired" ? "토큰 유효 시간이 지났어요." : "토큰을 열 수 없어요.");
  }
}

/**
 * 잠금 열쇠(32바이트)를 만든다.
 * 새 비밀 값을 따로 두지 않고 OPENAI_API_KEY에서 만든다. (키 값 자체는 어디에도 출력하지 않는다)
 * OPENAI_API_KEY를 바꾸면 열쇠도 바뀌어, 이미 나간 토큰은 풀리지 않는다.
 */
function getKey(): Buffer {
  const secret = process.env.OPENAI_API_KEY;
  if (!secret) throw new SealError("invalid");
  return Buffer.from(hkdfSync("sha256", secret, "today-study", "quiz-answer-seal", 32));
}

/** 내용을 잠가 토큰 글자로 만든다 */
export function seal(quiz: Omit<SealedQuiz, "expiresAt">): string {
  const payload: SealedQuiz = { ...quiz, expiresAt: Date.now() + TOKEN_LIFETIME_MS };
  const iv = randomBytes(12); // 잠글 때마다 새로 만드는 값 (같은 내용도 매번 다른 토큰이 된다)
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // 고쳐졌는지 확인하는 값
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

/** 토큰을 풀어 내용을 돌려준다. 고쳐졌거나 시간이 지났으면 SealError를 던진다. */
export function unseal(token: string): SealedQuiz {
  let payload: SealedQuiz;
  try {
    const data = Buffer.from(token, "base64url");
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    payload = JSON.parse(text);
  } catch {
    throw new SealError("invalid");
  }
  if (Date.now() > payload.expiresAt) throw new SealError("expired");
  return payload;
}
