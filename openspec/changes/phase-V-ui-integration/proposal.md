# Phase V: UI 集成与增强 — 提案

## 背景

Phase A～U 中创建了多个前端组件（DiffPreview、TaskProgressBar、RoleIcon、StatusBadge），
但尚未集成到主 UI 流程中。同时 Skills 设置页缺少详情展开功能，主题系统需要增加紫色主题。

## 目标

1. **Skills 详情展开**（13.3.2）：设置页 Skills Tab 支持展开查看 SKILL.md 完整内容
2. **紫色主题**（13.4.1）：将"白色"主题替换为"紫色"主题
3. **DiffPreview 集成**（18.2）：write_file/edit_file 工具卡片内嵌 Diff 预览
4. **TaskProgressBar 绑定**（18.3）：通过 SSE plan_progress 事件驱动进度条
5. **Phase U 前端配额 UI**（18.0）：设置页配额配置 + Chat 配额预警条

## 优先级

- P0: Skills 详情展开、紫色主题（直接可实现）
- P1: DiffPreview 集成、Phase U 配额 UI
- P2: TaskProgressBar SSE 绑定
