# Phase G: 任务清单

## G1 — 对话驱动的工作区引导

### 初始实现
- [x] T1: 新建 `agent/workspace-bootstrap.ts` — loadWorkspaceBootstrapFiles + formatBootstrapBlock
- [x] T2: 安全检查 — 路径边界验证 + 2MB 上限
- [x] T3: mtime 缓存 — 避免重复读取
- [x] T4: 修改 `system-prompt.ts` — 增加 `bootstrapBlock` 字段 + 注入点
- [x] T5: 测试（初始）— 6 个断言（正常加载 / 缺失 / 超大 / 路径逃逸 / 缓存命中 / prompt 注入）

### G1 Redesign（对话驱动）
- [x] T5.1: 编写 Delta Spec — `specs/workspace-bootstrap/spec.md`（行为规格 + 场景）
- [x] T5.2: 更新 proposal.md — 修正 G1 范围（对话驱动），更新非目标
- [x] T5.3: 更新 design.md — 完整设计方案（启动时序 / 运行时数据流 / 对话流程 / 类型定义 / 模板内容）
- [x] T6: 6 个中文模板 — BOOTSTRAP / IDENTITY / USER / SOUL / AGENTS / TOOLS
- [x] T7: `ensureWorkspaceBootstrap()` — 自动种子（全新 vs 已有工作区）+ `writeFile(flag: 'wx')`
- [x] T8: `BOOTSTRAP.md` 特殊注入 — `<bootstrap-script>` 高优先级标签 + 主动开场指令
- [x] T9: `isBootstrapping` 状态 — loadResult 中标记首次引导
- [x] T10: 修改 `index.ts` — 启动时调用 `ensureWorkspaceBootstrap(getWorkspaceDir())`
- [x] T11: 修改 `default-engine.ts` — assemble() 加载引导文件 + 传入 buildSystemPrompt
- [x] T12: 测试（Redesign）— 19 个新断言
  - T12.1: ensureWorkspaceBootstrap 全新工作区（9 断言）
  - T12.2: ensureWorkspaceBootstrap 已有工作区（5 断言）
  - T12.3: BOOTSTRAP.md 对话引导流程（5 断言）

## G2 — 外部内容安全包装

- [x] T13: 编写 Delta Spec — `specs/security/spec.md`
- [x] T14: 新建 `security/external-content.ts` — wrapExternalContent + detectSuspiciousPatterns
- [x] T15: 14 种注入模式正则
- [x] T16: 随机 boundary ID 防欺骗
- [x] T17: 修改 `web-search.ts` — 包装搜索结果
- [x] T18: 修改 `web-fetch.ts` — 包装抓取结果
- [x] T19: 测试 — 14 个断言（正常包装 / 注入检测 / boundary 唯一性 / 嵌套防御 / 工具集成）

## G3 — Context Window Guard

- [x] T20: 编写 Delta Spec — `specs/context-engine/spec.md`（ADDED + MODIFIED）
- [x] T21: 新建 `providers/context-window.ts` — resolveContextWindow + MODEL_CONTEXT_WINDOWS 查表
- [x] T22: 配置覆盖 + provider fallback + 兜底链 + 前缀匹配
- [x] T23: evaluateContextWindowGuard() — warn/ok 级别检查
- [x] T24: 修改 `default-engine.ts` — 使用 resolveContextWindow 替代硬编码
- [x] T25: 测试 — 17 个断言（查表 / 前缀匹配 / 配置覆盖 / 兜底 / guard 警告 / guard 阻断）

## 统计

- 总断言数：64（G1:33 + G2:14 + G3:17）
- tsc --noEmit：✅ 零错误
- 现有测试：✅ 208 个不受影响
