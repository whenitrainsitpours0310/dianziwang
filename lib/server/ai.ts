import { ServiceError } from "@/lib/server/errors";
import type { AiRuntimeConfig } from "@/lib/server/config";

export const AI_TIMEOUT_MS = 35_000;

export interface AiPrompt {
  system: string;
  user: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

function completionUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) return base;
  return `${base}/chat/completions`;
}

function contentToText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((part) =>
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .filter(Boolean);
    return parts.length ? parts.join("\n") : null;
  }
  return null;
}

export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new ServiceError(
      "AI_INVALID_OUTPUT",
      "模型返回了空内容，未生成报告。",
    );
  }
  if (trimmed.length > 120_000) {
    throw new ServiceError(
      "AI_INVALID_OUTPUT",
      "模型返回内容过长，已拒绝生成报告。",
    );
  }

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  const candidate =
    start >= 0 && end > start
      ? withoutFence.slice(start, end + 1)
      : withoutFence;

  try {
    return JSON.parse(candidate);
  } catch {
    throw new ServiceError(
      "AI_INVALID_OUTPUT",
      "模型返回的内容不是合法 JSON，已拒绝生成报告。",
    );
  }
}

/**
 * OpenAI 兼容的 Chat Completions 适配器。
 * 使用 Authorization: Bearer，密钥只存在于服务端请求头。
 * 不启用 response_format，以兼容未实现 JSON mode 的兼容端点；
 * 结构由服务端 schema 校验兜底。
 */
export async function requestAiAnalysis(params: {
  config: AiRuntimeConfig;
  prompt: AiPrompt;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  maxTokens?: number;
}): Promise<unknown> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const timeoutSignal = AbortSignal.timeout(AI_TIMEOUT_MS);
  const signal = params.signal
    ? AbortSignal.any([params.signal, timeoutSignal])
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetchImpl(completionUrl(params.config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.config.apiKey}`,
      },
      body: JSON.stringify({
        model: params.config.model,
        messages: [
          { role: "system", content: params.prompt.system },
          { role: "user", content: params.prompt.user },
        ],
        temperature: 0.3,
        max_tokens: params.maxTokens ?? 2400,
        stream: false,
      }),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new ServiceError(
      "AI_FAILED",
      timedOut
        ? `模型请求超时（${AI_TIMEOUT_MS / 1000} 秒），未生成报告。`
        : "无法连接模型服务，未生成报告。",
    );
  }

  if (!response.ok) {
    const hint =
      response.status === 401 || response.status === 403
        ? "请检查服务端 AI_API_KEY 是否有效。"
        : response.status === 429
          ? "模型服务限流，请稍后重试。"
          : "请稍后重试或检查模型配置。";
    throw new ServiceError(
      "AI_FAILED",
      `模型服务返回 HTTP ${response.status}。${hint}`,
      { status: response.status },
    );
  }

  let payload: ChatCompletionResponse;
  try {
    payload = (await response.json()) as ChatCompletionResponse;
  } catch {
    throw new ServiceError(
      "AI_FAILED",
      "模型服务返回了无法解析的响应。",
    );
  }

  const content = contentToText(payload.choices?.[0]?.message?.content);
  if (content === null) {
    throw new ServiceError(
      "AI_INVALID_OUTPUT",
      "模型响应中没有文本内容，未生成报告。",
    );
  }

  return parseModelJson(content);
}
