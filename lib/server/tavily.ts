import { z } from "zod";

import { isHttpUrl } from "@/lib/validation";
import { PLATFORM_LABELS, type Platform } from "@/lib/types";
import { ServiceError } from "@/lib/server/errors";

export const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";
export const SEARCH_TIMEOUT_MS = 10_000;
export const MAX_RESULTS_PER_QUERY = 4;

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export interface TavilySearchParams {
  apiKey: string;
  query: string;
  platform: Platform;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

const tavilyResponseSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            title: z.string().optional(),
            url: z.string(),
            content: z.string().optional(),
          })
          .passthrough(),
      )
      .max(20),
  })
  .passthrough();

const DOMAIN_FILTERS: Record<Platform, string[] | undefined> = {
  bilibili: ["bilibili.com", "b23.tv"],
  xiaohongshu: ["xiaohongshu.com"],
  github: ["github.com"],
  web: undefined,
};

function hostTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function cleanSnippet(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

/**
 * Tavily Search REST API。
 * 官方请求格式：POST https://api.tavily.com/search，
 * Authorization: Bearer <key>，JSON body 包含 query / search_depth /
 * max_results / include_domains 等字段。密钥不放入 URL 或请求体。
 */
export async function searchTavily(
  params: TavilySearchParams,
): Promise<SearchResult[]> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const timeoutSignal = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  const signal = params.signal
    ? AbortSignal.any([params.signal, timeoutSignal])
    : timeoutSignal;

  const body: Record<string, unknown> = {
    query: params.query,
    search_depth: "basic",
    topic: "general",
    max_results: MAX_RESULTS_PER_QUERY,
    include_answer: false,
    include_raw_content: false,
  };
  const domains = DOMAIN_FILTERS[params.platform];
  if (domains) body.include_domains = domains;

  let response: Response;
  try {
    response = await fetchImpl(TAVILY_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new ServiceError(
      "SEARCH_FAILED",
      timedOut
        ? `检索 ${PLATFORM_LABELS[params.platform]} 时超时（${SEARCH_TIMEOUT_MS / 1000} 秒）。`
        : `无法连接检索服务（${PLATFORM_LABELS[params.platform]}）。`,
      { platform: params.platform },
    );
  }

  if (!response.ok) {
    throw new ServiceError(
      "SEARCH_FAILED",
      `检索服务返回 HTTP ${response.status}（${PLATFORM_LABELS[params.platform]}）。`,
      { platform: params.platform, status: response.status },
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ServiceError(
      "SEARCH_FAILED",
      `检索服务返回了无法解析的内容（${PLATFORM_LABELS[params.platform]}）。`,
      { platform: params.platform },
    );
  }

  const parsed = tavilyResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ServiceError(
      "SEARCH_FAILED",
      `检索服务响应结构异常（${PLATFORM_LABELS[params.platform]}）。`,
      { platform: params.platform },
    );
  }

  const results: SearchResult[] = [];
  for (const item of parsed.data.results) {
    if (!isHttpUrl(item.url)) continue;
    results.push({
      url: item.url.trim(),
      title: (item.title ?? "").trim().slice(0, 240) || hostTitle(item.url),
      content: cleanSnippet(item.content),
    });
    if (results.length >= MAX_RESULTS_PER_QUERY) break;
  }
  return results;
}
