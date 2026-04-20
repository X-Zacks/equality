# Proposal: Phase Z5-bugfixes — 工具配置卡布局 + 黑色主题 + 沙箱路径

## 背景

1. **工具配置卡布局 Bug**：设置 → 工具 Tab 中，选"全部"分类时 Web Search API Key 和 Chrome 路径配置卡显示在分类 tabs 上方，选其他分类时配置卡消失（截图确认）。根因：配置卡和分类 tabs 是并列关系，分类切换时配置卡未受保护。
2. **黑色主题不生效**：选择"🖤 纯黑"后界面仍显示深海蓝。根因：`App.tsx:189` 的 className 三元只区分 `purple`/`dark`，`black` fallback 到 `theme-dark`，导致 CSS `.app-root.theme-black` 变量永远不被应用。
3. **沙箱路径误拦截**：bash 工具访问 `C:\software\workspace-equality\` 下的文件被沙箱报"试图访问 workspace 外路径"。根因：`sandbox.ts` 中 `workspaceDir` 未经 `realpathSync` 规范化，与 `inputPath` 规范化后的路径不一致。

## 目标

- B1: 修复工具 Tab 布局 — 配置卡始终显示，不受分类筛选影响
- B2: 修复黑色主题 — className 正确映射 `theme-black`
- B3: 修复沙箱路径 — workspaceDir 也做 realpathSync 规范化

## 范围

| 变更 | 文件 | 影响 |
|------|------|------|
| 工具配置卡布局 | `Settings.tsx` | 小 |
| 黑色主题 className | `App.tsx` | 小（1 行） |
| 沙箱 workspaceDir 规范化 | `packages/core/src/tools/sandbox.ts` | 小（1 行） |
