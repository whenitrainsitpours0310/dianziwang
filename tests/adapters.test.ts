import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_AI_BASE_URL,
  getPublicServiceStatus,
  readServerConfig,
} from "@/lib/server/config";
import { RateLimiter } from "@/lib/server/rate-limit";
import { ServiceError } from "@/lib/server/errors";
import {
  TAVILY_SEARCH_ENDPOINT,
  searchTavily,
} from "@/lib/server/tavily";
import { requestAiAnalysis } from "@/lib/server/ai";
import { makeAiDraft } from "./fixtures";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type FetchArgs = [input: string | URL | Request, init?: RequestInit];

function mockFetch(handler: () => Response) {
  return vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
    handler(),
  );
}

describe("Tavily adapter", () => {
  it("uses a bearer header and never puts the key in the URL or JSON body", async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({
        results: [
          {
            title: "Repo",
            url: "https://github.com/example/repo",
            content: "一个开源项目。",
          },
          { title: "", url: "not-a-url", content: "ignored" },
        ],
      }),
    );
    const results = await searchTavily({
      apiKey: "tvly-super-secret",
      query: "三件小事 开源",
      platform: "github",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Repo");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(TAVILY_SEARCH_ENDPOINT);
    const request = init as RequestInit;
    expect(request.method).toBe("POST");
    expect(
      (request.headers as Record<string, string>).Authorization,
    ).toBe("Bearer tvly-super-secret");
    expect(String(url)).not.toContain("tvly-super-secret");
    const body = JSON.parse(String(request.body));
    expect(body.api_key).toBeUndefined();
    expect(body.query).toBe("三件小事 开源");
    expect(body.max_results).toBe(4);
    expect(body.include_domains).toEqual(["github.com"]);
    expect(body.include_answer).toBe(false);
  });

  it("maps upstream errors to SEARCH_FAILED without exposing the key", async () => {
    const fetchMock = mockFetch(() => jsonResponse({ detail: "bad key" }, 401));
    await expect(
      searchTavily({
        apiKey: "tvly-super-secret",
        query: "q",
        platform: "web",
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "SEARCH_FAILED" });
  });

  it("uses no domain filter for web scope", async () => {
    const fetchMock = mockFetch(() => jsonResponse({ results: [] }));
    await searchTavily({
      apiKey: "k",
      query: "q",
      platform: "web",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(init.body)).include_domains).toBeUndefined();
  });
});

describe("AI adapter", () => {
  it("calls the OpenAI-compatible chat completions endpoint and parses fenced JSON", async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({
        choices: [
          {
            message: {
              content: `\`\`\`json\n${JSON.stringify(makeAiDraft())}\n\`\`\``,
            },
          },
        ],
      }),
    );
    const result = await requestAiAnalysis({
      config: {
        apiKey: "sk-super-secret",
        baseUrl: "https://api.example.com/v1/",
        model: "deepseek-flash",
      },
      prompt: { system: "system", user: "user" },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      summary: "搜索索引摘要显示，已有类似的极简便签项目。",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    const request = init as RequestInit;
    expect((request.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-super-secret",
    );
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe("deepseek-flash");
    expect(body.stream).toBe(false);
    expect(body.messages[0].role).toBe("system");
  });

  it("does not duplicate /chat/completions", async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({
        choices: [
          { message: { content: JSON.stringify(makeAiDraft()) } },
        ],
      }),
    );
    await requestAiAnalysis({
      config: {
        apiKey: "k",
        baseUrl: "https://api.example.com/v1/chat/completions",
        model: "m",
      },
      prompt: { system: "s", user: "u" },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://api.example.com/v1/chat/completions",
    );
  });

  it("rejects non-JSON model text as AI_INVALID_OUTPUT", async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({ choices: [{ message: { content: "这不是 JSON" } }] }),
    );
    await expect(
      requestAiAnalysis({
        config: { apiKey: "k", baseUrl: "https://api.example.com", model: "m" },
        prompt: { system: "s", user: "u" },
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });

  it("maps 401 to AI_FAILED", async () => {
    const fetchMock = mockFetch(() =>
      jsonResponse({ error: "unauthorized" }, 401),
    );
    await expect(
      requestAiAnalysis({
        config: {
          apiKey: "secret",
          baseUrl: "https://api.example.com",
          model: "m",
        },
        prompt: { system: "s", user: "u" },
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "AI_FAILED" });
  });
});

describe("server configuration status", () => {
  it("reports missing keys without leaking configured secrets", () => {
    const config = readServerConfig({
      TAVILY_API_KEY: "tvly-secret",
      AI_API_KEY: "sk-secret",
      AI_MODEL: "deepseek-flash",
    });
    const status = getPublicServiceStatus(config);
    expect(status.search.configured).toBe(true);
    expect(status.ai.configured).toBe(true);
    expect(status.ai.model).toBe("deepseek-flash");
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("tvly-secret");
    expect(serialized).not.toContain("sk-secret");
    expect(config.ai?.baseUrl).toBe(DEFAULT_AI_BASE_URL);
  });

  it("lists every missing configuration item", () => {
    const status = getPublicServiceStatus(readServerConfig({}));
    expect(status.search.configured).toBe(false);
    expect(status.ai.configured).toBe(false);
    expect(status.search.missing).toContain("TAVILY_API_KEY");
    expect(status.ai.missing).toContain("AI_API_KEY");
    expect(status.ai.missing).toContain("AI_MODEL");
  });

  it("rejects an invalid base URL", () => {
    const config = readServerConfig({
      TAVILY_API_KEY: "t",
      AI_API_KEY: "k",
      AI_MODEL: "m",
      AI_BASE_URL: "not a url",
    });
    const status = getPublicServiceStatus(config);
    expect(status.ai.configured).toBe(false);
    expect(status.ai.missing.join(" ")).toContain("AI_BASE_URL");
  });
});

describe("rate limiter", () => {
  it("allows five requests per window and resets later", () => {
    const limiter = new RateLimiter(2, 1_000);
    expect(limiter.consume("ip", 0)).toBe(true);
    expect(limiter.consume("ip", 10)).toBe(true);
    expect(limiter.consume("ip", 20)).toBe(false);
    expect(limiter.consume("other", 20)).toBe(true);
    expect(limiter.consume("ip", 1_500)).toBe(true);
  });
});

describe("public error mapping", () => {
  it("keeps a stable HTTP status", () => {
    const error = new ServiceError("AI_FAILED", "模型不可用", { status: 500 });
    expect(error.status).toBe(502);
  });
});
