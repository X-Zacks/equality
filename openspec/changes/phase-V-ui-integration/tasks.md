# Phase V: UI 集成与增强 — 实施任务

## V1: Skills 详情展开

- [x] V1.1: 后端 `GET /skills` 增加 `body` 字段
- [x] V1.2: 前端 Skills Tab 支持展开/折叠查看 SKILL.md 正文
- [x] V1.3: CSS `.skill-expand` + `.skill-body` 样式

## V2: 紫色主题

- [x] V2.1: App.css 新增 `.app-root.theme-purple` CSS 变量
- [x] V2.2: App.tsx `ThemePreference`/`EffectiveTheme` 类型改为 purple
- [x] V2.3: Settings.tsx 主题按钮 light→purple
- [x] V2.4: Settings.css `.theme-light` → `.theme-purple` 选择器 + 紫色配色
- [x] V2.5: App.tsx effectiveTheme/className/background 适配 purple

## V3: DiffPreview 集成

- [x] V3.1: Chat.tsx write_file/edit_file 卡片展开时渲染 DiffPreview
- [x] V3.2: DiffPreview 的 Accept/Reject 按钮暂为无操作（文件已写入）

## V4: Phase U 前端配额 UI

- [x] V4.1: 设置页模型 Tab 底部增加 QuotaSection 配额管理区
- [x] V4.2: Chat.tsx done 事件解析 quotaWarning，渲染提示条
- [x] V4.3: CSS `.quota-warning` + `.quota-bar` 样式

## V5: TaskProgressBar SSE 绑定

- [ ] V5.1: 后端 runner.ts 发送 plan_progress SSE 事件
- [ ] V5.2: 前端 Chat.tsx 监听 plan_progress 渲染 TaskProgressBar

## 测试

- [ ] V6.1: 手动验证 Skills 展开显示 SKILL.md 内容
- [ ] V6.2: 紫色主题切换无样式错乱
- [ ] V6.3: DiffPreview 在 write_file 卡片中正确渲染
- [ ] V6.4: 配额设置保存 + 预警条显示
