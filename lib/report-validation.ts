import { z } from "zod";

import {
  LIMITS,
  isHttpUrl,
  normalizeUrl,
} from "@/lib/validation";
import type { RelatedWork, SourceRecord } from "@/lib/types";

const text = (max: number) => z.string().max(max);

const relatedWorkDraftSchema = z.object({
  title: z.string().min(1).max(180),
  sourceIds: z.array(z.string().regex(/^S\d{1,2}$/)).min(1).max(3),
  summary: z.string().min(1).max(800),
  overlap: text(600).optional().default(""),
  difference: text(600).optional().default(""),
});

export const aiDraftSchema = z.object({
  summary: z.string().min(1).max(1500),
  relatedWorks: z.array(relatedWorkDraftSchema).max(LIMITS.relatedWorks),
  overlaps: z.array(text(600)).max(8).optional().default([]),
  differences: z.array(text(600)).max(8).optional().default([]),
  extensions: z.array(text(600)).max(8).optional().default([]),
  firstVersion: z
    .object({
      concept: text(800).optional().default(""),
      scope: z.array(text(300)).max(8).optional().default([]),
      steps: z.array(text(300)).max(10).optional().default([]),
      validation: z.array(text(300)).max(8).optional().default([]),
    })
    .optional()
    .default({
      concept: "",
      scope: [],
      steps: [],
      validation: [],
    }),
  limitations: z.array(text(600)).max(10).optional().default([]),
});

export type AiDraft = z.infer<typeof aiDraftSchema>;

export type AiReportValidation =
  | { ok: true; draft: AiDraft; relatedWorks: RelatedWork[] }
  | { ok: false; kind: "format" | "citations"; message: string };

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
  return output;
}

function urlsInText(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s<>"'`）)】\]]+/gi) ?? [];
  return matches.map((match) =>
    match.replace(/[.,;:!?，。；：！？]+$/g, ""),
  );
}

/**
 * 对模型草稿做两层校验：
 * 1. 结构必须符合约定 schema；
 * 2. 只能引用已知的搜索来源 ID，正文中不得出现未知 URL。
 * 用户提供但未读取的链接永远不能作为作品证据。
 */
export function validateAiReport(
  raw: unknown,
  sources: SourceRecord[],
): AiReportValidation {
  const parsed = aiDraftSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      kind: "format",
      message: `模型输出结构不符合要求：${
        first ? `${first.path.join(".") || "根对象"} ${first.message}` : "未知错误"
      }`,
    };
  }

  const draft = parsed.data;
  const readable = sources.filter(
    (source) => source.kind === "search" && isHttpUrl(source.url),
  );
  const sourceById = new Map(readable.map((source) => [source.id, source]));
  const knownUrls = new Set(readable.map((source) => normalizeUrl(source.url)));

  if (readable.length === 0) {
    if (draft.relatedWorks.length > 0) {
      const fabricatedId = draft.relatedWorks[0]?.sourceIds[0] ?? "";
      return {
        ok: false,
        kind: "citations",
        message: `本次没有任何可引用的检索来源，模型不能生成相关作品或来源 ID ${fabricatedId}。`,
      };
    }
    for (const value of collectStrings(draft)) {
      const fabricatedId = value.match(/\bS\d{1,2}\b/)?.[0];
      if (fabricatedId) {
        return {
          ok: false,
          kind: "citations",
          message: `本次没有任何可引用的检索来源，模型不能生成相关作品或来源 ID ${fabricatedId}。`,
        };
      }
    }
  }

  for (const value of collectStrings(draft)) {
    for (const url of urlsInText(value)) {
      if (!knownUrls.has(normalizeUrl(url))) {
        return {
          ok: false,
          kind: "citations",
          message: "模型返回了不属于本次检索来源的 URL，报告已拒绝。",
        };
      }
    }
  }

  const relatedWorks: RelatedWork[] = [];
  for (const [index, work] of draft.relatedWorks.entries()) {
    const uniqueIds: string[] = [];
    for (const sourceId of work.sourceIds) {
      const source = sourceById.get(sourceId);
      if (!source) {
        return {
          ok: false,
          kind: "citations",
          message: `第 ${index + 1} 个相关作品引用了不存在或未读取的来源 ${sourceId}。`,
        };
      }
      if (!uniqueIds.includes(sourceId)) uniqueIds.push(sourceId);
    }
    relatedWorks.push({
      title: work.title.trim(),
      sourceIds: uniqueIds,
      summary: work.summary.trim(),
      overlap: work.overlap.trim(),
      difference: work.difference.trim(),
    });
  }

  return { ok: true, draft, relatedWorks };
}
