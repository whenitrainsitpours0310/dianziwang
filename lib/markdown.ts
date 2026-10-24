import { formatDate, formatDateTime } from "@/lib/format";
import {
  IDEA_STATUS_LABELS,
  MOTIVATION_LABELS,
  PLATFORM_LABELS,
  type ExploreReport,
  type RelatedWork,
  type SourceRecord,
} from "@/lib/types";

function sourceById(report: ExploreReport, id: string): SourceRecord | undefined {
  return report.sources.find((source) => source.id === id);
}

function safeInline(text: string): string {
  return text.replace(/\r?\n+/g, " ").trim();
}

function renderWork(report: ExploreReport, work: RelatedWork, index: number): string {
  const links = work.sourceIds
    .map((id) => {
      const source = sourceById(report, id);
      return source ? `[${id} · ${safeInline(source.title)}](${source.url})` : `[${id}]`;
    })
    .join("、");
  const lines = [
    `### ${index + 1}. ${safeInline(work.title)}`,
    "",
    `- 来源：${links}`,
    `- 证据摘要：${safeInline(work.summary)}`,
  ];
  if (work.overlap) lines.push(`- 与我们重合：${safeInline(work.overlap)}`);
  if (work.difference) lines.push(`- 差异与机会：${safeInline(work.difference)}`);
  return lines.join("\n");
}

/** 是否包含基于灵感生成的延伸方向或第一版建议。 */
export function reportHasAdvice(report: ExploreReport): boolean {
  const first = report.firstVersion;
  return (
    report.extensions.length > 0 ||
    first.concept.trim().length > 0 ||
    first.scope.length > 0 ||
    first.steps.length > 0 ||
    first.validation.length > 0
  );
}

function appendFirstVersion(
  lines: string[],
  report: ExploreReport,
  heading: string,
): void {
  lines.push(
    heading,
    "",
    `**概念**：${safeInline(report.firstVersion.concept) || "待补充"}`,
    "",
  );
  if (report.firstVersion.scope.length) {
    lines.push(
      "**MVP 范围**",
      "",
      ...report.firstVersion.scope.map((item) => `- [ ] ${safeInline(item)}`),
      "",
    );
  }
  if (report.firstVersion.steps.length) {
    lines.push(
      "**实施步骤**",
      "",
      ...report.firstVersion.steps.map(
        (item, index) => `${index + 1}. ${safeInline(item)}`,
      ),
      "",
    );
  }
  if (report.firstVersion.validation.length) {
    lines.push(
      "**验证方式**",
      "",
      ...report.firstVersion.validation.map((item) => `- ${safeInline(item)}`),
      "",
    );
  }
}

function appendSources(lines: string[], report: ExploreReport): void {
  lines.push("## 9. 来源清单", "");
  for (const source of report.sources) {
    if (source.kind === "search") {
      const platform =
        source.platform === "user"
          ? "用户提供"
          : PLATFORM_LABELS[source.platform];
      lines.push(
        `- [${source.id}] [${safeInline(source.title)}](${source.url}) — ${platform}，搜索索引摘要`,
      );
    } else {
      lines.push(
        `- [${source.id}] [${safeInline(source.title)}](${source.url}) — 用户提供，**未读取**`,
      );
    }
  }
}

export function generateMarkdown(report: ExploreReport): string {
  const { snapshot } = report;
  const lines: string[] = [
    `# 开发需求：${safeInline(snapshot.title)}`,
    "",
    `> 由「点子王」基于 ${formatDateTime(report.createdAt)} 的灵感快照生成。`,
    report.status === "empty"
      ? reportHasAdvice(report)
        ? "> 本次检索未发现已核实的相关作品；报告不含作品证据，以下建议仅基于灵感本身，尚无检索证据。"
        : "> 本次检索未发现已核实的相关作品；报告不含作品证据。"
      : "> 相关作品来自公开搜索索引的摘要，未逐页打开原文核实；用户提供的链接未读取，不能作为证据。",
    "",
    "## 1. 灵感快照",
    "",
    `- 初始原文（只读）：${safeInline(snapshot.originalText)}`,
    `- 标题：${safeInline(snapshot.title)}`,
    `- 状态：${IDEA_STATUS_LABELS[snapshot.status]}`,
    `- 创作动机：${snapshot.motivation ? MOTIVATION_LABELS[snapshot.motivation] : "未填写"}`,
    `- 标签：${snapshot.tags.length ? snapshot.tags.join("、") : "无"}`,
    "",
  ];

  if (snapshot.content.trim()) {
    lines.push("### 补充说明", "", snapshot.content.trim(), "");
  }

  if (report.status === "empty") {
    lines.push(
      "## 2. 探索结论",
      "",
      `当前检索范围：${report.scope.map((item) => PLATFORM_LABELS[item]).join("、")}。`,
      "",
      safeInline(report.summary) || "当前范围未发现可核实的相关作品。",
      "",
      "## 3. 相关作品与证据",
      "",
      "本次没有已核实相关作品，报告没有使用任何作品证据；这不代表全网不存在类似作品。",
      "",
    );
    if (report.extensions.length) {
      lines.push(
        "## 6. 可延伸方向（基于点子本身，尚无检索证据）",
        "",
        ...report.extensions.map((item) => `- ${safeInline(item)}`),
        "",
      );
    }
    if (reportHasAdvice(report)) {
      appendFirstVersion(
        lines,
        report,
        "## 7. 第一版建议（基于点子本身，尚无检索证据）",
      );
    }
    lines.push(
      "## 8. 检索元信息",
      "",
      `- 检索范围：${report.scope.map((item) => PLATFORM_LABELS[item]).join("、")}`,
      `- 检索时间：${formatDateTime(report.createdAt)}`,
      `- 模型：${safeInline(report.model) || "—"}`,
      `- AI 提取关键词：${report.keywords.length ? report.keywords.map((keyword) => `\`${safeInline(keyword)}\``).join("、") : "—"}`,
      `- 实际检索词：${report.queries.map((query) => `\`${safeInline(query)}\``).join("、")}`,
    );
    for (const run of report.searchRuns) {
      lines.push(
        `- ${PLATFORM_LABELS[run.platform]} · \`${safeInline(run.query)}\` · ${
          run.status === "ok" ? `${run.resultCount} 条结果` : "检索失败"
        }`,
      );
    }
    lines.push("");
    if (report.sources.length) {
      appendSources(lines, report);
      lines.push("", "以上来源未作为相关作品证据，仅保留检索记录。", "");
    }
    lines.push("## 10. 局限与待核实", "");
    for (const item of report.limitations) lines.push(`- ${safeInline(item)}`);
    const unread = report.sources.filter((source) => source.kind === "user");
    if (unread.length) {
      lines.push("", "用户提供但尚未读取的链接（不要当作已验证事实）：", "");
      for (const source of unread) lines.push(`- [${source.id}] ${source.url}`);
    }
    lines.push(
      "",
      "---",
      "",
      `本需求由点子王基于 ${formatDate(report.createdAt)} 的灵感与检索记录整理生成；没有已核实的相关作品，请自行验证后再投入开发。`,
      "",
    );
    return `${lines.join("\n").trim()}\n`;
  }

  lines.push(
    "## 2. 探索结论",
    "",
    safeInline(report.summary),
    "",
    "## 3. 相关作品与证据",
    "",
    ...(report.relatedWorks.length
      ? report.relatedWorks.map((work, index) => renderWork(report, work, index))
      : ["当前范围未发现可核实的相关作品。"]),
    "",
  );

  const addList = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push(`## ${title}`, "", ...items.map((item) => `- ${safeInline(item)}`), "");
  };

  addList("4. 重合与差异：重合", report.overlaps);
  addList("5. 重合与差异：差异与机会", report.differences);
  addList("6. 可延伸方向", report.extensions);

  appendFirstVersion(lines, report, "## 7. 第一版建议");

  lines.push("## 8. 检索元信息", "");
  lines.push(
    `- 检索范围：${report.scope.map((item) => PLATFORM_LABELS[item]).join("、")}`,
    `- 检索时间：${formatDateTime(report.createdAt)}`,
    `- 模型：${safeInline(report.model) || "—"}`,
    `- AI 提取关键词：${report.keywords.length ? report.keywords.map((keyword) => `\`${safeInline(keyword)}\``).join("、") : "—"}`,
    `- 实际检索词：${report.queries.map((query) => `\`${safeInline(query)}\``).join("、")}`,
  );
  for (const run of report.searchRuns) {
    lines.push(
      `- ${PLATFORM_LABELS[run.platform]} · \`${safeInline(run.query)}\` · ${
        run.status === "ok" ? `${run.resultCount} 条结果` : "检索失败"
      }`,
    );
  }
  lines.push("");
  appendSources(lines, report);
  lines.push("", "## 10. 局限与待核实", "");
  for (const item of report.limitations) lines.push(`- ${safeInline(item)}`);
  const unread = report.sources.filter((source) => source.kind === "user");
  if (unread.length) {
    lines.push("", "用户提供但尚未读取的链接（不要当作已验证事实）：", "");
    for (const source of unread) lines.push(`- [${source.id}] ${source.url}`);
  }
  lines.push(
    "",
    "---",
    "",
    `本需求由点子王基于 ${formatDate(report.createdAt)} 的检索与模型整理生成，请自行复核来源后再投入开发。`,
    "",
  );
  return lines.join("\n").trimEnd() + "\n";
}

export function reportFileName(report: ExploreReport): string {
  const base = safeInline(report.snapshot.title)
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 40);
  const date = report.createdAt.slice(0, 10);
  return `点子王-开发需求-${base || "未命名"}-${date}.md`;
}
