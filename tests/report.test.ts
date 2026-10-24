import { describe, expect, it } from "vitest";

import {
  aiDraftSchema,
  validateAiReport,
} from "@/lib/report-validation";
import { isReportWithinSize } from "@/lib/validation";
import { makeAiDraft, makeReport, makeSource } from "./fixtures";

const sources = [
  makeSource("S1"),
  makeSource("S2"),
  makeSource("S3", { kind: "user" }),
];

describe("AI report validation", () => {
  it("accepts a valid draft and maps source IDs", () => {
    const result = validateAiReport(makeAiDraft(), sources);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.relatedWorks[0].sourceIds).toEqual(["S1"]);
    expect(result.draft.summary).toContain("搜索索引");
  });

  it("rejects a malformed structure", () => {
    const result = validateAiReport({ summary: "只有结论" }, sources);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("format");
  });

  it("rejects unknown source IDs", () => {
    const draft = makeAiDraft({
      relatedWorks: [
        {
          ...makeAiDraft().relatedWorks[0],
          sourceIds: ["S99"],
        },
      ],
    });
    const result = validateAiReport(draft, sources);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("citations");
    expect(result.message).toContain("S99");
  });

  it("rejects citing a user-provided but unread link", () => {
    const draft = makeAiDraft({
      relatedWorks: [
        {
          ...makeAiDraft().relatedWorks[0],
          sourceIds: ["S3"],
        },
      ],
    });
    const result = validateAiReport(draft, sources);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("citations");
  });

  it("rejects URLs that are not in the known search source set", () => {
    const draft = makeAiDraft({
      summary: "详见 https://made-up.example.com/project 这个项目。",
    });
    const result = validateAiReport(draft, sources);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("citations");
  });

  it("allows an exact known source URL if the model repeats it", () => {
    const draft = makeAiDraft({
      summary: "索引摘要提到的链接是 https://github.com/example/three-things 。",
    });
    const result = validateAiReport(draft, sources);
    expect(result.ok).toBe(true);
  });

  it("rejects any related work when there are no search sources", () => {
    const result = validateAiReport(makeAiDraft(), [
      makeSource("S1", { kind: "user" }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("citations");
    expect(result.message).toContain("没有任何可引用");
  });

  it("rejects invented URLs when there are no search sources", () => {
    const draft = makeAiDraft({
      relatedWorks: [],
      summary: "详见 https://made-up.example.com/project 的经验。",
    });
    const result = validateAiReport(draft, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("citations");
  });

  it("accepts idea-only extensions with no works when there are no sources", () => {
    const result = validateAiReport(
      makeAiDraft({
        relatedWorks: [],
        overlaps: [],
        differences: [],
        extensions: ["先做一个单页版本。"],
      }),
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.relatedWorks).toEqual([]);
  });

  it("defaults optional arrays but still requires relatedWorks", () => {
    const minimal = {
      summary: "当前检索范围未发现可核实的相关作品。",
      relatedWorks: [],
    };
    const parsed = aiDraftSchema.safeParse(minimal);
    expect(parsed.success).toBe(true);
    const result = validateAiReport(minimal, sources);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.relatedWorks).toEqual([]);
  });

  it("rejects reports over the size limit", () => {
    const report = makeReport();
    expect(isReportWithinSize(report)).toBe(true);
    expect(
      isReportWithinSize({ ...report, summary: "x".repeat(100_000) }),
    ).toBe(false);
  });
});
