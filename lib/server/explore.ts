import {
  ideaToSnapshot,
  isReportWithinSize,
  isHttpUrl,
  normalizeUrl,
  reportSchema,
} from "@/lib/validation";
import {
  PLATFORM_LABELS,
  type ExploreInput,
  type ExploreReport,
  type Idea,
  type Platform,
  type SearchRun,
  type SourceRecord,
} from "@/lib/types";
import { ServiceError } from "@/lib/server/errors";
import {
  validateAiReport,
  type AiDraft,
} from "@/lib/report-validation";
import {
  buildAnalysisPrompt,
  buildKeywordPrompt,
  type AnalysisPrompt,
} from "@/lib/server/prompt";
import { validateKeywordDraft } from "@/lib/server/keywords";

export interface SearchHit {
  title: string;
  url: string;
  content: string;
}

export type SearchFn = (params: {
  query: string;
  platform: Platform;
}) => Promise<SearchHit[]>;

export type AnalyzeFn = (prompt: AnalysisPrompt) => Promise<unknown>;
export type ExtractKeywordsFn = (prompt: AnalysisPrompt) => Promise<unknown>;

export interface ExploreDependencies {
  model: string;
  /** 由模型提取检索词；失败必须抛错，不能回退到标题拼接。 */
  extractKeywords: ExtractKeywordsFn;
  search: SearchFn;
  analyze: AnalyzeFn;
  now?: () => Date;
  newId?: () => string;
}

export interface PlannedSearch {
  query: string;
  platform: Platform;
}

const MAX_SEARCH_RUNS = 6;

function compact(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * 把 AI 提取的关键词展开成有限的平台检索计划：先让每个所选范围
 * 都使用第一个关键词，再依次使用后续关键词。每个实际查询都原样
 * 保存进 searchRuns，不做标题前缀拼接。
 */
export function buildSearchPlan(
  keywords: string[],
  scope: Platform[],
): PlannedSearch[] {
  const cleaned = [
    ...new Set(
      keywords
        .map((keyword) => compact(keyword, 60))
        .filter((keyword) => keyword.length > 0),
    ),
  ].slice(0, 3);
  if (cleaned.length === 0) return [];

  const ordered: PlannedSearch[] = [];
  for (const keyword of cleaned) {
    for (const platform of scope) {
      if (ordered.length >= MAX_SEARCH_RUNS) return ordered;
      ordered.push({ query: keyword, platform });
    }
  }
  return ordered;
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
  );
  return results;
}

function inferPlatform(url: string, fallback: Platform): Platform {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return fallback;
  }
  if (host === "bilibili.com" || host.endsWith(".bilibili.com") || host === "b23.tv") {
    return "bilibili";
  }
  if (host === "xiaohongshu.com" || host.endsWith(".xiaohongshu.com")) {
    return "xiaohongshu";
  }
  if (host === "github.com" || host.endsWith(".github.com")) {
    return "github";
  }
  return "web";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function failedLimitations(runs: SearchRun[]): string[] {
  const failed = runs.filter((run) => run.status === "failed");
  if (!failed.length) return [];
  const platforms = [...new Set(failed.map((run) => PLATFORM_LABELS[run.platform]))];
  return [
    `${failed.length} 次检索失败（${platforms.join("、")}），结果可能不完整。`,
  ];
}

function baseLimitations(
  scope: Platform[],
  runs: SearchRun[],
  userSourceCount: number,
  hasSearchSources = true,
): string[] {
  const limitations = [
    `本次仅检索公开索引范围：${scope.map((platform) => PLATFORM_LABELS[platform]).join("、")}；未覆盖登录后或未被索引的内容。`,
    hasSearchSources
      ? "相关作品基于搜索索引摘要，系统未逐页打开原文核实，请自行复核。"
      : "本次没有获得可引用的检索来源，报告没有使用任何作品证据。",
    "检索词由模型基于灵感提取，可能与实际作品使用的名称不一致。",
    ...failedLimitations(runs),
  ];
  if (userSourceCount > 0) {
    limitations.push(
      `用户提供的 ${userSourceCount} 条链接未被读取，只作为待核实线索，不能作为作品证据。`,
    );
  }
  return limitations;
}

function makeUserSources(
  idea: Idea,
  existing: SourceRecord[],
  startIndex: number,
): SourceRecord[] {
  const seen = new Set(existing.map((source) => normalizeUrl(source.url)));
  const result: SourceRecord[] = [];
  for (const link of idea.userLinks) {
    if (!isHttpUrl(link)) continue;
    const key = normalizeUrl(link);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: `S${startIndex + result.length}`,
      title: `用户提供：${hostOf(link)}`,
      url: link,
      platform: "user",
      kind: "user",
      snippet:
        "用户提供的待核实来源。系统未读取页面内容，不能作为相关作品或事实证据。",
      query: null,
      fetchedAt: null,
    });
  }
  return result;
}

/** 零检索结果时，模型只能基于灵感给建议，不能包装成市场结论。 */
export const IDEA_ONLY_NOTICE = "基于点子本身的建议，尚无检索证据。";

const IDEA_ONLY_SUMMARY =
  "本次检索未发现可核实的相关作品。以下延伸方向与第一版建议仅基于点子本身，尚无检索证据。";

function cleanedList(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}

function draftExtensions(draft?: AiDraft): string[] {
  return draft ? cleanedList(draft.extensions) : [];
}

function draftFirstVersion(draft?: AiDraft): ExploreReport["firstVersion"] {
  if (!draft) {
    return { concept: "", scope: [], steps: [], validation: [] };
  }
  return {
    concept: draft.firstVersion.concept.trim(),
    scope: cleanedList(draft.firstVersion.scope),
    steps: cleanedList(draft.firstVersion.steps),
    validation: cleanedList(draft.firstVersion.validation),
  };
}

function emptyReport(params: {
  id: string;
  idea: Idea;
  startedAt: Date;
  completedAt: Date;
  scope: Platform[];
  keywords: string[];
  runs: SearchRun[];
  sources: SourceRecord[];
  model: string;
  /** 零检索结果时仍由模型生成灵感建议；作品与重合/差异强制为空。 */
  draft?: AiDraft;
}): ExploreReport {
  const userCount = params.sources.filter((source) => source.kind === "user").length;
  const limitations = [
    ...baseLimitations(
      params.scope,
      params.runs,
      userCount,
      params.sources.some((source) => source.kind === "search"),
    ),
    ...(params.draft?.limitations
      ? cleanedList(params.draft.limitations)
      : []),
    "“未发现”仅代表本次检索范围与关键词下的结果，不代表全网不存在类似作品。",
  ];
  if (params.draft) limitations.unshift(IDEA_ONLY_NOTICE);
  const report: ExploreReport = {
    id: params.id,
    ideaId: params.idea.id,
    status: "empty",
    createdAt: params.completedAt.toISOString(),
    scope: params.scope,
    queries: [...new Set(params.runs.map((run) => run.query))],
    keywords: params.keywords,
    searchRuns: params.runs,
    sources: params.sources,
    snapshot: ideaToSnapshot(params.idea, params.startedAt),
    summary: params.draft
      ? IDEA_ONLY_SUMMARY
      : "已按所选范围检索，当前范围未发现可核实、可引用的相关作品。",
    relatedWorks: [],
    overlaps: [],
    differences: [],
    extensions: draftExtensions(params.draft),
    firstVersion: draftFirstVersion(params.draft),
    limitations: [...new Set(limitations)].slice(0, 12),
    model: params.model,
  };
  return report;
}

function buildReadyReport(params: {
  id: string;
  idea: Idea;
  startedAt: Date;
  completedAt: Date;
  scope: Platform[];
  keywords: string[];
  runs: SearchRun[];
  sources: SourceRecord[];
  model: string;
  draft: AiDraft;
  relatedWorks: ExploreReport["relatedWorks"];
}): ExploreReport {
  const { draft } = params;
  const userCount = params.sources.filter((source) => source.kind === "user").length;
  const searchSourceCount = params.sources.filter(
    (source) => source.kind === "search",
  ).length;
  const limitations = [
    ...baseLimitations(params.scope, params.runs, userCount),
    ...(searchSourceCount === 1
      ? [
          "本次仅有 1 条可引用来源，覆盖有限，结论只反映该来源的搜索索引摘要。",
        ]
      : []),
    ...cleanedList(draft.limitations),
  ];
  const uniqueLimitations = [...new Set(limitations)].slice(0, 12);
  const hasWorks = params.relatedWorks.length > 0;
  const report: ExploreReport = {
    id: params.id,
    ideaId: params.idea.id,
    status: hasWorks ? "ready" : "empty",
    createdAt: params.completedAt.toISOString(),
    scope: params.scope,
    queries: [...new Set(params.runs.map((run) => run.query))],
    keywords: params.keywords,
    searchRuns: params.runs,
    sources: params.sources,
    snapshot: ideaToSnapshot(params.idea, params.startedAt),
    summary: draft.summary.trim(),
    relatedWorks: hasWorks ? params.relatedWorks : [],
    // 没有相关作品时不保留“重合/差异”，避免没有作品证据的市场结论。
    overlaps: hasWorks ? cleanedList(draft.overlaps) : [],
    differences: hasWorks ? cleanedList(draft.differences) : [],
    extensions: cleanedList(draft.extensions),
    firstVersion: draftFirstVersion(draft),
    limitations: uniqueLimitations.length
      ? uniqueLimitations
      : [
          `本次仅检索公开索引范围：${params.scope
            .map((platform) => PLATFORM_LABELS[platform])
            .join("、")}。`,
        ],
    model: params.model,
  };
  return report;
}

/**
 * 完整的探索编排：拆词 → 有限并发检索 → 去重与来源编号 → 模型分析
 * → 服务端结构与引用校验 → 保存当次快照。任何失败都以明确错误抛出。
 */
export async function exploreIdea(
  input: ExploreInput,
  deps: ExploreDependencies,
): Promise<ExploreReport> {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const scope = [...new Set(input.scope)];
  if (scope.length === 0) {
    throw new ServiceError("INVALID_INPUT", "请至少选择一个检索范围。");
  }

  const startedAt = now();
  const snapshot = ideaToSnapshot(input.idea, startedAt);

  let keywordRaw: unknown;
  try {
    keywordRaw = await deps.extractKeywords(buildKeywordPrompt(snapshot));
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      "AI_FAILED",
      "检索关键词提取失败，未发起检索，也未生成报告。",
    );
  }
  const keywords = validateKeywordDraft(keywordRaw);
  const plan = buildSearchPlan(keywords, scope);
  if (plan.length === 0) {
    throw new ServiceError(
      "AI_INVALID_OUTPUT",
      "没有生成可用的检索计划，未发起检索，也未生成报告。",
    );
  }

  const outcomes = await runWithConcurrency(
    plan.map((item) => async (): Promise<{ run: SearchRun; hits: SearchHit[] }> => {
      try {
        const hits = await deps.search(item);
        return {
          run: {
            query: item.query,
            platform: item.platform,
            status: "ok",
            resultCount: hits.length,
          },
          hits,
        };
      } catch (error) {
        return {
          run: {
            query: item.query,
            platform: item.platform,
            status: "failed",
            resultCount: 0,
            message:
              error instanceof ServiceError
                ? error.message
                : `检索 ${PLATFORM_LABELS[item.platform]} 时失败。`,
          },
          hits: [],
        };
      }
    }),
    3,
  );

  const runs = outcomes.map((outcome) => outcome.run);
  if (runs.every((run) => run.status === "failed")) {
    throw new ServiceError(
      "SEARCH_FAILED",
      "所有检索请求都失败了，未生成报告。请检查网络或 TAVILY_API_KEY 后重试。",
      { failedRuns: runs.length },
    );
  }

  const sources: SourceRecord[] = [];
  const seenUrls = new Set<string>();
  const fetchedAt = startedAt.toISOString();
  for (const outcome of outcomes) {
    if (outcome.run.status !== "ok") continue;
    for (const hit of outcome.hits) {
      if (!isHttpUrl(hit.url)) continue;
      const key = normalizeUrl(hit.url);
      if (seenUrls.has(key)) continue;
      if (sources.length >= 20) break;
      seenUrls.add(key);
      sources.push({
        id: `S${sources.length + 1}`,
        title: compact(hit.title || hostOf(hit.url), 240),
        url: hit.url,
        platform: inferPlatform(hit.url, outcome.run.platform),
        kind: "search",
        snippet: compact(
          hit.content || "搜索索引未提供摘要，请打开来源核实。",
          500,
        ),
        query: outcome.run.query,
        fetchedAt,
      });
    }
    if (sources.length >= 20) break;
  }

  const searchSourceCount = sources.length;
  const userSources = makeUserSources(input.idea, sources, sources.length + 1);
  sources.push(...userSources);

  const prompt = buildAnalysisPrompt({
    snapshot,
    scope,
    sources,
    queryRuns: runs.map((run) => ({
      query: run.query,
      platform: run.platform,
      resultCount: run.resultCount,
    })),
  });

  let raw: unknown;
  try {
    raw = await deps.analyze(prompt);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      "AI_FAILED",
      "模型分析失败，未生成报告。",
    );
  }

  const validation = validateAiReport(raw, sources);
  if (!validation.ok) {
    throw new ServiceError(
      validation.kind === "format" ? "AI_INVALID_OUTPUT" : "INVALID_CITATIONS",
      validation.message,
    );
  }

  const completedAt = now();
  const reportId = newId();

  if (searchSourceCount === 0) {
    // 至少一次检索成功但零有效来源：仍生成灵感建议，报告保持 empty。
    const report = emptyReport({
      id: reportId,
      idea: input.idea,
      startedAt,
      completedAt,
      scope,
      keywords,
      runs,
      sources,
      model: deps.model,
      draft: validation.draft,
    });
    assertReport(report);
    return report;
  }

  const report = buildReadyReport({
    id: reportId,
    idea: input.idea,
    startedAt,
    completedAt,
    scope,
    keywords,
    runs,
    sources,
    model: deps.model,
    draft: validation.draft,
    relatedWorks: validation.relatedWorks,
  });
  assertReport(report);
  return report;
}

function assertReport(report: ExploreReport): void {
  if (!isReportWithinSize(report)) {
    throw new ServiceError(
      "AI_INVALID_OUTPUT",
      "生成的报告超过大小限制，已拒绝保存。",
    );
  }
  const parsed = reportSchema.safeParse(report);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ServiceError(
      "AI_INVALID_OUTPUT",
      `生成的报告未通过服务端校验：${
        issue ? issue.path.join(".") || issue.message : "未知字段"
      }。`,
    );
  }
}
