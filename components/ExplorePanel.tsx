"use client";

import { useEffect, useRef, useState } from "react";

import { ReportView } from "@/components/ReportView";
import { SparkIcon, TrashIcon } from "@/components/Icons";
import { formatDateTime } from "@/lib/format";
import { reportSchema } from "@/lib/validation";
import {
  PLATFORMS,
  PLATFORM_HINTS,
  PLATFORM_LABELS,
  type ExploreReport,
  type Idea,
  type Platform,
  type PublicServiceStatus,
} from "@/lib/types";

interface ExploreError {
  code: string;
  message: string;
  hint?: string;
}

const ERROR_HINTS: Record<string, string> = {
  CONFIG_MISSING:
    "记录功能仍然可用。请按 README 配置服务端环境变量并重启应用。",
  SEARCH_FAILED:
    "搜索服务没有成功返回结果。检查网络和 TAVILY_API_KEY 后可以重试；失败不会被当作成功报告保存。",
  AI_FAILED:
    "模型服务请求失败，未生成报告。请检查模型配置、额度或稍后重试。",
  AI_INVALID_OUTPUT:
    "模型返回的格式不符合服务端要求（可能是关键词或报告结构），已拒绝保存。可以重试一次。",
  INVALID_CITATIONS:
    "模型引用了不可追溯的来源或自造 URL，报告已被拒绝。可以重试一次。",
  PERSIST_FAILED:
    "服务端已返回报告，但本地保存失败，因此没有把它当作已保存。请清理浏览器存储空间或导出备份后重试。",
  RATE_LIMITED: "每分钟最多发起 5 次探索请求，请稍后再试。",
  INVALID_INPUT: "请求内容未通过校验，请检查输入长度和链接格式。",
  PAYLOAD_TOO_LARGE: "请求内容过大，请缩短补充说明或减少链接。",
};

export function ExplorePanel({
  idea,
  serviceStatus,
  serviceError,
  reports,
  onGenerated,
  onRequestDeleteReport,
  onNotify,
}: {
  idea: Idea;
  serviceStatus: PublicServiceStatus | null;
  serviceError: string | null;
  reports: ExploreReport[];
  onGenerated: (report: ExploreReport) => { ok: boolean; error?: string };
  onRequestDeleteReport: (report: ExploreReport) => void;
  onNotify: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const [scope, setScope] = useState<Platform[]>([...PLATFORMS]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ExploreError | null>(null);
  const [activeId, setActiveId] = useState<string | null>(
    reports[0]?.id ?? null,
  );
  const abortRef = useRef<AbortController | null>(null);

  const canGenerate =
    !!serviceStatus?.search.configured && !!serviceStatus?.ai.configured;

  useEffect(() => {
    if (reports.length === 0) {
      setActiveId(null);
      return;
    }
    if (!activeId || !reports.some((report) => report.id === activeId)) {
      setActiveId(reports[0].id);
    }
  }, [reports, activeId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const activeReport = reports.find((report) => report.id === activeId) ?? null;

  const toggleScope = (platform: Platform) => {
    setScope((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform],
    );
  };

  const generate = async () => {
    if (loading || !canGenerate || scope.length === 0) return;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 110_000);
    try {
      const response = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, scope }),
        signal: controller.signal,
      });
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (
        !response.ok ||
        !payload ||
        typeof payload !== "object" ||
        !("ok" in payload) ||
        payload.ok !== true
      ) {
        const body =
          payload && typeof payload === "object" && "error" in payload
            ? (payload as { error?: { code?: string; message?: string } }).error
            : undefined;
        const code = body?.code ?? `HTTP_${response.status}`;
        setError({
          code,
          message: body?.message ?? `请求失败（HTTP ${response.status}）。`,
          hint: ERROR_HINTS[code],
        });
        return;
      }
      const parsed = reportSchema.safeParse(
        (payload as { report?: unknown }).report,
      );
      if (!parsed.success) {
        setError({
          code: "CLIENT_VALIDATION",
          message: "服务端返回的报告未通过前端校验，未保存。",
          hint: "请稍后重试；若持续出现，请查看 docs/IMPLEMENTATION.md。",
        });
        return;
      }
      const saved = onGenerated(parsed.data);
      if (!saved.ok) {
        setError({
          code: "PERSIST_FAILED",
          message: saved.error ?? "报告未能保存到本机。",
          hint: ERROR_HINTS.PERSIST_FAILED,
        });
        return;
      }
      setActiveId(parsed.data.id);
      onNotify(
        parsed.data.status === "ready"
          ? "探索报告已生成并保存到本机。"
          : "检索完成：未发现可核实作品，已保存基于灵感的第一版建议。",
        "success",
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError({
          code: "CLIENT_TIMEOUT",
          message: "请求超时或已被取消，未保存报告。",
          hint: "请检查网络后重试。",
        });
      } else {
        setError({
          code: "NETWORK_ERROR",
          message: "无法连接探索接口，未保存报告。",
          hint: "请确认应用仍在运行，然后重试。",
        });
      }
    } finally {
      clearTimeout(timer);
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  };

  return (
    <section className="explore" aria-labelledby="explore-title">
      <div className="section-heading">
        <div>
          <div className="section-kicker">联网探索</div>
          <h2 id="explore-title">看看别人做到哪一步</h2>
        </div>
        <SparkIcon size={22} className="section-icon" />
      </div>
      <p className="section-lede">
        在公开索引中查找相关作品，再由模型整理差异与第一版建议。只展示可追溯来源，不做商业评分。
      </p>

      {serviceError ? (
        <div className="notice notice-error" role="alert">
          <strong>无法获取服务配置状态</strong>
          <p>{serviceError}。记录功能不受影响。</p>
        </div>
      ) : null}

      {!serviceStatus && !serviceError ? (
        <div className="service-status">
          <span className="status-dot is-pending" aria-hidden="true" />
          正在检查服务端配置…
        </div>
      ) : null}

      {serviceStatus && !canGenerate ? (
        <div className="config-warning" role="status">
          <strong>探索服务未配置</strong>
          <p>
            记录、编辑、本地保存和导入导出都可以正常使用；只有在配置服务端环境变量后才会发起真实检索与模型分析。
          </p>
          {serviceStatus.search.missing.length ||
          serviceStatus.ai.missing.length ? (
            <p className="micro">
              缺少：
              {[...serviceStatus.search.missing, ...serviceStatus.ai.missing].join(
                "、",
              )}
            </p>
          ) : null}
          <p className="micro">配置方法见 README.md 与 .env.example，密钥只在服务端读取。</p>
        </div>
      ) : null}

      {serviceStatus && canGenerate ? (
        <div className="service-status">
          <span className="status-dot" aria-hidden="true" />
          搜索与模型已就绪
          {serviceStatus.ai.model ? (
            <span className="service-model">{serviceStatus.ai.model}</span>
          ) : null}
        </div>
      ) : null}

      <fieldset className="scope-fieldset" disabled={loading}>
        <legend>公开索引范围</legend>
        <div className="scope-grid">
          {PLATFORMS.map((platform) => {
            const checked = scope.includes(platform);
            return (
              <label
                key={platform}
                className={`scope-option${checked ? " is-checked" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleScope(platform)}
                />
                <span className="scope-check" aria-hidden="true">
                  {checked ? "✓" : ""}
                </span>
                <span>
                  <strong>{PLATFORM_LABELS[platform]}</strong>
                  <small>{PLATFORM_HINTS[platform]}</small>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="explore-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={generate}
          disabled={loading || !canGenerate || scope.length === 0}
        >
          {loading ? <span className="spinner" aria-hidden="true" /> : <SparkIcon size={16} />}
          {loading ? "拆词、检索、整理中…" : "生成探索报告"}
        </button>
        <span className="micro">
          {loading
            ? "最长约 110 秒（关键词与报告两次模型调用），请保持页面打开。"
            : "每次生成都会保存当次灵感快照。"}
        </span>
      </div>
      <p className="micro explore-note">
        点击生成会把这条灵感的必要内容发送给你配置的搜索与模型服务；记录本身仍只保存在本机，不会上传到其他服务。
      </p>
      <p className="micro explore-note">
        只检索公开索引，不登录平台、不绕过限制，也不会访问你填写的链接。每次探索最多 6 次检索，每分钟最多 5 次请求。
      </p>

      {error ? (
        <div className="notice notice-error" role="alert">
          <strong>{error.message}</strong>
          {error.hint ? <p>{error.hint}</p> : null}
          <span className="error-code">错误码：{error.code}</span>
        </div>
      ) : null}

      {reports.length > 0 ? (
        <div className="history">
          <div className="history-head">
            <h3>探索历史</h3>
            <span className="micro">{reports.length} 份</span>
          </div>
          <ul className="history-list">
            {reports.map((report) => (
              <li key={report.id}>
                <button
                  type="button"
                  className={`history-main${report.id === activeId ? " is-active" : ""}`}
                  onClick={() => setActiveId(report.id)}
                  aria-pressed={report.id === activeId}
                >
                  <span
                    className={`history-status history-status--${report.status}`}
                  >
                    {report.status === "ready" ? "完成" : "未发现"}
                  </span>
                  <span className="history-time">
                    {formatDateTime(report.createdAt)}
                  </span>
                  <span className="history-meta">
                    {report.sources.length} 来源 · {report.queries.length} 检索词
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onRequestDeleteReport(report)}
                  aria-label={`删除 ${formatDateTime(report.createdAt)} 的报告`}
                >
                  <TrashIcon size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {activeReport ? (
        <ReportView
          key={activeReport.id}
          report={activeReport}
          onNotify={onNotify}
        />
      ) : null}
    </section>
  );
}
