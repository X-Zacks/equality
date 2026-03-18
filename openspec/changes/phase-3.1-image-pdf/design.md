# Design: Image & PDF 工具

## A. read_image 工具

### A1. 工具 Schema

```typescript
{
  name: "read_image",
  description: "读取本地图片文件并用视觉模型分析。支持 png/jpg/gif/webp/bmp 格式。",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "图片文件的绝对路径" },
      prompt: { type: "string", description: "分析提示词，如'描述这张图片'或'提取图中文字'" }
    },
    required: ["path"]
  }
}
```

### A2. 处理流程

1. 验证文件存在且大小 ≤ 10MB
2. 读取文件为 base64
3. 检测 MIME 类型（magic bytes）
4. 调用视觉模型（通过 Provider 体系的 chat API）
   - message: `[{ type: "image_url", image_url: { url: "data:{mime};base64,..." } }, { type: "text", text: prompt }]`
5. 返回模型分析结果

### A3. 模型选择

视觉模型优先级：
1. 当前活跃 Provider 的视觉模型（如 gpt-4o 支持 vision）
2. Copilot 的 gpt-4o（免费）
3. 通义千问 qwen-vl-plus（国内直连）

### A4. 文件验证

- 支持格式：png, jpg, jpeg, gif, webp, bmp
- 大小限制：10MB
- 路径验证：必须是绝对路径，禁止 `..` 遍历

## B. read_pdf 工具

### B1. 工具 Schema

```typescript
{
  name: "read_pdf",
  description: "读取本地 PDF 文件，提取文本内容。支持指定页码范围。",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "PDF 文件的绝对路径" },
      pages: { type: "string", description: "页码范围，如 '1-5' 或 '1,3,5'。默认全部" }
    },
    required: ["path"]
  }
}
```

### B2. 处理流程

1. 验证文件存在且大小 ≤ 20MB
2. 用 pdfjs-dist 加载 PDF
3. 按页提取文本（getTextContent）
4. 如果文本量 < 200 字符（扫描件/纯图 PDF），返回提示建议用 read_image 工具
5. 返回格式化的文本（带页码标注）

### B3. 输出格式

```
=== 第 1 页 ===
（页面文本内容）

=== 第 2 页 ===
（页面文本内容）

[共 5 页，提取 3,456 字符]
```

### B4. 限制

- 大小限制：20MB
- 页数限制：最多 20 页（超出提示截断）
- 页码解析：支持 "1-5"、"1,3,5"、"1-3,5,7-9" 格式

## C. 费用统计增强（已完成）

- `sessionCostSummary(key)` — 按会话查询
- `globalCostSummary()` — 全局汇总
- API: `GET /cost/session/:key`, `GET /cost/global`
- About 页面显示累计费用
