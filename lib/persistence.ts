import {
  parseStoredWorkspace,
  createImportPayload,
  storedWorkspaceSchema,
} from "@/lib/validation";
import type { ImportPayload, Workspace } from "@/lib/types";

export const WORKSPACE_STORAGE_KEY = "dianziwang.v1.workspace";
const MAX_STORAGE_BYTES = 4 * 1024 * 1024;
const CORRUPT_BACKUP_PREFIX = "dianziwang.v1.corrupt.";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LoadResult {
  workspace: Workspace;
  warning?: string;
  /**
   * 原始数据损坏且备份失败时为 true。调用方必须停止写入，
   * 否则会用空工作区覆盖唯一一份原始数据。
   */
  writeBlocked: boolean;
  /** 原始数据损坏但已成功备份；后续允许在备份存在的前提下覆盖原键。 */
  corruptBackedUp: boolean;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface SaveOptions {
  /**
   * 仅当加载阶段已成功备份损坏数据时由调用方显式开启；
   * 默认拒绝覆盖无法解析的既有数据。
   */
  allowOverwriteCorrupt?: boolean;
}

const emptyWorkspace = (): Workspace => ({ ideas: [], reports: [] });

/**
 * 读取本地工作区。数据损坏时不静默覆盖：原始字符串会另存到备份键，
 * 返回空工作区并附带说明。若备份也失败，则标记 writeBlocked，
 * 调用方不得再写原始键。
 */
export function loadWorkspace(
  storage: StorageLike,
  now: Date = new Date(),
): LoadResult {
  const raw = storage.getItem(WORKSPACE_STORAGE_KEY);
  if (raw === null) {
    return {
      workspace: emptyWorkspace(),
      writeBlocked: false,
      corruptBackedUp: false,
    };
  }

  const parsed = parseStoredWorkspace(raw);
  if (parsed.ok && parsed.data) {
    return {
      workspace: parsed.data,
      writeBlocked: false,
      corruptBackedUp: false,
    };
  }

  const backupKey = `${CORRUPT_BACKUP_PREFIX}${now
    .toISOString()
    .replace(/[:.]/g, "-")}`;
  let backedUp = false;
  try {
    storage.setItem(backupKey, raw);
    backedUp = true;
  } catch {
    backedUp = false;
  }
  if (backedUp) {
    return {
      workspace: emptyWorkspace(),
      warning: `本地数据格式异常，未加载。原始内容已备份到浏览器存储键 ${backupKey}，未上传到服务器。在继续记录前，建议先导出浏览器存储留档。`,
      writeBlocked: false,
      corruptBackedUp: true,
    };
  }
  return {
    workspace: emptyWorkspace(),
    warning:
      "本地数据格式异常，且自动备份失败。为避免覆盖唯一一份原始数据，本次已停止写入；请先导出浏览器存储或联系维护者排查。",
    writeBlocked: true,
    corruptBackedUp: false,
  };
}

export function saveWorkspace(
  storage: StorageLike,
  workspace: Workspace,
  now: Date = new Date(),
  options: SaveOptions = {},
): SaveResult {
  const payload = {
    version: 1 as const,
    savedAt: now.toISOString(),
    ideas: workspace.ideas,
    reports: workspace.reports,
  };
  const validation = storedWorkspaceSchema.safeParse(payload);
  if (!validation.success) {
    return { ok: false, error: "本地数据未通过校验，已停止写入以避免损坏。" };
  }
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).length > MAX_STORAGE_BYTES) {
    return {
      ok: false,
      error: "本地数据超过 4 MB，未能保存。可先导出并清理部分历史报告。",
    };
  }
  try {
    const existing = storage.getItem(WORKSPACE_STORAGE_KEY);
    if (
      existing !== null &&
      !options.allowOverwriteCorrupt &&
      !parseStoredWorkspace(existing).ok
    ) {
      return {
        ok: false,
        error:
          "本地已有无法解析的数据，且尚未确认备份，已停止写入以保留原始内容。",
      };
    }
    storage.setItem(WORKSPACE_STORAGE_KEY, serialized);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "浏览器本地存储写入失败（可能空间不足或处于隐私模式）。",
    };
  }
}

export function exportPayload(workspace: Workspace, now: Date = new Date()): ImportPayload {
  return createImportPayload(workspace, now);
}

export function exportJson(workspace: Workspace, now: Date = new Date()): string {
  return JSON.stringify(exportPayload(workspace, now), null, 2);
}
