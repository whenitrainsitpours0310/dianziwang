import type {
  ExploreReport,
  Idea,
  IdeaSnapshot,
  SourceRecord,
} from "@/lib/types";
import type { AiDraft } from "@/lib/report-validation";

export const IDEA_ID = "11111111-1111-4111-8111-111111111111";
export const REPORT_ID = "22222222-2222-4222-8222-222222222222";
export const NOW = new Date("2026-01-02T03:04:05.000Z");

export function makeIdea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: IDEA_ID,
    originalText: "做一个只记录今天三件小事的桌面便签。",
    title: "今天三件小事",
    content: "不要项目管理和进度条，只保留今天、三件事、做完划掉。",
    motivation: "self",
    tags: ["极简", "桌面"],
    userLinks: ["https://example.com/inspiration"],
    status: "new",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeSource(
  id = "S1",
  overrides: Partial<SourceRecord> = {},
): SourceRecord {
  const isUser = overrides.kind === "user";
  return {
    id,
    title: id === "S2" ? "类似的三件事便签" : "三件小事 · GitHub",
    url:
      id === "S2"
        ? "https://www.bilibili.com/video/BV1example"
        : id === "S3"
          ? "https://www.xiaohongshu.com/explore/example-note"
          : "https://github.com/example/three-things",
    platform: id === "S2" ? "bilibili" : "github",
    kind: "search",
    snippet: "搜索索引摘要：一个只记录今日三件事的极简便签项目。",
    query: "今天三件小事 开源",
    fetchedAt: "2026-01-02T03:04:05.000Z",
    ...(isUser
      ? {
          platform: "user" as const,
          kind: "user" as const,
          snippet: "用户提供的待核实来源，系统未读取。",
          query: null,
          fetchedAt: null,
        }
      : {}),
    ...overrides,
  };
}

export function makeSnapshot(overrides: Partial<IdeaSnapshot> = {}): IdeaSnapshot {
  return {
    originalText: "做一个只记录今天三件小事的桌面便签。",
    title: "今天三件小事",
    content: "不要项目管理和进度条。",
    motivation: "self",
    tags: ["极简"],
    userLinks: ["https://example.com/inspiration"],
    status: "new",
    capturedAt: "2026-01-02T03:04:05.000Z",
    ...overrides,
  };
}

export function makeReport(
  overrides: Partial<ExploreReport> = {},
): ExploreReport {
  return {
    id: REPORT_ID,
    ideaId: IDEA_ID,
    status: "ready",
    createdAt: "2026-01-02T03:05:00.000Z",
    scope: ["github", "bilibili"],
    queries: ["今天三件小事 开源", "今天三件小事 体验 视频"],
    keywords: ["今天三件小事", "极简便签"],
    searchRuns: [
      {
        query: "今天三件小事 开源",
        platform: "github",
        status: "ok",
        resultCount: 2,
      },
      {
        query: "今天三件小事 体验 视频",
        platform: "bilibili",
        status: "ok",
        resultCount: 1,
      },
    ],
    sources: [makeSource("S1"), makeSource("S2"), makeSource("S3", { kind: "user" })],
    snapshot: makeSnapshot(),
    summary: "搜索索引摘要显示，已有类似的极简便签项目。",
    relatedWorks: [
      {
        title: "Three Things",
        sourceIds: ["S1"],
        summary: "一个只记录今日三件事的开源项目。",
        overlap: "都强调只做今天的三件事。",
        difference: "它偏桌面端，可以在移动端和中文体验上做出差异。",
      },
    ],
    overlaps: ["极简、只记录今天"],
    differences: ["移动端与中文表达"],
    extensions: ["每周回顾"],
    firstVersion: {
      concept: "一个只记录今天三件事的单页应用。",
      scope: ["新增三件事", "勾选完成", "本地保存"],
      steps: ["设计单页", "实现本地保存", "验证刷新后保留"],
      validation: ["连续使用三天，确认记录不丢失"],
    },
    limitations: ["仅检索公开索引，未打开原文。"],
    model: "deepseek-flash",
    ...overrides,
  };
}

export function makeAiDraft(overrides: Partial<AiDraft> = {}): AiDraft {
  return {
    summary: "搜索索引摘要显示，已有类似的极简便签项目。",
    relatedWorks: [
      {
        title: "Three Things",
        sourceIds: ["S1"],
        summary: "一个只记录今日三件事的开源项目。",
        overlap: "都强调只做今天的三件事。",
        difference: "它偏桌面端，可以在移动端和中文体验上做出差异。",
      },
    ],
    overlaps: ["极简、只记录今天"],
    differences: ["移动端与中文表达"],
    extensions: ["每周回顾"],
    firstVersion: {
      concept: "一个只记录今天三件事的单页应用。",
      scope: ["新增三件事", "勾选完成", "本地保存"],
      steps: ["设计单页", "实现本地保存", "验证刷新后保留"],
      validation: ["连续使用三天，确认记录不丢失"],
    },
    limitations: ["仅检索公开索引，未打开原文。"],
    ...overrides,
  };
}

export class MemoryStorage {
  data = new Map<string, string>();
  failWrites = false;
  failWritesWhen: ((key: string) => boolean) | null = null;

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites || this.failWritesWhen?.(key)) {
      throw new Error("QuotaExceeded");
    }
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}
