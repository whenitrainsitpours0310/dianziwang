import { z } from "zod";

import { ServiceError } from "@/lib/server/errors";

/** AI 关键词阶段最多产出 3 个检索词/查询构想。 */
export const MAX_KEYWORDS = 3;
export const MAX_KEYWORD_LENGTH = 40;

const keywordDraftSchema = z
  .object({
    keywords: z
      .array(z.string().min(1).max(MAX_KEYWORD_LENGTH))
      .min(1)
      .max(MAX_KEYWORDS),
  })
  .strict();

function normalizeKeyword(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * 校验关键词阶段的结构化输出。关键词来自模型，属于不可信内容：
 * 只保留短查询短语，拒绝 URL、空值与重复项；任何不符合约定的输出
 * 都明确失败，不退回标题拼接。
 */
export function validateKeywordDraft(raw: unknown): string[] {
  const parsed = keywordDraftSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ServiceError(
      "AI_INVALID_OUTPUT",
      `模型返回的关键词结构不符合要求：${
        first ? `${first.path.join(".") || "根对象"} ${first.message}` : "未知错误"
      }。未发起检索，也未生成报告。`,
    );
  }

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const item of parsed.data.keywords) {
    const keyword = normalizeKeyword(item);
    if (!keyword) {
      throw new ServiceError(
        "AI_INVALID_OUTPUT",
        "模型返回了空关键词，未发起检索，也未生成报告。",
      );
    }
    if (/https?:\/\//i.test(keyword)) {
      throw new ServiceError(
        "AI_INVALID_OUTPUT",
        "模型在关键词中返回了 URL，已拒绝该输出。",
      );
    }
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
    if (keywords.length >= MAX_KEYWORDS) break;
  }

  if (keywords.length === 0) {
    throw new ServiceError(
      "AI_INVALID_OUTPUT",
      "模型没有返回可用的检索关键词，未发起检索，也未生成报告。",
    );
  }
  return keywords;
}
