# Phase V: UI 集成与增强 — 技术规格

## V1: Skills 详情展开

### 后端
- `GET /skills` 增加 `body` 字段（SKILL.md 正文，截取前 2000 字符）

### 前端
- `Settings.tsx` Skills Tab：每个 skill-item 可点击展开/折叠
- 展开后显示 SKILL.md 正文（Markdown 渲染或 pre 块）

## V2: 紫色主题

### CSS 变量
- 新增 `.app-root.theme-purple` CSS 变量集，以紫色为主色调
- `--bg-app: #1a0a2e`，`--accent: #a855f7` 等

### 类型
- `ThemePreference` 由 `'system' | 'light' | 'dark'` 改为 `'system' | 'purple' | 'dark'`
- `EffectiveTheme` 由 `'light' | 'dark'` 改为 `'purple' | 'dark'`

### 持久化
- localStorage key 不变，值 `'light'` 自动迁移为 `'purple'`

## V3: DiffPreview 集成

### 工具卡片
- `Chat.tsx` 中 write_file/edit_file 工具的展开体增加 Diff 预览
- 使用已有的 `DiffPreview.tsx` 组件
- 仅在 `tc.status === 'done'` 且 `tc.args.content` 存在时渲染

## V4: Phase U 前端配额 UI

### 设置页（U8）
- 模型 Tab 底部增加"月度配额"区域
- 每个 provider 一行：输入框设置上限 + 进度条显示当前用量

### Chat 预警条（U9）
- SSE `done` 事件 `quotaWarning` 字段解析
- 渲染黄色（warn）或红色（critical/exhausted）提示条

## V5: TaskProgressBar SSE 绑定

### 后端
- 新增 SSE 事件 `plan_progress`：`{ completed, total, runningNode, estimatedMs }`

### 前端
- Chat.tsx 监听 `plan_progress` 事件，驱动 TaskProgressBar 显示
