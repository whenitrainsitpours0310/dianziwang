export const DEFAULT_AI_BASE_URL = "https://api.deepseek.com";

export interface AiRuntimeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ServerConfig {
  tavilyApiKey: string | null;
  ai: AiRuntimeConfig | null;
  missingSearch: string[];
  missingAi: string[];
}

function clean(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAiBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed;
}

/**
 * 只读取服务端环境变量。返回给前端的公开状态由 getPublicServiceStatus 生成，
 * 永远不包含密钥或完整 base URL。
 */
export function readServerConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const tavilyApiKey = clean(env.TAVILY_API_KEY);
  const apiKey = clean(env.AI_API_KEY);
  const model = clean(env.AI_MODEL);
  const baseUrl = normalizeAiBaseUrl(
    clean(env.AI_BASE_URL) || DEFAULT_AI_BASE_URL,
  );

  const missingSearch: string[] = [];
  if (!tavilyApiKey) missingSearch.push("TAVILY_API_KEY");

  const missingAi: string[] = [];
  if (!apiKey) missingAi.push("AI_API_KEY");
  if (!model) missingAi.push("AI_MODEL");
  let baseUrlValid = false;
  try {
    const url = new URL(baseUrl);
    baseUrlValid = url.protocol === "http:" || url.protocol === "https:";
  } catch {
    baseUrlValid = false;
  }
  if (!baseUrlValid) missingAi.push("AI_BASE_URL（格式无效）");

  return {
    tavilyApiKey: tavilyApiKey || null,
    ai:
      apiKey && model && baseUrlValid
        ? { apiKey, baseUrl, model }
        : null,
    missingSearch,
    missingAi,
  };
}

export function getPublicServiceStatus(
  config: ServerConfig = readServerConfig(),
): {
  search: { configured: boolean; missing: string[] };
  ai: { configured: boolean; missing: string[]; model: string | null };
} {
  return {
    search: {
      configured: config.missingSearch.length === 0 && !!config.tavilyApiKey,
      missing: config.missingSearch,
    },
    ai: {
      configured: config.missingAi.length === 0 && !!config.ai,
      missing: config.missingAi,
      model: config.ai?.model ?? null,
    },
  };
}
