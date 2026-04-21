# Tasks: read_pdf_vision

## T1: 安装依赖

- [ ] 1.1 `packages/core` 安装 `canvas` 依赖（用于 pdfjs-dist Node.js 渲染）
- [ ] 1.2 验证 `pdfjs-dist` 已可用（pdf-parse 的依赖）

## T2: 实现 read_pdf_vision 核心工具

- [ ] 2.1 新建 `packages/core/src/tools/builtins/read-pdf-vision.ts`
- [ ] 2.2 实现 PDF → 逐页 PNG 渲染（pdfjs-dist + canvas）
- [ ] 2.3 实现视觉模型选择逻辑（优先 Copilot GPT-4o，降级到当前模型）
- [ ] 2.4 实现逐页视觉识别 + Markdown 表格输出 prompt
- [ ] 2.5 实现临时文件清理（PNG 物理删除）
- [ ] 2.6 实现断点缓存（.equality-pdf-cache-<hash>.json）
- [ ] 2.7 实现错误重试（单页 LLM 调用失败重试 1 次）
- [ ] 2.8 实现部分完成时的用户友好错误信息

## T3: 注册工具

- [ ] 3.1 在 tool registry 注册 `read_pdf_vision`
- [ ] 3.2 在 `tools/catalog.ts` 添加工具条目
- [ ] 3.3 在 `tools/mutation.ts` 添加 READ 分类

## T4: read_pdf 自动降级

- [ ] 4.1 修改 `read-pdf.ts`：检测扫描件时自动调用 `read_pdf_vision`
- [ ] 4.2 传递必要的 context（provider 信息）给 vision 工具

## T5: 验证

- [ ] 5.1 TypeScript 编译零错误
- [ ] 5.2 对有文字层 PDF 测试 → read_pdf 正常提取
- [ ] 5.3 对扫描件 PDF 测试 → 自动降级到 read_pdf_vision → 返回识别结果
- [ ] 5.4 验证临时 PNG 文件已被物理删除
- [ ] 5.5 提交并推送
