# Proposal: Image & PDF 工具支持

## 动机

对比 OpenClaw 的工具清单，Equality 目前缺少两个重要工具：
- **image** — 图片读取与视觉分析（OCR、截图理解、图表解读）
- **pdf** — PDF 文档文本提取与分析

这两个工具在日常桌面使用场景中需求频繁（读发票、分析报告、理解截图等）。

## 范围

### In Scope
1. `read_image` 工具 — 读取本地图片文件，用视觉模型分析
2. `read_pdf` 工具 — 提取 PDF 文本，必要时渲染页面为图片分析
3. 会话费用统计持久化（已完成，在 cost-ledger 中）

### Out of Scope
- 图片生成（canvas 工具）
- 音频/视频处理
- 远程 URL 图片下载（当前只支持本地文件）

## 安全考虑
- 文件路径需验证（防目录遍历）
- 图片大小限制（10MB）
- PDF 大小限制（20MB，最多 20 页）

## 依赖
- `pdfjs-dist` — PDF 文本提取
- OpenAI vision API（通过现有 Provider 体系）
