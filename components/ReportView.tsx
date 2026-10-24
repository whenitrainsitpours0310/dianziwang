"use client";

import { useMemo } from "react";

import {
  CopyIcon,
  DownloadIcon,
  ExternalIcon,
  LinkIcon,
} from "@/components/Icons";
import { formatDateTime } from "@/lib/format";
import {
  generateMarkdown,
  reportFileName,
  reportHasAdvice,
} from "@/lib/markdown";
import {
  IDEA_STATUS_LABELS,
  MOTIVATION_LABELS,
  PLATFORM_LABELS,
  type ExploreReport,
} from "@/lib/types";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportView({
  report,
  onNotify,
}: {
  report: ExploreReport;
  onNotify: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const markdown = useMemo(() => generateMarkdown(report), [report]);
  const userSources = report.sources.filter((source) => source.kind === "user");
  const hasAdvice = reportHasAdvice(report);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      onNotify("开发需求已复制到剪贴板。", "success");
    } catch {
      onNotify("复制失败，请检查浏览器剪贴板权限。", "error");
    }
  };

  return (
    <article className="report-view" aria-label="探索报告">
      <header className="report-head">
        <div>
          <div className="report-eyebrow">
            <span className={`report-badge report-badge--${report.status}`}>
              {report.status === "ready" ? "探索完成" : "当前范围未发现"}
            </span>
            <time dateTime={report.createdAt}>{formatDateTime(report.createdAt)}</time>
          </div>
          <h3>{report.snapshot.title}</h3>
          <p className="micro">
            模型：{report.model || "—"} · 来源 {report.sources.length} 条
          </p>
        </div>
        <div className="report-actions">
          <button type="button" className="btn btn-ghost btn-small" onClick={copy}>
            <CopyIcon size={15} />
            复制 Markdown
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => {
              downloadText(reportFileName(report), markdown);
              onNotify("开发需求已开始下载。", "success");
            }}
          >
            <DownloadIcon size={15} />
            下载
          </button>
        </div>
      </header>

      <details className="snapshot">
        <summary>
          评估时的灵感快照 · {formatDateTime(report.snapshot.capturedAt)}
        </summary>
        <div className="snapshot-body">
          <p>
            <strong>初始原文（只读）：</strong>
            {report.snapshot.originalText}
          </p>
          <p>
            <strong>当时标题：</strong>
            {report.snapshot.title} · 状态：
            {IDEA_STATUS_LABELS[report.snapshot.status]} · 动机：
            {report.snapshot.motivation
              ? MOTIVATION_LABELS[report.snapshot.motivation]
              : "未填写"}
          </p>
          {report.snapshot.content ? (
            <p>
              <strong>当时补充说明：</strong>
              {report.snapshot.content}
            </p>
          ) : null}
          {report.snapshot.tags.length ? (
            <p>
              <strong>当时标签：</strong>
              {report.snapshot.tags.join("、")}
            </p>
          ) : null}
          <p className="micro">报告保存后不受后续编辑影响。</p>
        </div>
      </details>

      <section className="report-section">
        <h4>结论</h4>
        <p className="report-summary">{report.summary}</p>
      </section>

      <section className="report-section">
        <h4>检索范围与词</h4>
        <div className="meta-chips">
          {report.scope.map((platform) => (
            <span key={platform} className="meta-chip">
              {PLATFORM_LABELS[platform]}
            </span>
          ))}
        </div>
        <div className="query-list">
          {report.queries.map((query) => (
            <code key={query}>{query}</code>
          ))}
        </div>
        {report.keywords.length ? (
          <p className="micro">
            AI 提取的关键词：{report.keywords.join("、")}。下方列表是实际发出的检索词。
          </p>
        ) : null}
        <ul className="run-list">
          {report.searchRuns.map((run, index) => (
            <li key={`${run.platform}-${run.query}-${index}`}>
              <span className={`run-dot run-dot--${run.status}`} aria-hidden="true" />
              <span className="run-platform">{PLATFORM_LABELS[run.platform]}</span>
              <span className="run-query">{run.query}</span>
              <span className={run.status === "failed" ? "run-failed" : "micro"}>
                {run.status === "ok" ? `${run.resultCount} 条` : "失败"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {report.relatedWorks.length > 0 ? (
        <section className="report-section">
          <h4>相关作品与证据</h4>
          <p className="micro">
            以下摘要来自搜索索引，系统没有逐页打开原文；引用编号可在来源清单中追溯。
          </p>
          <div className="work-list">
            {report.relatedWorks.map((work, index) => (
              <article key={`${work.title}-${index}`} className="work-card">
                <h5>{work.title}</h5>
                <div className="work-sources">
                  {work.sourceIds.map((sourceId) => {
                    const source = report.sources.find((item) => item.id === sourceId);
                    if (!source) return null;
                    return (
                      <a
                        key={sourceId}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={source.url}
                      >
                        {sourceId} · {source.title}
                        <ExternalIcon size={12} />
                      </a>
                    );
                  })}
                </div>
                <div className="evidence">
                  <span className="evidence-label">证据摘要 · 搜索索引</span>
                  <p>{work.summary}</p>
                </div>
                <div className="compare">
                  <div>
                    <h6>重合</h6>
                    <p>{work.overlap || "报告未给出明确重合点。"}</p>
                  </div>
                  <div>
                    <h6>差异与机会</h6>
                    <p>{work.difference || "报告未给出明确差异点。"}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="report-section">
          <div className="notice notice-empty">
            <strong>当前范围未发现可核实的相关作品</strong>
            <p>
              {hasAdvice
                ? "以下延伸方向与第一版建议仅基于这条灵感本身，尚无检索证据，也不代表市场不存在类似作品。导出内容会明确标注没有已核实相关作品。"
                : "这次没有足够证据形成作品列表，也没有生成第一版建议。可以扩大检索范围、换一种描述，或稍后重试；这不代表全网不存在类似作品。"}
            </p>
          </div>
        </section>
      )}

      {report.overlaps.length || report.differences.length ? (
        <section className="report-section split-sections">
          {report.overlaps.length ? (
            <div>
              <h4>整体重合</h4>
              <ul className="plain-list">
                {report.overlaps.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.differences.length ? (
            <div>
              <h4>整体差异与机会</h4>
              <ul className="plain-list">
                {report.differences.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {report.extensions.length ? (
        <section className="report-section">
          <h4>可以延伸的方向</h4>
          <ul className="plain-list">
            {report.extensions.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.status === "ready" || hasAdvice ? (
        <section className="report-section first-version">
          <h4>第一版建议</h4>
          {report.status === "empty" ? (
            <p className="micro">
              基于点子本身的建议，尚无检索证据；请把它当作待验证的假设。
            </p>
          ) : null}
          <p className="concept">{report.firstVersion.concept || "暂无明确概念。"}</p>
          {report.firstVersion.scope.length ? (
            <>
              <h6>MVP 范围</h6>
              <ul className="check-list">
                {report.firstVersion.scope.map((item, index) => (
                  <li key={`${item}-${index}`}>
                    <span className="checkbox" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {report.firstVersion.steps.length ? (
            <>
              <h6>实施步骤</h6>
              <ol className="step-list">
                {report.firstVersion.steps.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ol>
            </>
          ) : null}
          {report.firstVersion.validation.length ? (
            <>
              <h6>如何验证</h6>
              <ul className="plain-list">
                {report.firstVersion.validation.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="report-section">
        <h4>来源清单</h4>
        <ul className="source-list">
          {report.sources.map((source) => (
            <li key={source.id}>
              <div className="source-head">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={source.url}
                >
                  <span className="source-id">{source.id}</span>
                  {source.title}
                  <ExternalIcon size={12} />
                </a>
                <span className="source-platform">
                  {source.platform === "user"
                    ? "用户提供"
                    : PLATFORM_LABELS[source.platform]}
                </span>
                <span
                  className={
                    source.kind === "user" ? "unread-badge" : "snippet-badge"
                  }
                >
                  {source.kind === "user" ? "未读取" : "索引摘要"}
                </span>
              </div>
              <p className="source-snippet">{source.snippet}</p>
              {source.query ? (
                <p className="micro">来源检索词：{source.query}</p>
              ) : null}
            </li>
          ))}
        </ul>
        {userSources.length ? (
          <p className="micro source-note">
            <LinkIcon size={13} /> 用户链接只作为待核实线索，系统不会访问，也不能作为相关作品的证据。
          </p>
        ) : null}
      </section>

      <section className="report-section limitations">
        <h4>局限与说明</h4>
        <ul className="plain-list">
          {report.limitations.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
        {report.status === "empty" ? (
          <p className="micro">
            {hasAdvice
              ? "本报告没有已核实作品；所有建议仅基于灵感本身，复制或下载的 Markdown 也会明确标注，不包含作品证据。"
              : "本报告仅保留检索记录，没有作品证据，也没有第一版建议。"}
          </p>
        ) : null}
      </section>
    </article>
  );
}
