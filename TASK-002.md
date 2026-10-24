# dsh 返工任务 002

首轮已由 Codex 中止，原因是你在为嵌套沙箱限制增加不必要的 Vite/Next workaround。主会话已直接运行原始 npm test 和 typecheck，环境允许正常启动子进程。请不要继续绕过，按以下任务完成代码与文档。

1. 阅读 REVIEW-001.md 并修复其中问题。两处失败断言你可能已经修正，核实即可。
2. 恢复标准测试和构建配置：npm test=vitest run，test:watch=vitest，build=next build；Next 配置删除 ignoreBuildErrors 与仅为沙箱添加的 experimental.workerThreads/cpus 等设置。删除你自己新增且不再需要的 scripts/vitest-win-shim.cjs（此文件是本轮生成的临时 workaround）。不修改 node_modules。
3. 实现真实 AI 关键词提取阶段，而不是标题前缀拼接。可复用 requestAiAnalysis，单独关键词 prompt，结构校验，最多 3 个关键词/查询构想。搜索计划使用关键词并保留实际查询。失败应明确失败，不伪装成功。总链路超时须匹配新增模型调用。
4. 修复 REVIEW-001 的持久化与假成功反馈。建议采用状态变更前先确认 saveWorkspace 成功的统一提交函数。备份失败时保持原始数据不受覆盖。测试涵盖这些边界。
5. 补齐 .env.example、README.md、docs/IMPLEMENTATION.md。写明来源仅是搜索索引摘要，真实联网评估尚未验收；关键词步骤现在是 AI。不要声称模型已联网成功。
6. 若有时间，零检索结果也能给创作者提供明确标注为“基于点子本身的建议”的延伸方向与 MVP，相关作品保持空，不能编造证据；若不实现，请在文档中准确说明该限制。

不要运行 Next build/Vitest，不要再研究沙箱 workaround。由 Codex 主会话运行测试、构建与浏览器验收。可运行 tsc 做快速自检。不要调用任何子 agent。完成后给出简短交付说明。
