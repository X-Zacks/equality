# Tasks: 桌面客户端从浮窗改为标准窗口

## 1. Tauri 配置变更

- [x] 1.1 修改 `tauri.conf.json`：窗口 label 从 `float` 改为 `main`，启用装饰（标题栏），禁用透明和 alwaysOnTop，尺寸改为 900×640，显示在任务栏
- [x] 1.2 修改 `capabilities/default.json`：windows 从 `["float"]` 改为 `["main"]`，移除 `core:window:allow-start-dragging` 和 `global-shortcut` 相关权限

## 2. Rust 端改造

- [x] 2.1 重写 `window.rs`：移除 toggle/hide/WINDOW_VISIBLE，新增 `restore()` 函数（show + set_focus）
- [x] 2.2 删除 `hotkey.rs`（整个文件）
- [x] 2.3 修改 `tray.rs`：菜单改为"显示 Equality" + "退出"，左键单击调用 `window::restore()`
- [x] 2.4 修改 `lib.rs`：移除 hotkey 模块声明和注册、移除 global-shortcut 插件、移除 `hide_window` command、添加 `on_window_event` 拦截 CloseRequested（hide 而非 destroy）

## 3. 前端主布局

- [x] 3.1 重写 `App.tsx`：侧边栏（48px，💬 和 ⚙ 导航按钮）+ 主内容区路由
- [x] 3.2 重写 `App.css`：flexbox 全屏布局，深色主题，body 背景 #1c1c1e
- [x] 3.3 修改 `main.tsx`：从渲染 `<FloatInput />` 改为渲染 `<App />`

## 4. 对话页面

- [x] 4.1 新建 `Chat.tsx`：消息列表区（上方，flex-grow）+ 输入区（底部固定）
- [x] 4.2 新建 `Chat.css`：消息气泡样式（用户右对齐蓝色、AI 左对齐灰色）、输入区样式
- [x] 4.3 消息列表自动滚到底部（新消息到达时）
- [x] 4.4 保留 Enter 发送 / Shift+Enter 换行 / streaming 光标闪烁

## 5. 设置页面适配

- [x] 5.1 修改 `Settings.tsx`：移除右上角 ✕ 关闭按钮，`onClose` 改为可选 prop
- [x] 5.2 修改 `Settings.css`：移除浮窗圆角和透明度，适配全页布局

## 6. 清理

- [x] 6.1 删除 `FloatInput.tsx` 和 `FloatInput.css`
- [x] 6.2 移除 `useGateway.ts` 中与 `hide_window` 相关的 invoke 调用（如有）

## 7. 底部状态栏

- [x] 7.1 在 App 布局底部添加状态栏：显示 Core 在线/离线状态 + 当前 Provider 名 + 模型名

## 8. 内容缩放（Zoom）

- [x] 8.1 监听 Ctrl+= / Ctrl+- / Ctrl+0 快捷键，分别执行放大、缩小、重置缩放
- [x] 8.2 通过 `document.body.style.zoom` 或 CSS `transform: scale()` 实现内容缩放
- [x] 8.3 缩放级别范围：50% ~ 200%，步长 10%
- [x] 8.4 将当前缩放级别持久化到 localStorage，下次启动自动恢复
- [x] 8.5 在底部状态栏右侧显示当前缩放百分比（非 100% 时显示）

## 9. 验收测试

- [x] 9.1 启动 `pnpm dev:desktop`，出现标准窗口（带标题栏），任务栏可见
- [x] 9.2 Alt+Tab 可正常切换到 Equality
- [x] 9.3 侧边栏点击 💬 和 ⚙ 可切换页面
- [x] 9.4 对话页面：输入消息，回复在上方显示，空间充裕
- [x] 9.5 点击窗口 ✕ 按钮 → 窗口隐藏（最小化到托盘），进程不退出
- [x] 9.6 托盘左键点击 → 窗口恢复
- [x] 9.7 托盘右键 → 退出 → 进程完全退出
- [x] 9.8 Ctrl+= 放大内容，Ctrl+- 缩小内容，Ctrl+0 重置，刷新后缩放级别保持
