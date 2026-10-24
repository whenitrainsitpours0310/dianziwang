import { describe, expect, it, vi } from "vitest";

import { ServiceError } from "@/lib/server/errors";
import {
  buildSearchPlan,
  exploreIdea,
  type ExploreDependencies,
  type SearchHit,
} from "@/lib/server/explore";
import { buildAnalysisPrompt, type AnalysisPrompt } from "@/lib/server/prompt";
import { validateKeywordDraft } from "@/lib/server/keywords";
import {
  IDEA_ID,
  NOW,
  REPORT_ID,
  makeAiDraft,
  makeIdea,
  makeSource,
} from "./fixtures";

const hitA: SearchHit = {
  title: "Three Things",
  url: "https://github.com/example/three-things",
  content: "一个只记录今天三件事的开源项目。",
};
const hitB: SearchHit = {
  title: "今日三件事",
  url: "https://www.bilibili.com/video/BV1demo",
  content: "视频介绍了只记录今天三件事的便签方法。",
};

function ideaOnlyDraft() {
  return makeAiDraft({
    summary: "基于点子的延伸建议。",
    relatedWorks: [],
    overlaps: [],
    differences: [],
    extensions: ["把三件事拆成早、中、晚三个时段。"],
    firstVersion: {
      concept: "只记录今天三件事的单页便签。",
      scope: ["记录三件事", "勾选完成"],
      steps: ["画出单页", "实现本地保存"],
      validation: ["连续使用三天"],
    },
  });
}

function deps(
  overrides: Partial<ExploreDependencies> = {},
): ExploreDependencies {
  return {
    model: "deepseek-flash",
    now: () => NOW,
    newId: () => REPORT_ID,
    extractKeywords: async () => ({
      keywords: ["今天三件小事", "极简便签"],
    }),
    search: async ({ platform }) =>
      platform === "github" ? [hitA] : platform === "bilibili" ? [hitB] : [],
    analyze: async () => makeAiDraft(),
    ...overrides,
  };
}

describe("query decomposition", () => {
  it("uses the AI keywords as actual queries and covers every selected platform", () => {
    const keywords = ["今天三件小事", "极简便签", "桌面待办"];
    const plan = buildSearchPlan(
      keywords,
      ["bilibili", "xiaohongshu", "github", "web"],
    );
    expect(plan).toHaveLength(6);
    for (const platform of ["bilibili", "xiaohongshu", "github", "web"]) {
      expect(plan.some((item) => item.platform === platform)).toBe(true);
    }
    for (const item of plan) {
      expect(keywords).toContain(item.query);
    }
    expect(new Set(plan.map((item) => `${item.platform}:${item.query}`)).size).toBe(
      plan.length,
    );
  });

  it("does not fall back to title concatenation when keywords are empty", () => {
    expect(buildSearchPlan([], ["github"])).toEqual([]);
  });
});

describe("AI keyword validation", () => {
  it("accepts 1-3 distinct short keywords", () => {
    expect(validateKeywordDraft({ keywords: ["三件小事", "极简 待办"] })).toEqual([
      "三件小事",
      "极简 待办",
    ]);
  });

  it("rejects non-object output, too many keywords and URLs", () => {
    expect(() => validateKeywordDraft("三件小事")).toThrow(/结构/);
    expect(() =>
      validateKeywordDraft({ keywords: ["a", "b", "c", "d"] }),
    ).toThrow(/结构/);
    expect(() =>
      validateKeywordDraft({ keywords: ["https://example.com"] }),
    ).toThrow(/URL/);
  });
});

describe("explore orchestration", () => {
  it("maps search sources and returns a ready report with a snapshot", async () => {
    const idea = makeIdea();
    const analyze = vi.fn(async () => makeAiDraft());
    const report = await exploreIdea(
      { idea, scope: ["github", "bilibili"] },
      deps({ analyze }),
    );

    expect(report.status).toBe("ready");
    expect(report.ideaId).toBe(IDEA_ID);
    expect(report.snapshot.title).toBe("今天三件小事");
    expect(report.snapshot.originalText).toBe(idea.originalText);
    expect(report.sources.filter((source) => source.kind === "search")).toHaveLength(2);
    expect(report.sources.filter((source) => source.kind === "user")).toHaveLength(1);
    expect(report.relatedWorks[0].sourceIds).toEqual(["S1"]);
    expect(report.keywords).toEqual(["今天三件小事", "极简便签"]);
    expect(report.searchRuns).toHaveLength(4);
    expect(report.queries).toHaveLength(2);
    expect(report.model).toBe("deepseek-flash");
    expect(report.limitations.join(" ")).toContain("未逐页打开原文");
    expect(analyze).toHaveBeenCalledTimes(1);

    idea.title = "后来改过的标题";
    expect(report.snapshot.title).toBe("今天三件小事");
  });

  it("fails explicitly when keyword extraction fails and does not search", async () => {
    const search = vi.fn(async () => [hitA]);
    await expect(
      exploreIdea(
        { idea: makeIdea(), scope: ["github"] },
        deps({
          extractKeywords: async () => {
            throw new ServiceError("AI_FAILED", "keyword model down");
          },
          search,
        }),
      ),
    ).rejects.toMatchObject({ code: "AI_FAILED" });
    expect(search).not.toHaveBeenCalled();
  });

  it("rejects malformed keyword output instead of guessing queries", async () => {
    const search = vi.fn(async () => [hitA]);
    await expect(
      exploreIdea(
        { idea: makeIdea(), scope: ["github"] },
        deps({
          extractKeywords: async () => ({ keywords: [] }),
          search,
        }),
      ),
    ).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(search).not.toHaveBeenCalled();
  });

  it("generates idea-only advice when searches succeed but return no sources", async () => {
    const analyze = vi.fn(async (_prompt: AnalysisPrompt) => ideaOnlyDraft());
    const report = await exploreIdea(
      { idea: makeIdea(), scope: ["github"] },
      deps({ search: async () => [], analyze }),
    );
    expect(report.status).toBe("empty");
    expect(report.relatedWorks).toEqual([]);
    expect(report.overlaps).toEqual([]);
    expect(report.differences).toEqual([]);
    expect(report.extensions[0]).toContain("三个时段");
    expect(report.firstVersion.concept).toContain("单页便签");
    expect(report.summary).toContain("尚无检索证据");
    expect(report.limitations.join(" ")).toContain("基于点子本身的建议");
    expect(report.sources).toHaveLength(1);
    expect(report.sources[0].kind).toBe("user");
    expect(report.searchRuns).toHaveLength(2);
    expect(report.queries).toEqual(["今天三件小事", "极简便签"]);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0][0].system).toContain("没有任何检索来源");
  });

  it("analyzes and cites a single search source while noting limited coverage", async () => {
    const analyze = vi.fn(async () => makeAiDraft());
    const report = await exploreIdea(
      { idea: makeIdea(), scope: ["github"] },
      deps({ search: async () => [hitA], analyze }),
    );
    expect(report.status).toBe("ready");
    expect(report.sources.filter((source) => source.kind === "search")).toHaveLength(1);
    expect(report.relatedWorks[0].sourceIds).toEqual(["S1"]);
    expect(report.limitations.join(" ")).toContain("仅有 1 条可引用来源");
    expect(report.limitations.join(" ")).toContain("覆盖有限");
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it("rejects fabricated source IDs when there are no search sources", async () => {
    const analyze = vi.fn(async () => makeAiDraft());
    await expect(
      exploreIdea(
        { idea: makeIdea(), scope: ["github"] },
        deps({ search: async () => [], analyze }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_CITATIONS" });
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it("rejects URLs invented by the model when there are no search sources", async () => {
    await expect(
      exploreIdea(
        { idea: makeIdea(), scope: ["github"] },
        deps({
          search: async () => [],
          analyze: async () => ({
            ...ideaOnlyDraft(),
            summary: "详见 https://made-up.example.com/project 。",
          }),
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_CITATIONS" });
  });

  it("turns total search failure into SEARCH_FAILED", async () => {
    const search = vi.fn(async () => {
      throw new ServiceError("SEARCH_FAILED", "upstream down");
    });
    await expect(
      exploreIdea({ idea: makeIdea(), scope: ["github"] }, deps({ search })),
    ).rejects.toMatchObject({ code: "SEARCH_FAILED" });
    expect(search).toHaveBeenCalled();
  });

  it("keeps partial results but notes failed runs", async () => {
    const report = await exploreIdea(
      { idea: makeIdea(), scope: ["github", "bilibili"] },
      deps({
        search: async ({ platform }) => {
          if (platform === "github") {
            throw new ServiceError("SEARCH_FAILED", "github failed");
          }
          return [hitB, { ...hitB, url: "https://www.bilibili.com/video/BV2demo" }];
        },
      }),
    );
    expect(report.status).toBe("ready");
    expect(report.limitations.join(" ")).toContain("次检索失败");
  });

  it("propagates AI service failure distinctly", async () => {
    await expect(
      exploreIdea(
        { idea: makeIdea(), scope: ["github", "bilibili"] },
        deps({
          analyze: async () => {
            throw new ServiceError("AI_FAILED", "模型不可用");
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "AI_FAILED" });
  });

  it("wraps unexpected analyzer errors as AI_FAILED", async () => {
    await expect(
      exploreIdea(
        { idea: makeIdea(), scope: ["github", "bilibili"] },
        deps({
          analyze: async () => {
            throw new Error("boom");
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "AI_FAILED" });
  });

  it("rejects malformed model output as AI_INVALID_OUTPUT", async () => {
    await expect(
      exploreIdea(
        { idea: makeIdea(), scope: ["github", "bilibili"] },
        deps({ analyze: async () => ({ summary: "缺少字段" }) }),
      ),
    ).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });

  it("rejects fabricated citations as INVALID_CITATIONS", async () => {
    await expect(
      exploreIdea(
        { idea: makeIdea(), scope: ["github", "bilibili"] },
        deps({
          analyze: async () =>
            makeAiDraft({
              relatedWorks: [
                {
                  ...makeAiDraft().relatedWorks[0],
                  sourceIds: ["S42"],
                },
              ],
            }),
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_CITATIONS" });
  });
});

describe("prompt construction", () => {
  it("passes only source IDs and never includes user links", () => {
    const idea = makeIdea({
      userLinks: ["https://secret.example.com/private-note"],
    });
    const prompt = buildAnalysisPrompt({
      snapshot: {
        originalText: idea.originalText,
        title: idea.title,
        content: idea.content,
        motivation: idea.motivation,
        tags: idea.tags,
        userLinks: idea.userLinks,
        status: idea.status,
        capturedAt: NOW.toISOString(),
      },
      scope: ["github"],
      sources: [
        {
          id: "S1",
          title: "Repo",
          url: "https://github.com/a/b",
          platform: "github",
          kind: "search",
          snippet: "摘要",
          query: "q",
          fetchedAt: NOW.toISOString(),
        },
      ],
      queryRuns: [{ query: "q", platform: "github", resultCount: 1 }],
    });
    expect(prompt.user).toContain("S1");
    expect(prompt.user).not.toContain("https://github.com/a/b");
    expect(prompt.user).not.toContain("secret.example.com");
    expect(prompt.system).toContain("不可信数据");
    expect(prompt.system).toContain("不得输出任何 URL");
  });

  it("switches to an idea-only prompt with no source slots when nothing was found", () => {
    const idea = makeIdea();
    const prompt = buildAnalysisPrompt({
      snapshot: {
        originalText: idea.originalText,
        title: idea.title,
        content: idea.content,
        motivation: idea.motivation,
        tags: idea.tags,
        userLinks: idea.userLinks,
        status: idea.status,
        capturedAt: NOW.toISOString(),
      },
      scope: ["github"],
      sources: [makeSource("S1", { kind: "user" })],
      queryRuns: [{ query: "q", platform: "github", resultCount: 0 }],
    });
    expect(prompt.system).toContain("没有任何检索来源");
    expect(prompt.system).toContain("relatedWorks 必须返回 []");
    expect(prompt.user).toContain("没有获得任何可引用的有效来源");
    expect(prompt.user).not.toContain("检索来源");
    expect(prompt.user).not.toContain("https://example.com/inspiration");
  });
});
