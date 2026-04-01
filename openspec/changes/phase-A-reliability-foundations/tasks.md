# Tasks: Phase A — 可靠性基础

> 依赖: [proposal.md](./proposal.md), [design.md](./design.md)

---

## 1. 编译错误自动重试（GAP-1）

- [ ] 1.1 在 `runner.ts` 新增 `isCompileOrTestError(toolName, content)` 函数
  - 仅对 bash 工具触发
  - 匹配 TypeScript/Python/Rust/Go/Node.js 编译错误模式
  - 匹配测试框架失败模式
- [ ] 1.2 在 `runner.ts` 新增 `extractCompileErrors(content, maxChars)` 函数
  - 按行扫描匹配错误模式，收集上下文
  - 截断到 maxChars（默认 2000）
  - 无具体匹配时返回末尾内容
- [ ] 1.3 在 toolLoop 汇总阶段后插入编译错误检测逻辑
  - 新增 `compileRetryUsed` 标志位
  - 检测到编译错误且未用过重试配额时：注入修复提示 + `continue toolLoop`
  - 与现有 `forcedToolRetryUsed` 独立互不干扰
- [ ] 1.4 编写单元测试
  - TypeScript 错误输出 → 识别为编译错误
  - Python SyntaxError → 识别为编译错误
  - 普通 bash 错误（如 `ls: No such file`）→ 不触发
  - 已使用重试配额后 → 不再触发

---

## 2. 循环检测增强（GAP-3）

- [ ] 2.1 在 `LoopDetector` 中增加 `HISTORY_WINDOW_SIZE = 30` 常量
- [ ] 2.2 在 `check()` 方法中 push 后裁剪 history：超过窗口大小时 shift 最旧记录
- [ ] 2.3 编写单元测试
  - 窗口裁剪：50 次调用后 history.length === 30
  - 裁剪后检测器仍能正确检测窗口内的循环
  - 裁剪后窗口外的旧循环不再误触发

---

## 3. 工具 Schema 跨 Provider 兼容（GAP-4）

- [ ] 3.1 新增 `packages/core/src/tools/schema-compat.ts`
  - 导出 `cleanToolSchemas(schemas, providerId)` 函数
  - 导出 `resolveProviderFamily(providerId)` 函数
- [ ] 3.2 实现通用规则
  - `flattenUnionTypes(schema)`：打平 anyOf/oneOf 为 object
  - `ensureRequiredFields(schema)`：注入缺失的 type/properties
  - `truncateDescription(schema, maxLen)`：截断超长 description
- [ ] 3.3 实现 Gemini 专用清洗
  - 移除 pattern/examples/title/default/$schema
  - 移除 maxLength/minLength/format
  - 截断 enum（>50 时）
- [ ] 3.4 实现 xAI 专用清洗
  - 移除 pattern/maxLength/minLength
  - 截断 enum（>100 时）
- [ ] 3.5 在 `runner.ts` 中集成：streamChat 前调用 `cleanToolSchemas`
- [ ] 3.6 编写单元测试
  - anyOf 打平 → 合并 properties
  - Gemini：pattern 被移除
  - xAI：maxLength 被移除
  - OpenAI/standard：schema 保持原样
  - 缺失 type 自动注入 "object"

---

## 4. 集成验证

- [ ] 4.1 `npx tsc --noEmit` 全量编译通过
- [ ] 4.2 手动测试：bash 执行 `tsc --noEmit` 报错 → Agent 自动重试修复
- [ ] 4.3 提交代码

---

## 进度

```
Phase A 总进度: 0/16 tasks
├── A1 编译错误重试:   0/4
├── A2 循环检测增强:   0/3
├── A3 Schema 兼容:    0/6
└── A4 集成验证:       0/3
```
