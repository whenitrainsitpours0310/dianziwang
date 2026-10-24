"use client";

import { useRef, useState } from "react";

import { Modal } from "@/components/Modal";
import { UploadIcon } from "@/components/Icons";
import { formatDateTime } from "@/lib/format";
import {
  mergeImportedWorkspace,
  parseImportText,
  type ImportMode,
  type ValidationIssue,
} from "@/lib/validation";
import type { ImportPayload, Workspace } from "@/lib/types";

export function ImportDialog({
  current,
  onClose,
  onApplied,
}: {
  current: Workspace;
  onClose: () => void;
  onApplied: (workspace: Workspace, message: string) => {
    ok: boolean;
    error?: string;
  };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [payload, setPayload] = useState<ImportPayload | null>(null);
  const [errors, setErrors] = useState<ValidationIssue[]>([]);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [reading, setReading] = useState(false);
  const [applyError, setApplyError] = useState("");

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setPayload(null);
    setErrors([]);
    setApplyError("");
    if (file.size > 4 * 1024 * 1024) {
      setErrors([{ path: "文件", message: "导入文件不能超过 4 MB" }]);
      return;
    }
    setReading(true);
    try {
      const text = await file.text();
      const result = parseImportText(text);
      if (!result.ok || !result.data) {
        setErrors(result.errors);
        return;
      }
      setPayload(result.data);
    } catch {
      setErrors([{ path: "文件", message: "无法读取该文件。" }]);
    } finally {
      setReading(false);
    }
  };

  const apply = () => {
    if (!payload) return;
    const result = mergeImportedWorkspace(current, payload, mode);
    if (!result.ok || !result.workspace) {
      setApplyError(result.errors[0]?.message ?? "导入失败。");
      return;
    }
    const message =
      mode === "replace"
        ? `已替换为导入数据：${result.addedIdeas} 条灵感、${result.addedReports} 份报告。`
        : `导入完成：新增 ${result.addedIdeas} 条灵感、${result.addedReports} 份报告${
            result.skipped ? `，跳过 ${result.skipped} 条重复或无归属数据` : ""
          }。`;
    const outcome = onApplied(result.workspace, message);
    if (!outcome.ok) {
      setApplyError(outcome.error ?? "导入数据未能保存到本机。");
    }
  };

  return (
    <Modal
      title="导入灵感与报告"
      description="只接受点子王导出的 JSON。导入前会完整校验结构与报告来源引用。"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={`btn ${mode === "replace" ? "btn-danger" : "btn-primary"}`}
            disabled={!payload || reading}
            onClick={apply}
          >
            {mode === "replace" ? "确认替换" : "确认合并导入"}
          </button>
        </>
      }
    >
      <div className="import-body">
        <div
          className="file-drop"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void handleFile(event.dataTransfer.files[0]);
          }}
        >
          <UploadIcon size={24} />
          <strong>{fileName || "选择或拖入 JSON 文件"}</strong>
          <span className="micro">最大 4 MB · 数据只在本机处理</span>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
            aria-label="选择要导入的 JSON 文件"
          />
        </div>

        {reading ? <p className="micro">正在读取并校验…</p> : null}

        {errors.length ? (
          <div className="notice notice-error" role="alert">
            <strong>文件未通过校验</strong>
            <ul className="plain-list">
              {errors.map((error, index) => (
                <li key={`${error.path}-${index}`}>
                  {error.path}：{error.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {payload ? (
          <>
            <div className="import-preview">
              <div>
                <span className="preview-number">{payload.ideas.length}</span>
                <span className="micro">条灵感</span>
              </div>
              <div>
                <span className="preview-number">{payload.reports.length}</span>
                <span className="micro">份报告</span>
              </div>
              <div>
                <span className="preview-date">
                  {formatDateTime(payload.exportedAt)}
                </span>
                <span className="micro">导出时间</span>
              </div>
            </div>
            <p className="micro">
              当前本机：{current.ideas.length} 条灵感、{current.reports.length} 份报告。
              导入数据已通过层叠结构、URL、时间与报告引用校验。
            </p>

            <fieldset className="fieldset">
              <legend>导入方式</legend>
              <label className="radio-row">
                <input
                  type="radio"
                  name="import-mode"
                  value="merge"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                />
                <span>
                  <strong>合并（推荐）</strong>
                  <small>保留现有数据，跳过重复 ID。</small>
                </span>
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  name="import-mode"
                  value="replace"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                />
                <span>
                  <strong>替换全部本地数据</strong>
                  <small>用文件内容覆盖当前灵感与报告，不可撤销。</small>
                </span>
              </label>
            </fieldset>

            {mode === "replace" ? (
              <div className="notice notice-error" role="alert">
                <strong>替换会删除当前数据</strong>
                <p>
                  将覆盖现有的 {current.ideas.length} 条灵感与 {current.reports.length} 份报告。建议先关闭本窗口并导出备份。
                </p>
              </div>
            ) : null}
          </>
        ) : null}

        {applyError ? (
          <p className="field-error" role="alert">
            {applyError}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
