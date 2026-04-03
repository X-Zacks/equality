# Phase G: 任务清单

## G1 — 工作区引导文件

- [x] T1: 新建 `agent/workspace-bootstrap.ts` — loadWorkspaceBootstrapFiles + formatBootstrapBlock
- [x] T2: 安全检查 — 路径边界验证 + 2MB 上限
- [x] T3: mtime 缓存 — 避免重复读取
- [x] T4: 修改 `system-prompt.ts` — 注入引导文件到 prompt 尾部
- [x] T5: 测试 — 6 个断言（正常加载 / 缺失 / 超大 / 路径逃逸 / 缓存命中 / prompt 注入）

## G2 — 外部内容安全包装

- [x] T6: 新建 `security/external-content.ts` — wrapExternalContent + detectSuspiciousPatterns
- [x] T7: 14 种注入模式正则
- [x] T8: 随机 boundary ID 防欺骗
- [x] T9: 修改 `web-search.ts` — 包装搜索结果
- [x] T10: 修改 `web-fetch.ts` — 包装抓取结果
- [x] T11: 测试 — 8 个断言（正常包装 / 注入检测 / boundary 唯一性 / 嵌套防御）

## G3 — Context Window Guard

- [x] T12: 新建 `providers/context-window.ts` — resolveContextWindow + MODEL_CONTEXT_WINDOWS 查表
- [x] T13: 配置覆盖 + provider fallback + 兜底链
- [x] T14: 修改 `default-engine.ts` — 使用 resolveContextWindow
- [x] T15: 测试 — 6 个断言（查表 / 前缀匹配 / 配置覆盖 / 兜底 / guard 警告 / guard 阻断）
