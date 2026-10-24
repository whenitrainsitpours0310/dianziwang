export const IDEA_STATUSES = [
  "new",
  "exploring",
  "building",
  "done",
  "paused",
] as const;

export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  new: "新想法",
  exploring: "探索中",
  building: "制作中",
  done: "已完成",
  paused: "搁置",
};

export const MOTIVATIONS = ["fun", "self", "learn", "share"] as const;
export type Motivation = (typeof MOTIVATIONS)[number];

export const MOTIVATION_LABELS: Record<Motivation, string> = {
  fun: "好玩",
  self: "自用",
  learn: "学习",
  share: "分享",
};

export const PLATFORMS = ["bilibili", "xiaohongshu", "github", "web"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  bilibili: "B站",
  xiaohongshu: "小红书",
  github: "GitHub",
  web: "其他网页",
};

export const PLATFORM_HINTS: Record<Platform, string> = {
  bilibili: "公开视频与专栏索引",
  xiaohongshu: "公开笔记索引",
  github: "公开仓库与项目",
  web: "其余公开网页",
};

export interface Idea {
  id: string;
  /** 用户最初记下的一句话，只读，不随编辑改变。 */
  originalText: string;
  title: string;
  content: string;
  motivation: Motivation | null;
  tags: string[];
  userLinks: string[];
  status: IdeaStatus;
  isExample?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaSnapshot {
  originalText: string;
  title: string;
  content: string;
  motivation: Motivation | null;
  tags: string[];
  userLinks: string[];
  status: IdeaStatus;
  capturedAt: string;
}

export type SourceKind = "search" | "user";

export interface SourceRecord {
  /** 形如 S1、S2，报告正文只允许用 ID 引用来源。 */
  id: string;
  title: string;
  url: string;
  platform: Platform | "user";
  kind: SourceKind;
  /** 来自搜索索引的摘要，或对未读取用户链接的明确说明。 */
  snippet: string;
  query: string | null;
  fetchedAt: string | null;
}

export interface SearchRun {
  query: string;
  platform: Platform;
  status: "ok" | "failed";
  resultCount: number;
  message?: string;
}

export interface RelatedWork {
  title: string;
  sourceIds: string[];
  summary: string;
  overlap: string;
  difference: string;
}

export interface FirstVersion {
  concept: string;
  scope: string[];
  steps: string[];
  validation: string[];
}

export type ReportStatus = "ready" | "empty";

export interface ExploreReport {
  id: string;
  ideaId: string;
  status: ReportStatus;
  createdAt: string;
  scope: Platform[];
  queries: string[];
  /** 由模型基于灵感提取的检索关键词，最多 3 个。 */
  keywords: string[];
  searchRuns: SearchRun[];
  sources: SourceRecord[];
  snapshot: IdeaSnapshot;
  summary: string;
  relatedWorks: RelatedWork[];
  overlaps: string[];
  differences: string[];
  extensions: string[];
  firstVersion: FirstVersion;
  limitations: string[];
  model: string;
}

export interface ExploreInput {
  idea: Idea;
  scope: Platform[];
}

export interface PublicServiceStatus {
  search: {
    configured: boolean;
    missing: string[];
  };
  ai: {
    configured: boolean;
    missing: string[];
    model: string | null;
  };
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ExploreSuccessBody {
  ok: true;
  report: ExploreReport;
}

export type ExploreResponseBody = ExploreSuccessBody | ApiErrorBody;

export interface Workspace {
  ideas: Idea[];
  reports: ExploreReport[];
}

export interface ImportPayload extends Workspace {
  format: "dianziwang";
  version: 1;
  exportedAt: string;
}
