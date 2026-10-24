import { describe, expect, it } from "vitest";

import { generateMarkdown, reportFileName } from "@/lib/markdown";
import { makeReport } from "./fixtures";

describe("Markdown development brief", () => {
  it("includes snapshot, evidence, sources and first-version advice", () => {
    const report = makeReport();
    const markdown = generateMarkdown(report);
    expect(markdown).toContain("# 开发需求：今天三件小事");
    expect(markdown).toContain("初始原文（只读）");
    expect(markdown).toContain("做一个只记录今天三件小事的桌面便签。");
    expect(markdown).toContain("## 3. 相关作品与证据");
    expect(markdown).toContain(
      "[S1 · 三件小事 · GitHub](https://github.com/example/three-things)",
    );
    expect(markdown).toContain("## 7. 第一版建议");
    expect(markdown).toContain("- [ ] 新增三件事");
    expect(markdown).toContain("搜索索引摘要");
    expect(markdown).toContain("未逐页打开原文");
    expect(markdown).toContain("未读取");
  });

  it("exports idea-only advice for an empty report without fabricating evidence", () => {
    const report = makeReport({
      status: "empty",
      summary: "本次检索未发现可核实的相关作品，以下建议仅基于点子本身，尚无检索证据。",
      relatedWorks: [],
      overlaps: [],
      differences: [],
      extensions: ["把三件事拆成早、中、晚三个时段。"],
      firstVersion: {
        concept: "只记录今天三件事的单页便签。",
        scope: ["新增三件事", "勾选完成"],
        steps: ["设计单页", "实现本地保存"],
        validation: ["连续使用三天"],
      },
      sources: [],
    });
    const markdown = generateMarkdown(report);
    expect(markdown).toMatch(/本次(?:检索)?未发现已核实的相关作品/);
    expect(markdown).toContain("本次没有已核实相关作品");
    expect(markdown).toContain("## 7. 第一版建议（基于点子本身，尚无检索证据）");
    expect(markdown).toContain("- [ ] 新增三件事");
    expect(markdown).toContain("## 8. 检索元信息");
    expect(markdown).not.toContain("### 1.");
  });

  it("keeps legacy empty reports readable without inventing advice", () => {
    const report = makeReport({
      status: "empty",
      summary: "当前范围未发现可核实的相关作品。",
      relatedWorks: [],
      overlaps: [],
      differences: [],
      extensions: [],
      firstVersion: { concept: "", scope: [], steps: [], validation: [] },
      sources: [],
    });
    const markdown = generateMarkdown(report);
    expect(markdown).toContain("当前范围未发现可核实的相关作品");
    expect(markdown).toContain("报告没有使用任何作品证据");
    expect(markdown).not.toContain("## 7. 第一版建议");
    expect(markdown).toContain("## 8. 检索元信息");
  });

  it("sanitizes filenames", () => {
    const report = makeReport({
      snapshot: {
        ...makeReport().snapshot,
        title: 'a/b:c*?"<>|',
      },
    });
    const name = reportFileName(report);
    expect(name).toMatch(/^点子王-开发需求-a-b-c-+2026-01-02\.md$/);
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });
});
