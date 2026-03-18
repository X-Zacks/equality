# Design: Clipboard Paste Attachment

## 架构决策

### AD-1: 图片临时文件写入方式 — Tauri Command（不用 fs plugin）

**选择**：新增一个 `write_temp_file` Tauri command（Rust 端），而非使用 `@tauri-apps/plugin-fs`。

**理由**：
- `plugin-fs` 的 `writeFile` 接受的是 `Uint8Array`，需要配置 `scope` 才能写 `%TEMP%`，配置项繁琐
- Rust command 直接使用 `std::env::temp_dir()`，无需任何额外 capability 配置
- 代码更简单，约 15 行 Rust

### AD-2: 图片格式 — 统一保存为 PNG

**选择**：无论剪贴板图片的原始格式，一律保存为 `.png`。

**理由**：
- `ClipboardEvent` 中图片 blob 的 MIME type 通常是 `image/png`（浏览器、Windows截图工具均如此）
- 保存为 PNG 后 `read_image` 工具可直接处理
- 无需在前端做格式转换

### AD-3: 文件粘贴的路径获取 — 依赖 Tauri WebView 的 File.path 扩展

**选择**：通过 `item.getAsFile()?.path` 获取 Windows 文件路径。

**理由**：
- Tauri 的 WebView2 对 `File` 对象做了扩展，提供 `.path` 属性（绝对路径）
- Phase 3.3 的拖拽功能已验证 Tauri 可获取真实路径
- 若 `.path` 为空（某些非 Tauri 环境），静默跳过，不影响图片粘贴路径

**风险**：Tauri v2 某些版本可能 `.path` 不可用 → 回退策略：仅处理图片，文件粘贴跳过

### AD-4: 临时文件命名

格式：`paste-{Date.now()}-{crypto.randomUUID().slice(0,8)}.png`

示例：`paste-1742284800000-a1b2c3d4.png`

理由：时间戳保证有序，UUID 前缀防碰撞，长度适中

---

## 数据流

```
用户 Ctrl+V
    │
    ▼
textarea.onPaste(e: ClipboardEvent)
    │
    ├─ 遍历 e.clipboardData.items
    │    │
    │    ├─ item.type.startsWith('image/')  ──► 图片路径
    │    │   ├── item.getAsFile() → Blob
    │    │   ├── FileReader.readAsArrayBuffer
    │    │   ├── new Uint8Array(buffer)
    │    │   ├── invoke('write_temp_file', { data, filename })
    │    │   │     └── Rust: %TEMP%/equality-paste/paste-xxx.png
    │    │   └── addAttachments([absPath])
    │    │
    │    └─ item.kind === 'file' && item.type === ''  ──► 文件路径
    │        ├── item.getAsFile() → File
    │        ├── file.path  (Tauri WebView 扩展属性)
    │        └── addAttachments([file.path])
    │
    ├─ 有图片或文件 → e.preventDefault()
    └─ 只有文本 → 不拦截，默认行为
```

---

## 修改文件清单

### `packages/desktop/src/Chat.tsx`

新增 `handlePaste` 函数（约 40 行），挂载到 `<textarea onPaste={handlePaste}>`：

```typescript
const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
  const items = Array.from(e.clipboardData.items)
  
  // 1. 检测图片
  const imageItem = items.find(it => it.type.startsWith('image/'))
  if (imageItem) {
    e.preventDefault()
    const blob = imageItem.getAsFile()
    if (!blob) return
    const buf = await blob.arrayBuffer()
    const data = Array.from(new Uint8Array(buf))
    const filename = `paste-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.png`
    try {
      const path = await invoke<string>('write_temp_file', { data, filename })
      addAttachments([path])
    } catch (err) {
      console.error('[paste] write_temp_file failed:', err)
    }
    return
  }
  
  // 2. 检测文件（Windows 文件管理器复制）
  const fileItems = items.filter(it => it.kind === 'file')
  if (fileItems.length > 0) {
    const paths: string[] = []
    for (const item of fileItems) {
      const file = item.getAsFile() as (File & { path?: string }) | null
      if (file?.path) paths.push(file.path)
    }
    if (paths.length > 0) {
      e.preventDefault()
      addAttachments(paths)
    }
  }
  // 3. 纯文本：不拦截，走默认行为
}, [addAttachments])
```

### `packages/desktop/src-tauri/src/lib.rs`

新增 command（约 20 行）：

```rust
#[tauri::command]
fn write_temp_file(data: Vec<u8>, filename: String) -> Result<String, String> {
    let dir = std::env::temp_dir().join("equality-paste");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&filename);
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
```

注册到 `Builder::invoke_handler`：添加 `write_temp_file` 到现有列表。

---

## 不需要修改的文件

- `Attachment` 类型：不变
- `addAttachments()` 函数：不变
- 附件标签 UI（`.attachment-tag`）：不变
- `handleSend()` 中的路径注入逻辑：不变
- Tauri `capabilities/default.json`：不需要新增权限

---

## 边界情况处理

| 情况 | 处理 |
|------|------|
| `getAsFile()` 返回 null | 静默跳过 |
| `write_temp_file` Rust 端失败 | console.error，不添加附件 |
| `File.path` 为空字符串 | 跳过该文件 |
| 粘贴时已达 5 个附件上限 | `addAttachments` 内部处理，静默忽略 |
| 剪贴板含多个 image item | 只处理第一个（`items.find`） |
