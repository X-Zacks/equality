# Delta Spec: Chat — Phase 3.3 对话附件

> 变更：`phase-3.3-file-attachment`  
> 基线：（首次定义 Chat 输入区行为，无现有 spec）

---

## ADDED Requirements

### Requirement: 文件附件 — 📎 按钮选择

系统 SHALL 在对话输入区左侧提供 📎 按钮，点击弹出系统文件选择对话框。

行为规则：
- 点击 📎 按钮 MUST 调用 Tauri `dialog.open()` 打开系统原生文件选择对话框
- 对话框 MUST 支持多选（最多一次选 5 个文件）
- 对话框 SHOULD 提供文件类型筛选（图片、PDF、文本/代码、全部）
- 选中的文件 MUST 以标签形式显示在输入框上方

#### Scenario: 用户点击 📎 选择文件
- GIVEN 用户在对话输入区
- WHEN 用户点击 📎 按钮并选择 `report.pdf`
- THEN 输入框上方出现 `📑 report.pdf ✕` 标签
- AND 文件路径被记录（不上传文件内容）

---

### Requirement: 文件附件 — 拖拽放置

系统 SHALL 支持从操作系统文件管理器拖拽文件到对话输入区。

行为规则：
- 拖入文件时 MUST 显示视觉反馈（蓝色边框高亮 + "📎 拖放文件到此处" 遮罩）
- 拖出时 MUST 恢复正常样式
- 放下文件时 MUST 将文件路径添加到附件列表
- 系统 MUST 使用 Tauri 原生拖拽事件获取本地文件路径

#### Scenario: 用户拖拽图片到输入区
- GIVEN 用户从文件管理器拖拽 `screenshot.png` 到对话输入区
- WHEN 文件在输入区上方时
- THEN 输入区显示蓝色高亮边框
- WHEN 用户放下文件
- THEN 输入框上方出现 `🖼️ screenshot.png ✕` 标签

---

### Requirement: 附件标签显示

系统 SHALL 将已选附件以紧凑标签形式显示在输入框上方。

行为规则：
- 每个标签 MUST 显示：文件类型图标 + 文件名 + ✕ 删除按钮
- 文件类型图标规则：
  - 图片（png/jpg/gif/webp/bmp/svg）→ 🖼️
  - PDF → 📑
  - 其他 → 📄
- 文件名过长时 MUST 截断显示（text-overflow: ellipsis）
- 最大标签宽度 200px
- 点击 ✕ MUST 从附件列表中移除该文件

---

### Requirement: 附件数量限制

系统 MUST 限制同时附加的文件数量为 5 个。

- 超过限制时 SHOULD 显示提示
- 同一文件重复添加 MUST 自动去重（按路径判断）

#### Scenario: 超过附件数量限制
- GIVEN 用户已附加 5 个文件
- WHEN 用户尝试再添加文件
- THEN 新文件不被添加
- AND 显示提示 "最多附加 5 个文件"

---

### Requirement: 附件消息注入

发送消息时，系统 MUST 将附件路径注入到用户消息末尾。

注入格式：
```
{用户原始文本}

[附件: /absolute/path/to/file1.pdf]
[附件: /absolute/path/to/file2.png]
```

行为规则：
- 附件路径 MUST 使用绝对路径
- 发送后 MUST 清空附件列表
- LLM 收到带 `[附件: ...]` 标记的消息后，SHOULD 自动识别并调用对应工具：
  - `.pdf` → `read_pdf`
  - `.png/.jpg/.jpeg/.gif/.webp/.bmp` → `read_image`
  - 其他 → `read_file`

#### Scenario: 发送带附件的消息
- GIVEN 用户输入 "帮我分析" 并附加了 `report.pdf`
- WHEN 用户按 Enter 发送
- THEN 实际发送的消息为 "帮我分析\n\n[附件: C:\docs\report.pdf]"
- AND LLM 调用 `read_pdf` 工具读取该文件
- AND 附件列表被清空
