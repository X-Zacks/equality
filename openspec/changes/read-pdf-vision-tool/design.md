# Design: read_pdf_vision

## 架构

```
read_pdf (入口)
  │
  ├── 有文字层 → pdf-parse 提取 → 返回文本
  │
  └── 无文字层 (< 50 chars) → 自动降级
        │
        ▼
read_pdf_vision (核心)
  │
  ├── 1. PDF → 逐页 PNG (pdfjs-dist 渲染)
  │      └── 临时目录: os.tmpdir()/.equality-pdf-<hash>/
  │
  ├── 2. 检查缓存 (断点续传)
  │      └── .equality-pdf-cache-<hash>.json
  │      └── 格式: { file, mtime, pages: { "1": "recognized text", "2": "..." } }
  │
  ├── 3. 逐页调用视觉 LLM
  │      ├── 优先: Copilot GPT-4o (hasSecret('GITHUB_TOKEN'))
  │      └── 降级: 用户当前模型
  │      └── Prompt: "请识别图片中的所有文字和表格，表格用 Markdown 格式输出"
  │
  ├── 4. 写入缓存 (每页完成后立即写入)
  │
  ├── 5. 汇总结果 → 返回
  │
  └── 6. 清理: 删除所有临时 PNG + 删除缓存文件(成功时)
```

## PDF 渲染方案

使用 `pdfjs-dist`（已被 `pdf-parse` 间接依赖）+ `canvas` npm 包：

```typescript
import { getDocument } from 'pdfjs-dist'
import { createCanvas } from 'canvas'

const doc = await getDocument(uint8Array).promise
const page = await doc.getPage(pageNum)
const viewport = page.getViewport({ scale: 2.0 }) // 200 DPI
const canvas = createCanvas(viewport.width, viewport.height)
const ctx = canvas.getContext('2d')
await page.render({ canvasContext: ctx, viewport }).promise
const pngBuffer = canvas.toBuffer('image/png')
```

## 视觉模型调用

不走 agent runner（避免递归），直接调用 provider 的 chat API：

```typescript
// 选择 provider
let visionProvider: LLMProvider
if (hasSecret('GITHUB_TOKEN')) {
  visionProvider = getCopilotProvider('gpt-4o')  // 免费/低成本
} else {
  visionProvider = getCurrentProvider()  // 用户当前模型
}

// 调用
const result = await visionProvider.chat([{
  role: 'user',
  content: [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } }
  ]
}])
```

## 缓存结构

```json
{
  "filePath": "/path/to/doc.pdf",
  "fileMtime": 1713600000000,
  "fileSize": 2048000,
  "totalPages": 10,
  "pages": {
    "1": "第一页识别结果...",
    "3": "第三页识别结果..."
  }
}
```

缓存键：`sha256(absPath + mtime + size)` 的前 16 位

## 依赖

- `canvas` (npm) — Node.js canvas 实现，用于 pdfjs-dist 渲染
- `pdfjs-dist` — 已存在（pdf-parse 的依赖）

## 错误处理

| 错误场景 | 处理 |
|---------|------|
| canvas 未安装 | 返回友好提示 + 安装命令 |
| 单页渲染失败 | 跳过该页，标记为错误，继续下一页 |
| 视觉 LLM 调用失败 | 重试 1 次，仍失败则保存已完成页面到缓存，返回部分结果 |
| 所有页面完成 | 删除缓存文件 + 删除临时 PNG 目录 |
| 部分页面完成 | 保留缓存文件，删除临时 PNG 目录 |
