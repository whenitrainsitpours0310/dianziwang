import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/explore/route";
import { GET as getConfig } from "@/app/api/config/route";
import { makeIdea } from "./fixtures";

function exploreRequest(body: unknown, ip = "203.0.113.10"): Request {
  return new Request("http://localhost/api/explore", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("explore API failure paths", () => {
  it("returns 400 for an invalid scope before touching external services", async () => {
    const response = await POST(
      exploreRequest({ idea: makeIdea(), scope: [] }, "203.0.113.11"),
    );
    expect(response.status).toBe(400);
    const body = await json(response);
    expect(body.ok).toBe(false);
    expect((body.error as { code: string }).code).toBe("INVALID_INPUT");
  });

  it("returns an explicit 503 configuration state without secrets", async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_MODEL", "");
    const response = await POST(
      exploreRequest(
        { idea: makeIdea(), scope: ["github"] },
        "203.0.113.12",
      ),
    );
    expect(response.status).toBe(503);
    const body = await json(response);
    expect(body.ok).toBe(false);
    expect((body.error as { code: string }).code).toBe("CONFIG_MISSING");
    const serialized = JSON.stringify(body);
    expect(serialized).toContain("TAVILY_API_KEY");
    expect(serialized).toContain("AI_API_KEY");
    expect(serialized).not.toContain("tvly-");
    expect(serialized).not.toContain("sk-");
  });

  it("returns 502 when every configured search call fails", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-route-secret");
    vi.stubEnv("AI_API_KEY", "sk-route-secret");
    vi.stubEnv("AI_MODEL", "deepseek-flash");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/chat/completions")) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ keywords: ["三件小事"] }),
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error("network down");
      }),
    );
    const response = await POST(
      exploreRequest(
        { idea: makeIdea(), scope: ["github"] },
        "203.0.113.13",
      ),
    );
    expect(response.status).toBe(502);
    const body = await json(response);
    expect((body.error as { code: string }).code).toBe("SEARCH_FAILED");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("tvly-route-secret");
    expect(serialized).not.toContain("sk-route-secret");
  });
  it("returns 422 when the keyword stage returns invalid structure", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-route-secret");
    vi.stubEnv("AI_API_KEY", "sk-route-secret");
    vi.stubEnv("AI_MODEL", "deepseek-flash");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/chat/completions")) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({ keywords: ["a", "b", "c", "d"] }),
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }),
    );
    const response = await POST(
      exploreRequest(
        { idea: makeIdea(), scope: ["github"] },
        "203.0.113.15",
      ),
    );
    expect(response.status).toBe(422);
    const body = await json(response);
    expect((body.error as { code: string }).code).toBe("AI_INVALID_OUTPUT");
  });
});

describe("config API", () => {
  it("exposes only configured booleans and missing variable names", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-config-secret");
    vi.stubEnv("AI_API_KEY", "sk-config-secret");
    vi.stubEnv("AI_MODEL", "deepseek-flash");
    const response = await getConfig();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      search: { configured: boolean };
      ai: { configured: boolean; model: string };
    };
    expect(body.search.configured).toBe(true);
    expect(body.ai.configured).toBe(true);
    expect(body.ai.model).toBe("deepseek-flash");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("tvly-config-secret");
    expect(serialized).not.toContain("sk-config-secret");
  });
});
