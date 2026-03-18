# Tasks: Phase 3.3 — 对话附件（文件选择 & 拖拽）

## Section 1: 前置 — Tauri dialog 插件

- [x] 1.1 检查并安装 `@tauri-apps/plugin-dialog`（前端）— ^2.6.0
- [x] 1.2 检查并安装 `tauri-plugin-dialog`（Rust 端）— v2.6.0
- [x] 1.3 在 `lib.rs` 中注册 dialog 插件 + capabilities/default.json 添加 `dialog:default`
- [ ] 1.4 测试：`open()` 能弹出文件选择对话框

## Section 2: 附件状态 & 📎 按钮

- [x] 2.1 在 Chat.tsx 添加 `Attachment` 类型和 `attachments` state
- [x] 2.2 实现 `addAttachments()` 函数（去重、限制 5 个、分类 type）
- [x] 2.3 实现 `removeAttachment()` 函数
- [x] 2.4 在输入区左侧添加 📎 按钮，点击调用 Tauri `dialog.open()`
- [x] 2.5 附件标签栏 UI：图标 + 文件名 + ✕ 删除

## Section 3: 拖拽放置

- [x] 3.1 使用 Tauri `onDragDropEvent` 监听原生拖拽文件事件
- [x] 3.2 drag-over/leave 视觉反馈（蓝色边框高亮 + 遮罩提示 "📎 拖放文件到此处"）
- [x] 3.3 drop 事件处理实际文件路径，调用 addAttachments()

## Section 4: 消息发送集成

- [x] 4.1 修改 `handleSend()`：附件路径注入消息末尾
  - 格式: `\n\n[附件: /path/to/file.ext]`
- [x] 4.2 发送后清空 attachments state
- [ ] 4.3 用户消息气泡中显示附件标签（而非原始路径文本）— 可选优化

## Section 5: CSS 样式

- [x] 5.1 附件标签栏样式（.chat-attachments, .attachment-tag）
- [x] 5.2 📎 按钮样式（.attach-btn）
- [x] 5.3 拖拽高亮样式（.drag-over, .drag-overlay）

## Section 6: Delta Spec

- [x] 6.1 创建 Delta Spec 描述附件功能的行为需求 — specs/chat/spec.md

## 验收

- [ ] V1 点击 📎 弹出文件选择框，选择文件后显示附件标签
- [ ] V2 拖拽文件到输入区，显示附件标签
- [ ] V3 发送带附件的消息，LLM 自动调用对应工具读取文件
- [ ] V4 附件标签可删除
- [ ] V5 最多 5 个附件限制
