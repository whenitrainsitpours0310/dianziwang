import { describe, expect, it } from "vitest";

import {
  importPayloadSchema,
  parseImportText,
  parseStoredWorkspace,
  reportSchema,
  storedWorkspaceSchema,
} from "@/lib/validation";
import {
  WORKSPACE_STORAGE_KEY,
  exportJson,
  loadWorkspace,
  saveWorkspace,
} from "@/lib/persistence";
import { createImportPayload, mergeImportedWorkspace } from "@/lib/validation";
import {
  IDEA_ID,
  MemoryStorage,
  NOW,
  makeIdea,
  makeReport,
} from "./fixtures";

function exportText() {
  const text = exportJson(
    { ideas: [makeIdea()], reports: [makeReport()] },
    NOW,
  );
  return text;
}

describe("import validation", () => {
  it("accepts a complete export with valid citations", () => {
    const payload = JSON.parse(exportText());
    expect(importPayloadSchema.safeParse(payload).success).toBe(true);
    const parsed = parseImportText(exportText());
    expect(parsed.ok).toBe(true);
    expect(parsed.data?.ideas).toHaveLength(1);
    expect(parsed.data?.reports).toHaveLength(1);
  });

  it("rejects malformed JSON and unknown formats", () => {
    expect(parseImportText("{not json").ok).toBe(false);
    const payload = JSON.parse(exportText());
    payload.format = "other-app";
    const parsed = parseImportText(JSON.stringify(payload));
    expect(parsed.ok).toBe(false);
    expect(parsed.errors[0]?.path).toContain("format");
  });

  it("rejects javascript and credential URLs", () => {
    const payload = JSON.parse(exportText());
    payload.ideas[0].userLinks = ["javascript:alert(1)"];
    expect(parseImportText(JSON.stringify(payload)).ok).toBe(false);

    const credential = JSON.parse(exportText());
    credential.ideas[0].userLinks = ["https://user:pass@example.com/a"];
    expect(parseImportText(JSON.stringify(credential)).ok).toBe(false);
  });

  it("rejects duplicate IDs and orphan reports", () => {
    const duplicate = JSON.parse(exportText());
    duplicate.ideas.push(duplicate.ideas[0]);
    expect(parseImportText(JSON.stringify(duplicate)).ok).toBe(false);

    const orphan = JSON.parse(exportText());
    orphan.reports[0].ideaId = "33333333-3333-4333-8333-333333333333";
    const parsed = parseImportText(JSON.stringify(orphan));
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((issue) => issue.path.includes("ideaId"))).toBe(
      true,
    );
  });

  it("rejects a report that cites an unknown source", () => {
    const payload = JSON.parse(exportText());
    payload.reports[0].relatedWorks[0].sourceIds = ["S9"];
    const parsed = parseImportText(JSON.stringify(payload));
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((issue) => issue.message.includes("S9"))).toBe(
      true,
    );
  });

  it("rejects a report that cites an unread user source", () => {
    const payload = JSON.parse(exportText());
    payload.reports[0].relatedWorks[0].sourceIds = ["S3"];
    const parsed = parseImportText(JSON.stringify(payload));
    expect(parsed.ok).toBe(false);
    expect(
      parsed.errors.some((issue) => issue.message.includes("未读取")),
    ).toBe(true);
  });

  it("rejects oversized files before parsing", () => {
    const huge = `{"padding":"${"x".repeat(4 * 1024 * 1024 + 1)}"}`;
    const parsed = parseImportText(huge);
    expect(parsed.ok).toBe(false);
    expect(parsed.errors[0]?.message).toContain("4 MB");
  });
});

describe("merge semantics", () => {
  it("merges without overwriting existing data and skips duplicates", () => {
    const current = { ideas: [makeIdea()], reports: [] };
    const incoming = createImportPayload(
      { ideas: [makeIdea(), makeIdea({ id: "44444444-4444-4444-8444-444444444444", title: "另一条" })], reports: [] },
      NOW,
    );
    const result = mergeImportedWorkspace(current, incoming, "merge");
    expect(result.ok).toBe(true);
    expect(result.addedIdeas).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.workspace?.ideas[0].title).toBe("今天三件小事");
  });

  it("replace uses only imported data", () => {
    const current = { ideas: [makeIdea({ title: "旧数据" })], reports: [] };
    const incoming = createImportPayload(
      { ideas: [makeIdea({ title: "新数据" })], reports: [] },
      NOW,
    );
    const result = mergeImportedWorkspace(current, incoming, "replace");
    expect(result.workspace?.ideas.map((idea) => idea.title)).toEqual(["新数据"]);
  });
});

describe("persistence", () => {
  it("round-trips ideas and reports through local storage", () => {
    const storage = new MemoryStorage();
    const workspace = { ideas: [makeIdea()], reports: [makeReport()] };
    const saved = saveWorkspace(storage, workspace, NOW);
    expect(saved.ok).toBe(true);
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).not.toBeNull();

    const loaded = loadWorkspace(storage, NOW);
    expect(loaded.warning).toBeUndefined();
    expect(loaded.workspace.ideas).toHaveLength(1);
    expect(loaded.workspace.reports[0].relatedWorks[0].sourceIds).toEqual(["S1"]);
  });

  it("refuses to save an orphan report or invalid URL", () => {
    const storage = new MemoryStorage();
    const orphan = {
      ideas: [],
      reports: [makeReport({ ideaId: IDEA_ID })],
    };
    const saved = saveWorkspace(storage, orphan, NOW);
    expect(saved.ok).toBe(false);

    const invalid = {
      ideas: [makeIdea({ userLinks: ["javascript:alert(1)"] })],
      reports: [],
    };
    expect(saveWorkspace(storage, invalid, NOW).ok).toBe(false);
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).toBeNull();
  });

  it("backs up corrupt data instead of silently discarding it", () => {
    const storage = new MemoryStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, "{broken");
    const loaded = loadWorkspace(storage, NOW);
    expect(loaded.workspace.ideas).toHaveLength(0);
    expect(loaded.warning).toContain("备份");
    expect(loaded.writeBlocked).toBe(false);
    expect(loaded.corruptBackedUp).toBe(true);
    const backupKeys = [...storage.data.keys()].filter((key) =>
      key.startsWith("dianziwang.v1.corrupt."),
    );
    expect(backupKeys).toHaveLength(1);
    expect(storage.getItem(backupKeys[0])).toBe("{broken");
  });

  it("blocks writes and preserves raw data when corrupt backup fails", () => {
    const storage = new MemoryStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, "{broken");
    storage.failWritesWhen = (key) =>
      key.startsWith("dianziwang.v1.corrupt.");

    const loaded = loadWorkspace(storage, NOW);
    expect(loaded.workspace.ideas).toHaveLength(0);
    expect(loaded.writeBlocked).toBe(true);
    expect(loaded.corruptBackedUp).toBe(false);
    expect(loaded.warning).toContain("停止写入");

    const saved = saveWorkspace(
      storage,
      { ideas: [makeIdea()], reports: [] },
      NOW,
    );
    expect(saved.ok).toBe(false);
    expect(saved.error).toContain("无法解析");
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).toBe("{broken");
  });

  it("allows overwriting corrupt data only after a confirmed backup", () => {
    const storage = new MemoryStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, "{broken");
    const loaded = loadWorkspace(storage, NOW);
    expect(loaded.corruptBackedUp).toBe(true);

    const blocked = saveWorkspace(
      storage,
      { ideas: [makeIdea()], reports: [] },
      NOW,
    );
    expect(blocked.ok).toBe(false);

    const allowed = saveWorkspace(
      storage,
      { ideas: [makeIdea()], reports: [] },
      NOW,
      { allowOverwriteCorrupt: true },
    );
    expect(allowed.ok).toBe(true);
    expect(loadWorkspace(storage, NOW).workspace.ideas).toHaveLength(1);
  });

  it("leaves previously saved data intact when a later write fails", () => {
    const storage = new MemoryStorage();
    const first = { ideas: [makeIdea()], reports: [] };
    expect(saveWorkspace(storage, first, NOW).ok).toBe(true);
    const before = storage.getItem(WORKSPACE_STORAGE_KEY);

    storage.failWrites = true;
    const saved = saveWorkspace(
      storage,
      { ideas: [makeIdea({ title: "未写入" })], reports: [] },
      NOW,
    );
    expect(saved.ok).toBe(false);
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).toBe(before);
  });

  it("reports quota/write failures instead of claiming success", () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    const saved = saveWorkspace(
      storage,
      { ideas: [makeIdea()], reports: [] },
      NOW,
    );
    expect(saved.ok).toBe(false);
    expect(saved.error).toContain("写入失败");
  });

  it("exports a payload that imports back", () => {
    const text = exportText();
    const imported = parseImportText(text);
    expect(imported.ok).toBe(true);
  });

  it("stored workspace schema catches cross-reference errors", () => {
    const parsed = storedWorkspaceSchema.safeParse({
      version: 1,
      savedAt: NOW.toISOString(),
      ideas: [],
      reports: [makeReport()],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("report schema guards", () => {
  it("requires works when ready and none when empty", () => {
    expect(reportSchema.safeParse(makeReport()).success).toBe(true);
    expect(
      reportSchema.safeParse(makeReport({ relatedWorks: [] })).success,
    ).toBe(false);
    expect(
      reportSchema.safeParse(
        makeReport({ status: "empty" }),
      ).success,
    ).toBe(false);
  });

  it("parses a stored workspace with no data", () => {
    const result = parseStoredWorkspace(
      JSON.stringify({
        version: 1,
        savedAt: NOW.toISOString(),
        ideas: [],
        reports: [],
      }),
    );
    expect(result.ok).toBe(true);
  });
});
