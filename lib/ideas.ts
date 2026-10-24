import { IDEA_STATUSES, type Idea, type IdeaStatus } from "@/lib/types";

export function newId(): string {
  return crypto.randomUUID();
}

export function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= 48) return clean;
  return `${clean.slice(0, 48)}…`;
}

export function createIdea(
  originalText: string,
  now: Date = new Date(),
  id: string = newId(),
): Idea {
  const text = originalText.trim();
  if (!text) throw new Error("初始原文不能为空");
  const timestamp = now.toISOString();
  return {
    id,
    originalText: text,
    title: deriveTitle(text),
    content: "",
    motivation: null,
    tags: [],
    userLinks: [],
    status: "new",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function isIdeaStatus(value: unknown): value is IdeaStatus {
  return (
    typeof value === "string" &&
    (IDEA_STATUSES as readonly string[]).includes(value)
  );
}

/** 把用户输入拆成标签，逐个归一化；返回新增后的标签和错误。 */
export function addTags(
  existing: string[],
  raw: string,
): { tags: string[]; error?: string } {
  const parts = raw
    .split(/[,，]/)
    .map((part) => part.trim().replace(/^#+/, "").trim())
    .filter(Boolean);
  if (parts.length === 0) return { tags: existing, error: "标签不能为空" };
  const tags = [...existing];
  for (const part of parts) {
    if (part.length > 20) return { tags: existing, error: "单个标签最多 20 个字符" };
    if (tags.length >= 8) return { tags: existing, error: "最多添加 8 个标签" };
    if (!tags.some((tag) => tag.toLowerCase() === part.toLowerCase())) {
      tags.push(part);
    }
  }
  return { tags };
}

export function removeTag(tags: string[], tag: string): string[] {
  return tags.filter((item) => item !== tag);
}

export function addUserLink(
  existing: string[],
  raw: string,
): { links: string[]; error?: string } {
  const value = raw.trim();
  if (!value) return { links: existing, error: "请输入链接" };
  if (existing.length >= 5) return { links: existing, error: "最多保存 5 条链接" };
  if (value.length > 500) return { links: existing, error: "链接过长" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { links: existing, error: "请输入完整的 http(s) 链接" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { links: existing, error: "只支持 http(s) 链接" };
  }
  if (url.username || url.password) {
    return { links: existing, error: "链接不能包含账号密码" };
  }
  if (existing.some((link) => link === value)) {
    return { links: existing, error: "这条链接已经添加过了" };
  }
  return { links: [...existing, value] };
}

export interface IdeaFilters {
  query: string;
  status: IdeaStatus | "all";
  tag: string | null;
}

export function filterIdeas(ideas: Idea[], filters: IdeaFilters): Idea[] {
  const query = filters.query.trim().toLowerCase();
  return ideas
    .filter((idea) => {
      if (filters.status !== "all" && idea.status !== filters.status) return false;
      if (filters.tag && !idea.tags.includes(filters.tag)) return false;
      if (!query) return true;
      const haystack = [
        idea.originalText,
        idea.title,
        idea.content,
        idea.tags.join(" "),
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function collectTags(ideas: Idea[]): string[] {
  const tags = new Set<string>();
  for (const idea of ideas) for (const tag of idea.tags) tags.add(tag);
  return [...tags].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function updateIdea(
  idea: Idea,
  patch: Partial<Omit<Idea, "id" | "originalText" | "createdAt">>,
  now: Date = new Date(),
): Idea {
  return {
    ...idea,
    ...patch,
    id: idea.id,
    originalText: idea.originalText,
    createdAt: idea.createdAt,
    updatedAt: now.toISOString(),
  };
}
