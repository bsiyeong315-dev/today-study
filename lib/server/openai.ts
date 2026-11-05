// OpenAI 호출 도우미 (서버 전용)
// ⚠️ 이 파일은 서버 쪽 코드(app/api/...)에서만 불러온다. API 키가 들어 있으므로 화면 코드에서 import하지 않는다.
// 새 패키지를 설치하지 않고, 기본 fetch로 OpenAI Chat Completions API를 부른다.

/** 사용할 모델. .env에 OPENAI_MODEL을 넣으면 그 값을 쓰고, 없으면 기본값을 쓴다. */
const DEFAULT_MODEL = "gpt-5.4-mini";

/** 한 번 요청을 기다리는 최대 시간 (PRD 공통 예외 처리 3: 30초) */
const TIMEOUT_MS = 30_000;

/** 학생에게 그대로 보여줄 수 있는 오류 (한국어 문구 + HTTP 상태 코드) */
export class AiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * OpenAI에 메시지를 보내고, JSON 스키마 모양 그대로의 답을 받아 객체로 돌려준다.
 * 실패하면 학생에게 보여줄 한국어 문구가 담긴 AiError를 던진다.
 */
export async function askOpenAiJson<T>(options: {
  messages: ChatMessage[];
  schemaName: string;
  schema: object;
  /** AI가 생각하는 양. 정확도가 중요하면 "medium", 빠른 답이 중요하면 "low" (기본값) */
  reasoningEffort?: "low" | "medium";
  /** 이번 호출에 기다릴 최대 시간(밀리초). 없으면 30초. 30초를 넘게 줄 수는 없다. */
  timeoutMs?: number;
}): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // 키 값은 로그에도 남기지 않는다. 없다는 사실만 알린다.
    throw new AiError("서버 설정에 문제가 있어요. 잠시 후 다시 시도해 주세요.", 500);
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        reasoning_effort: options.reasoningEffort ?? "low", // 기본은 빠르게 답하도록 생각하는 양을 줄인다
        messages: options.messages,
        response_format: {
          type: "json_schema",
          json_schema: { name: options.schemaName, strict: true, schema: options.schema },
        },
      }),
      signal: AbortSignal.timeout(Math.max(1, Math.min(options.timeoutMs ?? TIMEOUT_MS, TIMEOUT_MS))),
    });
  } catch {
    // 시간 초과나 인터넷 끊김
    throw new AiError("AI 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.", 504);
  }

  if (response.status === 429) {
    throw new AiError("지금 요청이 많아요. 잠시 후 다시 시도해 주세요.", 429);
  }
  if (!response.ok) {
    // 자세한 원인은 서버 로그에만 남긴다 (키 값은 들어 있지 않다)
    console.error("OpenAI 오류:", response.status, await response.text().catch(() => ""));
    throw new AiError("AI에게 요청하는 중에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.", 502);
  }

  const data = await response.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new AiError("AI가 답을 주지 않았어요. 잠시 후 다시 시도해 주세요.", 502);
  }
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new AiError("AI의 답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.", 502);
  }
}
