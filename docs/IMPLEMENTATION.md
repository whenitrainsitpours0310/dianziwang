# 实现与返工记录

## Codex 最终验收补记

2026-10-24：主会话独立执行标准生产构建通过（含 TypeScript 检查），最终 6 个测试文件、71 项测试全部通过。文案断言调整为接受“本次检索未发现”的等价表达，没有修改应用行为。浏览器记录流程、验证限制与配置后真实服务验收步骤见根目录 ACCEPTANCE.md；不得将夹具测试等同于真实联网评估。

## 本轮（TASK-003 最后一轮产品闭环）

关联：`TASK-003.md`

### 本轮结论

- 已补齐“零检索结果没有建议”的闭环：至少一次检索成功但零有效来源时，仍调用模型生成基于灵感的延伸方向与第一版建议，报告保持 `empty`，相关作品与重合/差异强制为空。
- 单个可引用来源不再被拒绝：会正常分析并引用该来源，同时标注覆盖有限。
- `empty` 报告现在显示建议并允许复制/下载 Markdown；Markdown 明确“没有已核实相关作品”，不包含作品证据。
- 全部检索失败仍返回 `SEARCH_FAILED`，不会被当作零结果成功。
- 未运行 `npm test`、`npm run build` 或浏览器验收，按任务约定由 Codex 主会话执行；本轮运行了 `npx tsc --noEmit`，通过（无输出、退出码 0）。

### 逐项实现

1. **零有效来源仍给建议**
   - `lib/server/explore.ts`：只要不是全部检索失败，就去掉“零来源直接返回”的分支，改为调用 `deps.analyze`。
   - 零来源时使用独立的 idea-only prompt；报告 `status` 固定为 `empty`，`relatedWorks` / `overlaps` / `differences` 强制为空，保留 `searchRuns`、`queries`、`keywords`、来源与模型信息。
   - 摘要固定说明“本次检索未发现可核实的相关作品，以下延伸方向与第一版建议仅基于点子本身，尚无检索证据”，并在 limitations 加入同义提示。
   - 分析模型失败仍返回 `AI_FAILED`，不会生成伪报告。

2. **单来源可分析**
   - 删除 `INSUFFICIENT_SOURCES` 的运行时门槛（错误码类型保留以兼容历史前端映射，但不再抛出）。
   - 只有 1 条搜索来源时正常进入模型分析与引用校验，并在 limitations 增加“本次仅有 1 条可引用来源，覆盖有限”。

3. **empty 报告展示与导出**
   - `components/ReportView.tsx`：复制/下载按钮对所有报告显示；有建议的 `empty` 报告展示延伸方向与第一版建议，并标明“基于点子本身的建议，尚无检索证据”。
   - `lib/markdown.ts`：`empty` 分支新增“相关作品与证据”明确无已核实作品、可选延伸方向与第一版建议、检索元信息、来源清单与局限；历史空报告仍可生成 Markdown，只是不补造建议。

4. **模型输出强制校验**
   - `lib/report-validation.ts`：没有可引用搜索来源时，任何 `relatedWorks` 直接返回 `citations` 错误；URL 仍只能匹配已知搜索来源，零来源时任何自造 URL 都会被拒绝。
   - 服务端报告 schema 与大小校验继续兜底。
   - 新增回归用例：零结果建议、单来源、全部失败、零来源伪造作品/source ID、零来源自造 URL、idea-only prompt 不包含来源槽位。

5. **文档**
   - `README.md` 的探索链路与已知限制更新为零结果/单来源的真实行为。
   - 本文件补充本轮实现与验证记录。

### 主要改动文件

- `lib/server/explore.ts`
- `lib/server/prompt.ts`
- `lib/report-validation.ts`
- `lib/markdown.ts`
- `components/ReportView.tsx`
- `components/ExplorePanel.tsx`
- `tests/explore.test.ts`
- `tests/report.test.ts`
- `tests/markdown.test.ts`
- `README.md`
- `docs/IMPLEMENTATION.md`

### 验证记录

| 检查 | 状态 | 说明 |
| --- | --- | --- |
| `npx tsc --noEmit` | 通过 | 无输出、退出码 0。 |
| `npm test` | 未运行 | 按任务约定交由 Codex 主会话执行。 |
| `npm run build` | 未运行 | 同上。 |
| 浏览器验收 | 未执行 | 同上。 |
| 真实 Tavily / 模型联网 | 未验收 | 无真实凭据；夹具测试不能替代。 |

---

## TASK-002 返工记录

本轮（TASK-002 返工）  
关联：`TASK-002.md`、`REVIEW-001.md`

## 本轮结论

- 已按 `REVIEW-001.md` 处理 5 项问题，并完成 `TASK-002.md` 的配置恢复、AI 关键词阶段、持久化提交和文档补齐。
- 本轮**没有运行** `npm test`、`npm run build` 或浏览器验收；按任务约定由 Codex 主会话独立执行。
- 本轮只运行了 `npx tsc --noEmit` 做静态自检，结果通过（无输出、退出码 0）。
- 真实联网评估**尚未验收**：工作区没有真实的 `TAVILY_API_KEY` / `AI_API_KEY`，不能把夹具测试或静态检查当作联网成功。

## 对 REVIEW-001 的逐项处理

### 1. 两处失败断言

- `tests/explore.test.ts`：检索计划现在来自 AI 关键词，不再用标题拼接。测试改为验证"关键词即实际查询"，并按 2 个关键词 × 2 个平台断言 4 次检索、2 个唯一实际查询。原先对唯一 query 数量的旧断言不再适用。
- `tests/markdown.test.ts`：期望链接标签与 fixture 中的来源标题 `三件小事 · GitHub` 一致；`lib/markdown.ts` 仍使用来源中文标题渲染 `[S1 · 标题](url)`。语义已核对。

### 2. 空状态隐私文案

- `components/Workbench.tsx` 空状态改为："不建立账户。记录默认保存在当前浏览器；主动探索时会把必要内容发送给你配置的搜索与模型服务。"
- `components/ExplorePanel.tsx` 在生成按钮附近新增说明：点击生成会把灵感的必要内容发送给配置的搜索与模型服务；记录本身仍只在本机。

### 3. 损坏数据覆盖风险

- `lib/persistence.ts` 的 `loadWorkspace` 返回 `writeBlocked` 与 `corruptBackedUp`。
- 原始数据损坏且备份失败时：`writeBlocked = true`，返回空工作区但不允许后续写入原始键。
- `saveWorkspace` 默认拒绝覆盖无法解析的既有数据；只有加载阶段确认备份成功，调用方显式传入 `allowOverwriteCorrupt: true` 才允许覆盖。
- `Workbench` 统一使用 `commitWorkspace`，写入保护状态下直接拒绝修改并提示先导出浏览器存储。
- 回归测试覆盖：备份失败时保持原始字符串不变、默认拒绝覆盖、确认备份后放行、后续写入失败不破坏旧数据。

### 4. 假成功反馈

- `components/Workbench.tsx` 新增统一提交函数 `commitWorkspace`：先 `saveWorkspace`，成功后才 `setIdeas` / `setReports`。
- `handleGenerated` 返回 `{ ok, error }`，报告份数上限或本地写入失败不再提示"已保存"。
- `ExplorePanel` 只有保存成功后才提示"已生成并保存到本机"；失败显示 `PERSIST_FAILED`，且不把报告加入界面。
- 新增灵感、导入、删除、清除示例、载入示例同样改为先保存后更新状态；新增成功文案不再承诺刷新后一定保留。
- `ImportDialog` 接收保存结果，导入写入失败会显示错误而不是关闭并报成功。

### 5. 真实 AI 关键词提取

- 新增 `lib/server/keywords.ts`：
  - 独立 JSON schema，字段 `keywords`，1-3 个，每个最长 40 字符。
  - 去空白、去重；拒绝空值、URL 和超出结构上限的输出。
  - 失败抛出 `AI_INVALID_OUTPUT`，不退回标题/标签拼接。
- `lib/server/prompt.ts` 新增 `buildKeywordPrompt`，作为独立系统 prompt；关键词输入只包含灵感的必要字段，并明确数据不可信。
- `lib/server/explore.ts`：
  - `ExploreDependencies` 新增 `extractKeywords`。
  - 先提取关键词，再用关键词生成每平台检索计划；最多 3 个关键词、最多 6 次检索。
  - 实际查询原样进入 `searchRuns`，报告新增 `keywords` 字段并保留去重后的 `queries`。
  - 关键词阶段模型失败映射为 `AI_FAILED`，结构非法映射为 `AI_INVALID_OUTPUT`。
- `app/api/explore/route.ts` 复用 `requestAiAnalysis`，关键词调用设置较小 `max_tokens`。
- 链路超时：单次模型 35 秒；`maxDuration` 从 60 调到 120；前端中止从 75 秒调到 110 秒，覆盖两次模型调用加检索。
- 报告 schema 为 `keywords` 提供空数组默认值，兼容本轮之前保存的旧报告。

## 配置与构建恢复

- `package.json`：
  - `test` = `vitest run`
  - `test:watch` = `vitest`
  - `build` = `next build`
  - 保留独立 `typecheck` = `tsc --noEmit`
- `next.config.ts` 删除 `typescript.ignoreBuildErrors`、`experimental.workerThreads` 及沙箱注释；保留安全响应头。
- `vitest.config.mts` 删除非标准 `pool: "threads"`，使用 Vitest 默认池。
- 删除 `scripts/vitest-win-shim.cjs` 及空 `scripts/` 目录。
- 未修改 `node_modules`。

## 主要改动文件

新增：

- `.env.example`
- `README.md`
- `docs/IMPLEMENTATION.md`
- `lib/server/keywords.ts`
- `tests` 中新增关键词与持久化边界用例

修改：

- `package.json`
- `next.config.ts`
- `vitest.config.mts`
- `lib/types.ts`
- `lib/validation.ts`
- `lib/persistence.ts`
- `lib/markdown.ts`
- `lib/server/prompt.ts`
- `lib/server/ai.ts`
- `lib/server/explore.ts`
- `app/api/explore/route.ts`
- `components/Workbench.tsx`
- `components/ExplorePanel.tsx`
- `components/IdeaDetail.tsx`
- `components/ImportDialog.tsx`
- `components/ReportView.tsx`
- `tests/fixtures.ts`
- `tests/explore.test.ts`
- `tests/validation.test.ts`
- `tests/api.test.ts`

## 验证记录

| 检查 | 状态 | 说明 |
| --- | --- | --- |
| `npx tsc --noEmit` | 通过 | 本轮已运行，无输出、退出码 0。 |
| `npm test` | 未运行 | 按 `TASK-002.md` 与用户指令交由 Codex 主会话执行。 |
| `npm run build` | 未运行 | 同上。 |
| 浏览器验收 | 未执行 | 同上。 |
| 真实 Tavily / 模型联网 | 未验收 | 无真实凭据；夹具测试不能替代。 |

## 交付后建议由主会话执行的命令

```bash
npm test
npm run build
npm run dev
```

浏览器重点核对：

1. 无凭据时探索区显示缺少变量，记录功能正常。
2. 配好凭据后，报告里的"AI 提取关键词"与实际检索词不同，且实际检索词逐条可见。
3. 关键词阶段返回非法 JSON 时显示 `AI_INVALID_OUTPUT`，不发起检索、不保存报告。
4. 达到 500 份报告上限时，界面提示未保存，不出现成功 Toast。
5. 模拟 `localStorage.setItem` 失败时，新增、编辑、导入、报告保存都显示失败且旧数据仍在。
6. 本地数据损坏且备份失败时，界面提示写入保护，原始存储字符串不被覆盖。
7. 窄屏下新增隐私说明与探索按钮不溢出。

## 已知限制

- 搜索只覆盖 Tavily 公开索引摘要，不逐页打开原文，不读取用户链接。
- TASK-003 已补齐“零检索结果时基于点子本身生成延伸方向与 MVP”：报告仍保持 `empty`、相关作品为空，并明确标注尚无检索证据；单来源也会分析并标注覆盖有限。全部检索失败仍直接失败。
- 真实外部服务端到端验收仍未完成，需用户提供凭据后执行。
