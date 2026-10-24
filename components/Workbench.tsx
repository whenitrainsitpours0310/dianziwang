"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/Modal";
import { ImportDialog } from "@/components/ImportDialog";
import { IdeaDetail } from "@/components/IdeaDetail";
import { LibraryPanel } from "@/components/LibraryPanel";
import { Toast, type ToastState } from "@/components/Toast";
import {
  DownloadIcon,
  SparkIcon,
  UploadIcon,
} from "@/components/Icons";
import {
  createIdea,
  updateIdea,
  type IdeaFilters,
} from "@/lib/ideas";
import {
  loadWorkspace,
  saveWorkspace,
  exportJson,
  type SaveResult,
} from "@/lib/persistence";
import { createSampleIdeas } from "@/lib/sample";
import { formatDateTime } from "@/lib/format";
import { LIMITS } from "@/lib/validation";
import type {
  ExploreReport,
  Idea,
  PublicServiceStatus,
  Workspace,
} from "@/lib/types";

type ConfirmState =
  | { kind: "delete-idea"; idea: Idea }
  | { kind: "delete-report"; report: ExploreReport }
  | { kind: "clear-examples" };

function downloadJson(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Workbench() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [reports, setReports] = useState<ExploreReport[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<IdeaFilters>({
    query: "",
    status: "all",
    tag: null,
  });
  const persistenceState = useRef({
    writeBlocked: false,
    corruptBackedUp: false,
  });
  const workspaceRef = useRef<Workspace>({ ideas: [], reports: [] });
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] =
    useState<PublicServiceStatus | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const notify = useCallback(
    (message: string, kind: "success" | "error" | "info" = "info") => {
      setToast({ id: Date.now() + Math.random(), message, kind });
    },
    [],
  );
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    try {
      const loaded = loadWorkspace(window.localStorage);
      persistenceState.current = {
        writeBlocked: loaded.writeBlocked,
        corruptBackedUp: loaded.corruptBackedUp,
      };
      workspaceRef.current = loaded.workspace;
      setIdeas(loaded.workspace.ideas);
      setReports(loaded.workspace.reports);
      setSelectedId(loaded.workspace.ideas[0]?.id ?? null);
      if (loaded.warning) setStorageWarning(loaded.warning);
    } catch {
      persistenceState.current = {
        writeBlocked: true,
        corruptBackedUp: false,
      };
      setStorageWarning(
        "浏览器禁止访问本地存储，本次记录无法持久保存。请退出隐私模式或允许站点存储后刷新。",
      );
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/config", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as PublicServiceStatus;
        if (
          !data ||
          typeof data !== "object" ||
          typeof data.search?.configured !== "boolean" ||
          typeof data.ai?.configured !== "boolean"
        ) {
          throw new Error("invalid status");
        }
        setServiceStatus(data);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setServiceError("服务状态接口不可用");
      });
    return () => controller.abort();
  }, []);

  /**
   * 统一提交函数：先把完整工作区写入本地存储，确认成功后才更新 React 状态。
   * 这样上限、配额或损坏保护导致的写入失败不会被界面误报为已保存。
   */
  const commitWorkspace = useCallback((next: Workspace): SaveResult => {
    if (persistenceState.current.writeBlocked) {
      const error =
        "本地数据处于写入保护状态（原始数据损坏且备份失败），修改未保存。请先导出浏览器存储留档。";
      setSaveError(error);
      return { ok: false, error };
    }
    try {
      const result = saveWorkspace(window.localStorage, next, new Date(), {
        allowOverwriteCorrupt: persistenceState.current.corruptBackedUp,
      });
      if (!result.ok) {
        setSaveError(result.error ?? "保存失败。");
        return result;
      }
      setIdeas(next.ideas);
      setReports(next.reports);
      workspaceRef.current = next;
      setSaveError(null);
      return { ok: true };
    } catch {
      persistenceState.current.writeBlocked = true;
      const error = "浏览器禁止访问本地存储，修改未能保存。";
      setSaveError(error);
      return { ok: false, error };
    }
  }, []);

  const selectedIdea = useMemo(
    () => ideas.find((idea) => idea.id === selectedId) ?? null,
    [ideas, selectedId],
  );

  const selectedReports = useMemo(
    () =>
      reports
        .filter((report) => report.ideaId === selectedId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [reports, selectedId],
  );

  const addIdea = (text: string): SaveResult => {
    if (ideas.length >= LIMITS.ideas) {
      return { ok: false, error: `最多保存 ${LIMITS.ideas} 条灵感。` };
    }
    try {
      const idea = createIdea(text);
      const result = commitWorkspace({ ideas: [idea, ...ideas], reports });
      if (!result.ok) return result;
      setSelectedId(idea.id);
      setMobileDetailOpen(true);
      setFilters({ query: "", status: "all", tag: null });
      notify("已记下并保存到本机。", "success");
      return { ok: true };
    } catch {
      return { ok: false, error: "记录失败，请重试。" };
    }
  };

  const selectIdea = (id: string) => {
    setSelectedId(id);
    setMobileDetailOpen(true);
  };

  const updateSelectedIdea = (
    patch: Partial<Omit<Idea, "id" | "originalText" | "createdAt">>,
  ) => {
    if (!selectedId) return;
    const nextIdeas = ideas.map((idea) =>
      idea.id === selectedId ? updateIdea(idea, patch) : idea,
    );
    commitWorkspace({ ideas: nextIdeas, reports });
  };

  const applyImport = (workspace: Workspace, message: string): SaveResult => {
    const result = commitWorkspace(workspace);
    if (!result.ok) return result;
    setSelectedId((current) => {
      if (current && workspace.ideas.some((idea) => idea.id === current)) {
        return current;
      }
      return workspace.ideas[0]?.id ?? null;
    });
    setImportOpen(false);
    notify(message, "success");
    return { ok: true };
  };

  const handleGenerated = (report: ExploreReport): SaveResult => {
    const current = workspaceRef.current;
    if (current.reports.length >= LIMITS.reports) {
      return {
        ok: false,
        error: `历史报告已达 ${LIMITS.reports} 份上限，未保存这份新报告。请先导出并删除旧报告。`,
      };
    }
    if (current.reports.some((item) => item.id === report.id)) {
      return { ok: true };
    }
    return commitWorkspace({
      ideas: current.ideas,
      reports: [report, ...current.reports],
    });
  };

  const removeIdea = (id: string) => {
    const remainingIdeas = ideas.filter((idea) => idea.id !== id);
    const result = commitWorkspace({
      ideas: remainingIdeas,
      reports: reports.filter((report) => report.ideaId !== id),
    });
    if (!result.ok) {
      notify(result.error ?? "删除未能保存。", "error");
      return;
    }
    if (selectedId === id) {
      setSelectedId(remainingIdeas[0]?.id ?? null);
      setMobileDetailOpen(false);
    }
    notify("灵感及其探索报告已删除。", "success");
  };

  const clearExamples = () => {
    const exampleIds = new Set(
      ideas.filter((idea) => idea.isExample).map((idea) => idea.id),
    );
    const remaining = ideas.filter((idea) => !exampleIds.has(idea.id));
    const result = commitWorkspace({
      ideas: remaining,
      reports: reports.filter((report) => !exampleIds.has(report.ideaId)),
    });
    if (!result.ok) {
      notify(result.error ?? "清除示例未能保存。", "error");
      return;
    }
    if (selectedId && exampleIds.has(selectedId)) {
      setSelectedId(remaining[0]?.id ?? null);
      setMobileDetailOpen(false);
    }
    notify("示例灵感已清除。", "success");
  };

  const confirmAction = () => {
    if (!confirm) return;
    if (confirm.kind === "delete-idea") {
      removeIdea(confirm.idea.id);
    } else if (confirm.kind === "delete-report") {
      const result = commitWorkspace({
        ideas,
        reports: reports.filter((report) => report.id !== confirm.report.id),
      });
      if (!result.ok) {
        notify(result.error ?? "删除报告未能保存。", "error");
      } else {
        notify("该份探索报告已删除。", "success");
      }
    } else if (confirm.kind === "clear-examples") {
      clearExamples();
    }
  };

  const confirmCopy = (() => {
    if (!confirm) return null;
    if (confirm.kind === "delete-idea") {
      const count = reports.filter(
        (report) => report.ideaId === confirm.idea.id,
      ).length;
      return {
        title: "删除这条灵感？",
        message: `「${confirm.idea.title}」${
          count ? `及其 ${count} 份探索报告` : ""
        }会从本机删除，无法撤销。初始原文也会一并删除。`,
        confirmLabel: "删除灵感",
        danger: true,
      };
    }
    if (confirm.kind === "delete-report") {
      return {
        title: "删除这份探索报告？",
        message: `${formatDateTime(
          confirm.report.createdAt,
        )} 的报告及当次灵感快照会从本机删除，无法撤销。灵感本身会保留。`,
        confirmLabel: "删除报告",
        danger: true,
      };
    }
    return {
      title: "清除全部示例灵感？",
      message:
        "将删除所有标记为「示例」的灵感和附带的探索报告。你自己记录的内容不会受影响。",
      confirmLabel: "清除示例",
      danger: true,
    };
  })();

  const exportData = () => {
    const text = exportJson({ ideas, reports });
    downloadJson(
      `点子王-数据备份-${new Date().toISOString().slice(0, 10)}.json`,
      text,
    );
    notify(
      `已导出 ${ideas.length} 条灵感、${reports.length} 份报告。`,
      "success",
    );
  };

  return (
    <div className="app-shell">
      <a href="#library" className="skip-link">
        跳到灵感库
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            点
          </span>
          <div className="brand-text">
            <h1 className="brand-name">点子王</h1>
            <span className="brand-tag">私密 · 轻量 · 个人创意工作台</span>
          </div>
        </div>
        <div className="topbar-actions">
          {serviceStatus ? (
            <span
              className={`service-chip${serviceStatus.search.configured && serviceStatus.ai.configured ? " is-ready" : ""}`}
              title="服务端探索能力状态"
            >
              <span className="status-dot" aria-hidden="true" />
              {serviceStatus.search.configured && serviceStatus.ai.configured
                ? "探索服务就绪"
                : "探索服务未配置"}
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setImportOpen(true)}
            disabled={!hydrated}
          >
            <UploadIcon size={15} />
            导入
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={exportData}
            disabled={!hydrated}
          >
            <DownloadIcon size={15} />
            导出
          </button>
        </div>
      </header>

      {!hydrated ? (
        <main className="workspace" aria-busy="true" aria-label="正在读取本地数据">
          <div className="library">
            <div className="library-inner">
              <div className="skeleton skeleton-capture" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-card" />
              <div className="skeleton skeleton-card" />
            </div>
          </div>
          <div className="detail-placeholder">
            <SparkIcon size={30} />
            <h2>正在打开你的工作台…</h2>
            <p>数据只从当前浏览器的本地存储读取。</p>
          </div>
        </main>
      ) : (
        <main className="workspace">
          <LibraryPanel
            ideas={ideas}
            filters={filters}
            onFiltersChange={setFilters}
            selectedId={selectedId}
            onSelect={selectIdea}
            onAdd={addIdea}
            onLoadExamples={() => {
              if (ideas.length) return;
              const examples = createSampleIdeas();
              const result = commitWorkspace({ ideas: examples, reports });
              if (!result.ok) {
                notify(result.error ?? "示例未能保存。", "error");
                return;
              }
              setSelectedId(examples[0]?.id ?? null);
              notify(
                "已载入 3 条示例灵感，均标记为「示例」，可逐条删除。",
                "info",
              );
            }}
            onClearExamples={() => setConfirm({ kind: "clear-examples" })}
            storageWarning={storageWarning}
            saveError={saveError}
          />

          {selectedIdea ? (
            <section
              className={`detail${mobileDetailOpen ? " is-open" : ""}`}
              aria-label="灵感详情与探索"
            >
              <IdeaDetail
                key={selectedIdea.id}
                idea={selectedIdea}
                reports={selectedReports}
                serviceStatus={serviceStatus}
                serviceError={serviceError}
                onUpdate={updateSelectedIdea}
                onDelete={() =>
                  setConfirm({ kind: "delete-idea", idea: selectedIdea })
                }
                onBack={() => setMobileDetailOpen(false)}
                onGenerated={handleGenerated}
                onRequestDeleteReport={(report) =>
                  setConfirm({ kind: "delete-report", report })
                }
                onNotify={notify}
              />
            </section>
          ) : (
            <section className="detail-placeholder" aria-label="开始使用">
              <div className="placeholder-mark" aria-hidden="true">
                <SparkIcon size={30} />
              </div>
              <h2>把点子养成作品</h2>
              <p>
                记下一句话，慢慢补充动机与来源。需要时再去公开世界里看看别人做到哪一步，留下可追溯的探索记录。
              </p>
              <ol className="placeholder-steps">
                <li>
                  <span>01</span> 在左侧记下一句灵感
                </li>
                <li>
                  <span>02</span> 补充上下文、标签和待核实链接
                </li>
                <li>
                  <span>03</span> 配置搜索与模型后生成探索报告
                </li>
              </ol>
              <p className="micro">
                不建立账户。记录默认保存在当前浏览器；主动探索时会把必要内容发送给你配置的搜索与模型服务。
              </p>
            </section>
          )}
        </main>
      )}

      {confirm && confirmCopy ? (
        <ConfirmDialog
          title={confirmCopy.title}
          message={confirmCopy.message}
          confirmLabel={confirmCopy.confirmLabel}
          danger={confirmCopy.danger}
          onConfirm={confirmAction}
          onClose={() => setConfirm(null)}
        />
      ) : null}

      {importOpen ? (
        <ImportDialog
          current={{ ideas, reports }}
          onClose={() => setImportOpen(false)}
          onApplied={applyImport}
        />
      ) : null}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
