# Tasks: Phase 3.1 — Image & PDF 工具 + 费用统计

## 1. 费用统计持久化

- [x] 1.1 cost-ledger 添加 sessionCostSummary / allSessionsCostSummary / globalCostSummary
- [x] 1.2 Core API: GET /cost/session/:key, GET /cost/sessions, GET /cost/global
- [x] 1.3 Settings About 页面显示全局累计费用

## 2. read_image 工具

- [x] 2.1 创建 tools/builtins/read-image.ts
  - 文件验证（格式、大小 ≤10MB）
  - 读取文件为 base64
  - MIME 检测
  - 调用视觉模型分析
- [x] 2.2 注册到 builtinTools 数组
- [ ] 2.3 测试：读取一张本地图片

## 3. read_pdf 工具

- [x] 3.1 安装 pdf-parse 依赖（轻量替代 pdfjs-dist）
- [x] 3.2 创建 tools/builtins/read-pdf.ts
  - 文件验证（大小 ≤20MB）
  - pdf-parse 文本提取
  - 页码范围解析
  - 格式化输出（分页标记）
  - 扫描件检测提示
- [x] 3.3 注册到 builtinTools 数组
- [ ] 3.4 测试：读取一个 PDF 文件

## 4. 验收

- [ ] 4.1 "读取这张图片" → read_image 工具正确调用
- [ ] 4.2 "阅读这个 PDF" → read_pdf 工具正确调用
- [ ] 4.3 Settings → 关于 → 显示累计费用
