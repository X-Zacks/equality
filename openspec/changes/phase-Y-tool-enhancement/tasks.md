# Tasks: Phase Y — 工具体系补强

---

## Y0: Bash 沙箱安全增强 🔴 P0

- [x] Y0.1 在 `bash-sandbox.ts` 新增 `checkInterpreterSafety()` — 检测解释器命令内联脚本中的危险路径
- [x] Y0.2 在 `bash-sandbox.ts` 新增 `sanitizeEnvForBash()` — 从子进程 env 中剔除敏感 API Key
- [x] Y0.3 在 `bash.ts` 中调用 `sanitizeEnvForBash()` 清洗环境变量
- [x] Y0.4 扩展 INTERPRETER_COMMANDS 集合 — 添加 python/node/curl 等
- [ ] Y0.5 单元测试覆盖解释器绕过场景（后续补充）

---

## Y1.1: todo 工具 🆕

- [x] Y1.1.1 创建 `packages/core/src/tools/builtins/todo.ts` — 基于 JSON 文件存储
- [x] Y1.1.2 支持 add/list/done/remove 四种操作
- [x] Y1.1.3 在 `index.ts` 注册 todo 工具
- [x] Y1.1.4 在 `catalog.ts` 注册 todo 工具条目

---

## Y1.2: memory 增强

- [x] Y1.2.1 在 `memory.ts` 新增 `memoryListTool` — 列出所有记忆
- [x] Y1.2.2 在 `memory.ts` 新增 `memoryDeleteTool` — 按 ID 删除（支持前缀匹配）
- [x] Y1.2.3 在 `index.ts` 和 `catalog.ts` 注册新工具
- [x] Y1.2.4 保留 `memory_save`/`memory_search` 向后兼容 ✅

---

## Y1.3: read_image URL 支持

- [x] Y1.3.1 在 `read-image.ts` 扩展 path 参数支持 http/https URL
- [x] Y1.3.2 实现 URL 下载逻辑（带 SSRF 检测 — 禁止内网地址）
- [x] Y1.3.3 下载后复用现有视觉模型分析流程

---

## Y3.1: image_generate (MiniMax)

- [x] Y3.1.1 创建 `packages/core/src/tools/builtins/image-generate.ts`
- [x] Y3.1.2 实现 MiniMax API 调用（model: image-01, base64 响应）
- [x] Y3.1.3 base64 解码保存为 JPEG 文件到 generated-images/
- [x] Y3.1.4 在 `index.ts` 和 `catalog.ts` 注册

---

## 验证

- [x] V1 TypeScript 编译零新增错误
- [ ] V2 提交 Git 并推送
