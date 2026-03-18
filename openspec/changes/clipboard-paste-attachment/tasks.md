# Tasks: Clipboard Paste Attachment

## Section 1: Rust 端 — write_temp_file command

- [ ] 1.1 在 `packages/desktop/src-tauri/src/lib.rs` 中新增 `write_temp_file` command
  - 参数：`data: Vec<u8>`，`filename: String`
  - 逻辑：`temp_dir()/equality-paste/` 目录不存在则创建 → 写入文件 → 返回绝对路径
- [ ] 1.2 将 `write_temp_file` 注册到 `invoke_handler![]` 列表
- [ ] 1.3 验证：在 Tauri dev 模式下 `invoke('write_temp_file', {...})` 能写入并返回路径

## Section 2: 前端 — handlePaste

- [ ] 2.1 在 `Chat.tsx` 中导入 `invoke`（如果尚未导入）
- [ ] 2.2 实现 `handlePaste` useCallback：
  - 检测 `image/*` 类型 → ArrayBuffer → Uint8Array → invoke → addAttachments
  - 检测 `kind === 'file'` → `File.path` → addAttachments
  - 有图片或文件时 `e.preventDefault()`
- [ ] 2.3 将 `onPaste={handlePaste}` 挂载到 `<textarea>`

## Section 3: 验收测试

- [ ] V1 **截图粘贴**：使用 Windows 截图工具（Win+Shift+S）截图后在输入框 Ctrl+V，出现 `🖼️ paste-xxx.png ✕` 标签
- [ ] V2 **浏览器图片粘贴**：浏览器中右键图片"复制图片"，在输入框 Ctrl+V，出现附件标签
- [ ] V3 **发送带粘贴图片的消息**：V1 完成后点发送，AI 能通过 `read_image` 工具识别图片内容
- [ ] V4 **文件粘贴**：文件管理器中 Ctrl+C 一个文件，在输入框 Ctrl+V，出现对应附件标签
- [ ] V5 **纯文本不受影响**：Ctrl+C 复制文字，Ctrl+V 正常插入输入框，无附件标签
- [ ] V6 **上限限制**：已有 5 个附件时粘贴图片，附件数不超过 5
- [ ] V7 **与 📎 按钮共存**：同一次消息可同时包含 📎 选择的文件和粘贴的图片

## 归档条件

V1 + V2 + V3 + V5 通过即可归档（V4 文件粘贴依赖 Tauri File.path，可能因版本原因跳过）
