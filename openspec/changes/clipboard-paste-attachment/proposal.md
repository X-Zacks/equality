# Proposal: Clipboard Paste Attachment（剪贴板粘贴附件）

## 背景

Phase 3.3 已实现 📎 按钮选择文件和拖拽文件两种附件方式。
但用户在日常工作中最常见的操作是：

- 截图后直接 **Ctrl+V** 粘贴图片（如 Snipaste、Windows 截图工具）
- 从文件管理器复制文件后 **Ctrl+V** 粘贴
- 从浏览器复制图片后 **Ctrl+V** 粘贴

当前输入框对 `paste` 事件没有任何处理，用户只能通过 📎 按钮手动找文件，体验割裂。

## 目标

在对话输入区支持 **Ctrl+V 粘贴**，自动识别剪贴板内容类型并处理：

| 剪贴板内容 | 处理方式 |
|-----------|---------|
| 图片（截图/复制的图片） | 保存为临时 PNG 文件 → 作为附件显示 |
| 文件（从文件管理器复制） | 直接取得文件路径 → 作为附件显示 |
| 纯文本 | 默认行为（插入输入框文本），不拦截 |

## 范围

### In Scope
1. `textarea` 上监听 `onPaste` 事件
2. 检测 `ClipboardEvent.clipboardData.items` 中是否含有图片类型
3. 图片：将 `Blob` 通过 Tauri `fs` 写入 `%TEMP%\equality-paste\` 目录，生成唯一文件名，作为附件添加
4. 文件列表（`Files` 类型）：提取文件路径，作为附件添加（需 Tauri webview 支持文件路径读取）
5. 粘贴图片时阻止默认行为（防止在输入框显示乱码）
6. 附件标签栏与现有 📎 附件共用同一套 UI（`Attachment` 类型、`addAttachments` 流程）

### Out of Scope
- 富文本粘贴（HTML 内容）
- 剪贴板文件路径在 Windows 之外的平台（macOS/Linux 后续按需支持）
- 粘贴多张图片（当前只处理第一张，后续可扩展）
- 临时文件的自动清理（进程退出时或会话结束时清理，作为后续优化）

## 技术路线

### 图片粘贴
```
onPaste 事件
  └── clipboardData.items 遍历
        └── item.type.startsWith('image/')
              ├── item.getAsFile() → Blob
              ├── FileReader.readAsArrayBuffer(blob)
              └── Tauri invoke('write_temp_file', { data, filename })
                    └── Rust: 写入 %TEMP%/equality-paste/{uuid}.png
                          └── 返回绝对路径
                                └── addAttachments([path])
```

### 文件粘贴（Windows 文件管理器复制）
```
onPaste 事件
  └── clipboardData.items 遍历
        └── item.kind === 'file' && item.type === ''
              └── item.getAsFile() → File 对象（含 .path 属性，Tauri webview 扩展）
                    └── addAttachments([file.path])
```

### Rust 端（新增 Tauri command）
```rust
#[tauri::command]
fn write_temp_file(data: Vec<u8>, filename: String) -> Result<String, String> {
    let tmp = std::env::temp_dir().join("equality-paste").join(&filename);
    // 创建目录、写文件、返回绝对路径
}
```

## 与现有代码的关系

- `Chat.tsx` 中 `textarea` 添加 `onPaste` handler，其余 `Attachment` 状态/UI 逻辑**不变**
- `src-tauri/src/lib.rs` 新增一个 Tauri command `write_temp_file`
- 不影响 Phase 3.3 已有的 📎 按钮和拖拽功能

## 优先级

**高**：这是 Phase 15（多代理编排）前的用户体验补充，用户在测试多代理时需要频繁粘贴截图来描述任务场景。
