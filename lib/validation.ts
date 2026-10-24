import { z } from "zod";

import {
  IDEA_STATUSES,
  MOTIVATIONS,
  PLATFORMS,
  type Idea,
  type IdeaSnapshot,
  type ImportPayload,
  type Platform,
  type Workspace,
} from "@/lib/types";

export const LIMITS = {
  ideaOriginalText: 280,
  ideaTitle: 100,
  ideaContent: 3000,
  tag: 20,
  tags: 8,
  userLinks: 5,
  userLink: 500,
  ideas: 500,
  reports: 500,
  reportBytes: 80 * 1024,
  importBytes: 4 * 1024 * 1024,
  query: 200,
  queries: 6,
  sources: 30,
  relatedWorks: 8,
} as const;

const ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_ID_RE = /^S\d{1,2}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && ID_RE.test(value);
}

export function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_DATE_RE.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

/** 只接受 http(s)、带主机且不含账号密码的绝对 URL。 */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > LIMITS.userLink) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (!url.hostname) return false;
    if (url.username || url.password) return false;
    return true;
  } catch {
    return false;
  }
}

export function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of urls) {
    if (!isHttpUrl(raw)) continue;
    const key = normalizeUrl(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(raw);
  }
  return result;
}

const uuidSchema = z.string().refine(isUuid, "ID 格式不正确");
const isoDateSchema = z.string().refine(isIsoDate, "时间格式不正确");
const httpUrlSchema = z.string().refine(isHttpUrl, "URL 必须是 http(s) 绝对地址");
const tagSchema = z
  .string()
  .min(1, "标签不能为空")
  .max(LIMITS.tag, `标签最多 ${LIMITS.tag} 个字符`);

export const ideaSchema = z
  .object({
    id: uuidSchema,
    originalText: z
      .string()
      .min(1, "初始原文不能为空")
      .max(LIMITS.ideaOriginalText, `初始原文最多 ${LIMITS.ideaOriginalText} 个字符`),
    title: z
      .string()
      .min(1, "标题不能为空")
      .max(LIMITS.ideaTitle, `标题最多 ${LIMITS.ideaTitle} 个字符`),
    content: z.string().max(LIMITS.ideaContent, `内容最多 ${LIMITS.ideaContent} 个字符`),
    motivation: z.enum(MOTIVATIONS).nullable(),
    tags: z.array(tagSchema).max(LIMITS.tags, `标签最多 ${LIMITS.tags} 个`),
    userLinks: z
      .array(httpUrlSchema)
      .max(LIMITS.userLinks, `用户链接最多 ${LIMITS.userLinks} 条`),
    status: z.enum(IDEA_STATUSES),
    isExample: z.boolean().optional(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .strict();

export const userLinkSchema = httpUrlSchema;

const sourceSchema = z
  .object({
    id: z.string().regex(SOURCE_ID_RE, "来源 ID 格式不正确"),
    title: z.string().min(1).max(240),
    url: httpUrlSchema,
    platform: z.enum([...PLATFORMS, "user"]),
    kind: z.enum(["search", "user"]),
    snippet: z.string().max(900),
    query: z.string().max(LIMITS.query).nullable(),
    fetchedAt: isoDateSchema.nullable(),
  })
  .strict();

const searchRunSchema = z
  .object({
    query: z.string().min(1).max(LIMITS.query),
    platform: z.enum(PLATFORMS),
    status: z.enum(["ok", "failed"]),
    resultCount: z.number().int().min(0).max(20),
    message: z.string().max(300).optional(),
  })
  .strict();

export const relatedWorkSchema = z
  .object({
    title: z.string().min(1).max(180),
    sourceIds: z.array(z.string().regex(SOURCE_ID_RE)).min(1).max(3),
    summary: z.string().min(1).max(800),
    overlap: z.string().max(600),
    difference: z.string().max(600),
  })
  .strict();

const firstVersionSchema = z
  .object({
    concept: z.string().max(800),
    scope: z.array(z.string().max(300)).max(8),
    steps: z.array(z.string().max(300)).max(10),
    validation: z.array(z.string().max(300)).max(8),
  })
  .strict();

const snapshotSchema = z
  .object({
    originalText: z.string().min(1).max(LIMITS.ideaOriginalText),
    title: z.string().min(1).max(LIMITS.ideaTitle),
    content: z.string().max(LIMITS.ideaContent),
    motivation: z.enum(MOTIVATIONS).nullable(),
    tags: z.array(tagSchema).max(LIMITS.tags),
    userLinks: z.array(httpUrlSchema).max(LIMITS.userLinks),
    status: z.enum(IDEA_STATUSES),
    capturedAt: isoDateSchema,
  })
  .strict();

export const reportSchema = z
  .object({
    id: uuidSchema,
    ideaId: uuidSchema,
    status: z.enum(["ready", "empty"]),
    createdAt: isoDateSchema,
    scope: z.array(z.enum(PLATFORMS)).min(1).max(PLATFORMS.length),
    queries: z.array(z.string().min(1).max(LIMITS.query)).max(LIMITS.queries),
    keywords: z
      .array(z.string().min(1).max(60))
      .max(3)
      .default([]),
    searchRuns: z.array(searchRunSchema).max(8),
    sources: z.array(sourceSchema).max(LIMITS.sources),
    snapshot: snapshotSchema,
    summary: z.string().max(1500),
    relatedWorks: z.array(relatedWorkSchema).max(LIMITS.relatedWorks),
    overlaps: z.array(z.string().max(600)).max(8),
    differences: z.array(z.string().max(600)).max(8),
    extensions: z.array(z.string().max(600)).max(8),
    firstVersion: firstVersionSchema,
    limitations: z.array(z.string().max(600)).min(1).max(12),
    model: z.string().max(120),
  })
  .strict()
  .superRefine((report, ctx) => {
    const ids = new Set<string>();
    const sourceById = new Map<string, (typeof report.sources)[number]>();
    for (const source of report.sources) {
      if (ids.has(source.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["sources"],
          message: `来源 ID 重复：${source.id}`,
        });
      }
      ids.add(source.id);
      sourceById.set(source.id, source);
    }

    const scopes = new Set<string>();
    for (const item of report.scope) {
      if (scopes.has(item)) {
        ctx.addIssue({
          code: "custom",
          path: ["scope"],
          message: "检索范围重复",
        });
      }
      scopes.add(item);
    }

    for (const [index, work] of report.relatedWorks.entries()) {
      const seen = new Set<string>();
      for (const sourceId of work.sourceIds) {
        if (seen.has(sourceId)) {
          ctx.addIssue({
            code: "custom",
            path: ["relatedWorks", index, "sourceIds"],
            message: `来源引用重复：${sourceId}`,
          });
        }
        seen.add(sourceId);
        const source = sourceById.get(sourceId);
        if (!source) {
          ctx.addIssue({
            code: "custom",
            path: ["relatedWorks", index, "sourceIds"],
            message: `引用了不存在的来源：${sourceId}`,
          });
        } else if (source.kind !== "search") {
          ctx.addIssue({
            code: "custom",
            path: ["relatedWorks", index, "sourceIds"],
            message: `用户提供的未读取链接不能作为作品证据：${sourceId}`,
          });
        }
      }
    }

    if (report.status === "ready" && report.relatedWorks.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["relatedWorks"],
        message: "状态为 ready 时至少需要一个相关作品",
      });
    }
    if (report.status === "empty" && report.relatedWorks.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["relatedWorks"],
        message: "状态为 empty 时不应包含相关作品",
      });
    }
  });

export function isReportWithinSize(report: unknown): boolean {
  try {
    return (
      new TextEncoder().encode(JSON.stringify(report)).length <=
      LIMITS.reportBytes
    );
  } catch {
    return false;
  }
}

export const storedWorkspaceSchema = z
  .object({
    version: z.literal(1),
    savedAt: isoDateSchema,
    ideas: z.array(ideaSchema).max(LIMITS.ideas),
    reports: z.array(reportSchema).max(LIMITS.reports),
  })
  .strict()
  .superRefine((workspace, ctx) => {
    const ideaIds = new Set<string>();
    for (const [index, idea] of workspace.ideas.entries()) {
      if (ideaIds.has(idea.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["ideas", index, "id"],
          message: `灵感 ID 重复：${idea.id}`,
        });
      }
      ideaIds.add(idea.id);
    }
    const reportIds = new Set<string>();
    for (const [index, report] of workspace.reports.entries()) {
      if (reportIds.has(report.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["reports", index, "id"],
          message: `报告 ID 重复：${report.id}`,
        });
      }
      reportIds.add(report.id);
      if (!ideaIds.has(report.ideaId)) {
        ctx.addIssue({
          code: "custom",
          path: ["reports", index, "ideaId"],
          message: "报告引用的灵感不存在",
        });
      }
    }
  });

export const importPayloadSchema = z
  .object({
    format: z.literal("dianziwang"),
    version: z.literal(1),
    exportedAt: isoDateSchema,
    ideas: z.array(ideaSchema).max(LIMITS.ideas),
    reports: z.array(reportSchema).max(LIMITS.reports),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const ideaIds = new Set<string>();
    for (const [index, idea] of payload.ideas.entries()) {
      if (ideaIds.has(idea.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["ideas", index, "id"],
          message: `灵感 ID 重复：${idea.id}`,
        });
      }
      ideaIds.add(idea.id);
    }
    const reportIds = new Set<string>();
    for (const [index, report] of payload.reports.entries()) {
      if (reportIds.has(report.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["reports", index, "id"],
          message: `报告 ID 重复：${report.id}`,
        });
      }
      reportIds.add(report.id);
      if (!ideaIds.has(report.ideaId)) {
        ctx.addIssue({
          code: "custom",
          path: ["reports", index, "ideaId"],
          message: "报告引用的灵感不在导入数据中",
        });
      }
    }
  });

export const exploreScopeSchema = z
  .array(z.enum(PLATFORMS))
  .min(1, "请至少选择一个检索范围")
  .max(PLATFORMS.length)
  .refine((items) => new Set(items).size === items.length, "检索范围不能重复");

export const exploreInputSchema = z
  .object({
    idea: ideaSchema,
    scope: exploreScopeSchema,
  })
  .strict();

export interface ValidationIssue {
  path: string;
  message: string;
}

export function zodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length ? issue.path.join(".") : "根对象",
    message: issue.message,
  }));
}

export interface ParseResult<T> {
  ok: boolean;
  data?: T;
  errors: ValidationIssue[];
}

export function parseImportText(text: string): ParseResult<ImportPayload> {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > LIMITS.importBytes) {
    return {
      ok: false,
      errors: [{ path: "文件", message: "导入文件不能超过 4 MB" }],
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      ok: false,
      errors: [{ path: "文件", message: "不是有效的 JSON 文件" }],
    };
  }
  const result = importPayloadSchema.safeParse(value);
  if (!result.success) {
    return { ok: false, errors: zodIssues(result.error).slice(0, 6) };
  }
  return { ok: true, data: result.data, errors: [] };
}

export function parseStoredWorkspace(text: string): ParseResult<Workspace> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      ok: false,
      errors: [{ path: "本地数据", message: "JSON 解析失败" }],
    };
  }
  const result = storedWorkspaceSchema.safeParse(value);
  if (!result.success) {
    return { ok: false, errors: zodIssues(result.error).slice(0, 6) };
  }
  return {
    ok: true,
    data: { ideas: result.data.ideas, reports: result.data.reports },
    errors: [],
  };
}

export function createImportPayload(
  workspace: Workspace,
  now: Date = new Date(),
): ImportPayload {
  return {
    format: "dianziwang",
    version: 1,
    exportedAt: now.toISOString(),
    ideas: workspace.ideas,
    reports: workspace.reports,
  };
}

export type ImportMode = "merge" | "replace";

export interface ImportMergeResult {
  ok: boolean;
  workspace?: Workspace;
  addedIdeas: number;
  addedReports: number;
  skipped: number;
  errors: ValidationIssue[];
}

export function mergeImportedWorkspace(
  current: Workspace,
  payload: ImportPayload,
  mode: ImportMode,
): ImportMergeResult {
  if (mode === "replace") {
    return {
      ok: true,
      workspace: { ideas: payload.ideas, reports: payload.reports },
      addedIdeas: payload.ideas.length,
      addedReports: payload.reports.length,
      skipped: 0,
      errors: [],
    };
  }

  const ideaIds = new Set(current.ideas.map((idea) => idea.id));
  const ideas = [...current.ideas];
  let addedIdeas = 0;
  let skipped = 0;
  for (const idea of payload.ideas) {
    if (ideaIds.has(idea.id)) {
      skipped += 1;
      continue;
    }
    ideaIds.add(idea.id);
    ideas.push(idea);
    addedIdeas += 1;
  }

  const reportIds = new Set(current.reports.map((report) => report.id));
  const reports = [...current.reports];
  let addedReports = 0;
  for (const report of payload.reports) {
    if (reportIds.has(report.id)) {
      skipped += 1;
      continue;
    }
    if (!ideaIds.has(report.ideaId)) {
      skipped += 1;
      continue;
    }
    reportIds.add(report.id);
    reports.push(report);
    addedReports += 1;
  }

  if (ideas.length > LIMITS.ideas || reports.length > LIMITS.reports) {
    return {
      ok: false,
      addedIdeas: 0,
      addedReports: 0,
      skipped: 0,
      errors: [
        {
          path: "数据",
          message: `合并后超过上限（灵感 ${LIMITS.ideas} 条、报告 ${LIMITS.reports} 份）`,
        },
      ],
    };
  }

  return {
    ok: true,
    workspace: { ideas, reports },
    addedIdeas,
    addedReports,
    skipped,
    errors: [],
  };
}

export function ideaToSnapshot(
  idea: Idea,
  now: Date = new Date(),
): IdeaSnapshot {
  return {
    originalText: idea.originalText,
    title: idea.title,
    content: idea.content,
    motivation: idea.motivation,
    tags: [...idea.tags],
    userLinks: [...idea.userLinks],
    status: idea.status,
    capturedAt: now.toISOString(),
  };
}

export function platformLabel(platform: Platform | "user"): string {
  if (platform === "user") return "用户提供";
  return platform === "bilibili"
    ? "B站"
    : platform === "xiaohongshu"
      ? "小红书"
      : platform === "github"
        ? "GitHub"
        : "其他网页";
}
