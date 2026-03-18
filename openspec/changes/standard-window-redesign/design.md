# Design: 桌面客户端从浮窗改为标准窗口

## 影响范围

| 层 | 影响 | 改动量 |
|----|------|--------|
| `tauri.conf.json` | 窗口配置 | 重写 windows 节 |
| `src-tauri/src/window.rs` | 窗口生命周期 | 重写（show/hide → 标准窗口管理） |
| `src-tauri/src/hotkey.rs` | Alt+Space 热键 | 删除 |
| `src-tauri/src/tray.rs` | 托盘行为 | 修改（toggle → restore） |
| `src-tauri/src/lib.rs` | 启动流程 | 移除热键注册，添加关闭拦截 |
| `src/main.tsx` | 根组件 | 改为渲染 App |
| `src/App.tsx` | 主布局 | 重写（侧边栏 + 路由） |
| `src/App.css` | 主布局样式 | 重写 |
| `src/Chat.tsx` | 对话页面 | 新建（替代 FloatInput） |
| `src/Chat.css` | 对话样式 | 新建 |
| `src/Settings.tsx` | 设置页面 | 小改（移除 onClose 按钮，适配全页） |
| `src/Settings.css` | 设置样式 | 小改（移除浮窗圆角等） |
| `src/FloatInput.tsx` | 旧浮窗组件 | 删除 |
| `src/FloatInput.css` | 旧浮窗样式 | 删除 |
| `capabilities/default.json` | 权限 | 移除 drag 权限，添加 close 拦截权限 |
| **Core 后端** | **无变更** | — |

## 窗口配置变更

### Before（浮窗模式）
```json
{
  "label": "float",
  "width": 680, "height": 120,
  "decorations": false,
  "transparent": true,
  "alwaysOnTop": true,
  "visible": false,
  "skipTaskbar": true
}
```

### After（标准窗口模式）
```json
{
  "label": "main",
  "title": "Equality",
  "width": 900, "height": 640,
  "minWidth": 600, "minHeight": 400,
  "decorations": true,
  "transparent": false,
  "alwaysOnTop": false,
  "visible": true,
  "skipTaskbar": false,
  "center": true
}
```

## 前端布局设计

```
┌──────────────────────────────────────────────────┐
│  [系统标题栏: Equality]              [─] [□] [✕] │
├────┬─────────────────────────────────────────────┤
│    │                                             │
│ 💬 │   对话区域（占满剩余高度，向上滚动）           │
│    │                                             │
│ ⚙️ │   AI 回复...                                │
│    │   用户消息...                                │
│    │   AI 回复...                                │
│    │                                             │
│    ├─────────────────────────────────────────────┤
│    │  [输入框...                   ] [● ] [发送]  │
│    │  Enter 发送 · Shift+Enter 换行              │
├────┴─────────────────────────────────────────────┤
│  状态栏: ● Core 在线 | Copilot (claude-sonnet-4) │
└──────────────────────────────────────────────────┘
```

侧边栏宽度：48px（只放图标），不可伸缩。

## Rust 端改动

### window.rs
- 移除 `toggle()` / `hide()` / `WINDOW_VISIBLE` 原子状态
- 新增 `restore(app)` — 如果窗口存在则 show + set_focus，否则忽略
- 新增窗口关闭拦截：点击 ✕ 时 hide 而非 destroy，最小化到托盘

### hotkey.rs
- 整个文件删除（标准窗口不需要全局热键）

### tray.rs
- "显示 / 隐藏" 菜单改为 "显示 Equality"
- 左键单击：调用 `window::restore()`
- 右键菜单：显示 Equality、退出

### lib.rs
- 移除 `hotkey::register()` 调用
- 移除 `global-shortcut` 插件注册
- 添加 `on_window_event` 拦截 `CloseRequested`，改为 hide
- 移除 `hide_window` command（不再需要前端触发隐藏）

### capabilities/default.json
- `windows` 从 `["float"]` 改为 `["main"]`
- 移除 `core:window:allow-start-dragging`（有标题栏不需要）
- 移除 `global-shortcut` 权限（不再注册热键）

## 前端改动

### main.tsx
```tsx
// Before: <FloatInput />
// After:  <App />
import App from './App'
ReactDOM.createRoot(...).render(<App />)
```

### App.tsx（新主布局）
- 左侧 48px 侧边栏，两个导航按钮：💬 对话、⚙ 设置
- 右侧主内容区：根据选中页面渲染 `<Chat />` 或 `<Settings />`
- 底部状态栏：Core 在线状态 + 当前 Provider + 模型名

### Chat.tsx（新建，替代 FloatInput.tsx）
- 上方：消息列表区（flex-grow，overflow-y: auto，自动滚到底部）
- 下方：输入区（textarea + 发送按钮），固定在底部
- 消息气泡：用户消息右对齐深蓝底，AI 回复左对齐灰底
- 保留 Enter 发送 / Shift+Enter 换行 / streaming 光标闪烁
- 移除 Esc 隐藏窗口行为

### Settings.tsx（适配）
- 移除右上角 ✕ 关闭按钮（不再是弹窗，而是独立页面）
- 移除浮窗相关的圆角和透明度
- `onClose` prop 改为可选（侧边栏切换替代）

## 内容缩放（Zoom）

类似浏览器的 Ctrl+/- 缩放功能：

| 快捷键 | 行为 |
|--------|------|
| `Ctrl+=` / `Ctrl+鼠标滚轮↑` | 放大 10% |
| `Ctrl+-` / `Ctrl+鼠标滚轮↓` | 缩小 10% |
| `Ctrl+0` | 重置为 100% |

实现方式：在 App 根组件注册全局 `keydown` 和 `wheel` 事件监听器，通过 `document.body.style.zoom` 控制缩放。缩放级别存入 `localStorage('equality-zoom')`，启动时自动恢复。

范围：50% ~ 200%。非 100% 时在底部状态栏右侧显示当前百分比（如 `120%`）。

## 样式主题

保持现有深色主题基调，但移除浮窗特有样式：
- 移除 `backdrop-filter: blur()`（标准窗口不需要毛玻璃）
- 移除 `border-radius: 14px`（系统标题栏自带圆角）
- `body` 背景从 `transparent` 改为 `#1c1c1e`（深灰）
- 保留字体 `PingFang SC / Microsoft YaHei`
- 保留蓝色主题色 `#0a84ff`
