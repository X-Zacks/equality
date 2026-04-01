# Phase A 功能验证指南

## 快速验证（自动测试）

```bash
# 运行单元测试
cd packages/core
npx tsx src/__tests__/phase-A.test.ts

# 预期输出: 18 ✅ passed, 0 ❌ failed
```

---

## 端到端验证（手动测试）

### A1: 编译错误自动重试

**场景 1: TypeScript 编译错误自动修复**

```bash
# 1. 启动应用
npm run dev

# 2. 在对话中让 Agent 执行 tsc
# 用户消息: "请帮我检查 TypeScript 代码，运行 npx tsc --noEmit 看看有没有错误"

# 3. 预期观察
# - Agent 执行 bash: tsc --noEmit 报错
# - 检测到编译错误 (error TS2345 等)
# - 自动注入修复提示: "检测到编译/测试错误，正在自动重试…"
# - LLM 分析错误，修改代码，再次运行 tsc
# - 第二次 tsc 成功通过 ✅

# 4. 查看日志
# packages/core 目录的 tmp/equality-logs/tool-YYYY-MM-DD.log
# 应该看到:
#   [编译错误] bash 输出包含编译错误
#   🔧 [编译重试] bash 输出包含编译错误，注入修复提示
```

**场景 2: 运行时错误不被误判**

```bash
# 用户消息: "执行这个 Python 脚本: result = 10 / 0"

# 预期观察
# - bash 执行报错: ZeroDivisionError
# - 但 NOT 检测为编译错误（因为 ZeroDivisionError 不在编译错误pattern中）
# - LLM 根据运行时错误提示正常响应，不会被注入"修复编译错误"
# - 日志中无 "[编译错误]" 或 "[编译重试]" 行

# 验证方式：grep 日志确认
grep "编译错误\|编译重试" packages/core/tmp/equality-logs/tool-*.log
# 不应该有匹配
```

**场景 3: 测试框架失败被识别**

```bash
# 用户消息: "运行单元测试，使用 jest: npm test"

# 预期观察
# - Jest 输出: "2 failing" 或 "FAIL  src/..."
# - 检测到测试失败
# - 自动重试，LLM 分析失败原因并修复

# 日志验证:
grep "编译/测试错误" packages/core/tmp/equality-logs/tool-*.log
```

---

### A2: 循环检测滑动窗口

**场景 1: 验证窗口容量**

```bash
# 用户消息: "反复执行相同的命令50次"
# 例如: for i in {1..50}; do echo "test"; done

# 预期观察
# - 循环检测器记录了 50 次调用
# - 但内存中只保留最近 30 条记录（窗口）
# - 第31-50条不会重复触发 generic_repeat 检测（因为已被淘汰）

# 验证方式：添加 debug 日志
# 在 loop-detector.ts 的 check() 方法后添加:
//   console.log(`[debug] history.length=${this.history.length}, totalCalls=${this.totalCalls}`)

# 预期输出：
#   [debug] history.length=30, totalCalls=50
```

**场景 2: 乒乓循环检测仍在窗口内工作**

```bash
# 用户消息: "在 bash 和 grep 之间交替调用 20+ 次"

# 预期观察
# - 20+ 次交替后，检测到乒乓循环（terminate）
# - 日志: [ping_pong] 工具 "bash" 与 "grep" 交替循环 20+ 次

# 这验证了窗口=30足够检测20次交替（大约占用20-30条记录）
```

---

### A3: Schema 跨 Provider 兼容

**场景 1: Gemini schema 清洗**

```bash
# 1. 切换到 Gemini provider
# 设置: GOOGLE_GEMINI_API_KEY=<your-key>

# 2. 用户消息: "调用工具执行命令"

# 3. 预期观察
# - 在 runner.ts 的 streamChat 前
# - 执行 cleanToolSchemas(schemas, 'google-gemini')
# - Gemini 专用规则: 移除 pattern, examples, maxLength 等字段
# - Tool schemas 被清洗后再发送给 API

# 4. 验证方式：添加日志
// 在 runner.ts 行 ~460 添加:
//   console.log(`[debug] cleaned schemas:`, JSON.stringify(cleanedToolSchemas, null, 2))

# 5. 观察输出：
#   应该没有 "pattern", "examples", "maxLength" 等 Gemini 不支持的字段
```

**场景 2: xAI schema 清洗**

```bash
# 1. 切换到 xAI provider
# 设置: XAI_API_KEY=<your-key>

# 2. 同上流程

# 3. 预期观察
# - xAI 专用规则: 移除 pattern, maxLength, minLength
# - 但保留 title, examples 等（与 Gemini 不同）

# 4. 验证日志中确认字段差异
```

**场景 3: 标准 provider（OpenAI/Deepseek等）无修改**

```bash
# 1. 使用 OpenAI 或 Deepseek

# 2. Schema 不被修改，直接发送

# 3. 验证方式：
#   grep "provider family: standard" packages/core/tmp/logs
#   schema 原样透传
```

---

## 整合验证场景

### 完整工作流（所有A功能一起测试）

```bash
# 1. 启动应用
npm run dev

# 2. 创建新会话，输入:
用户: "帮我检查下这个代码是否有问题：
npm install --save react
npm run build
"

# 3. 预期流程
# - Agent 执行 bash: npm run build
# - 编译错误被检测 (A1) ✓
# - 自动注入修复提示
# - Agent 修改代码，再次编译成功
# - 循环检测窗口 (A2) 跟踪所有工具调用
# - Schema 清洗 (A3) 确保工具调用兼容当前 provider

# 4. 观察日志完整记录
tail -100 packages/core/tmp/equality-logs/tool-*.log
```

---

## 性能验证

### 内存占用（A2 滑动窗口）

```bash
# 运行持续 100+ 轮 toolLoop，验证内存稳定

# 监控方式：
#   1. 在 loop-detector.ts check() 方法后添加:
//      const memUsage = process.memoryUsage()
//      console.log(`[memory] heap=${Math.round(memUsage.heapUsed/1024/1024)}MB`)

#   2. 运行长对话，观察是否内存持续增长
#   3. 预期: 内存稳定在某个值（不超过 200MB 堆）
```

### CPU 效率（A3 schema 清洗）

```bash
# 验证 schema 清洗只执行一次（非循环内）

# 方式：在 runner.ts 行 ~430 处添加:
//   const t0 = performance.now()
//   cleanedToolSchemas = cleanToolSchemas(...)
//   console.log(`[perf] schema clean took ${performance.now() - t0}ms`)

# 预期: ~5-20ms（取决于 schema 数量和复杂度）
# 不应该是 ~100ms x 50轮 = 5000ms
```

---

## 问题排查

### 问题 1: 编译错误未被检测

```bash
# 检查清单:
# 1. 错误输出包含 pattern 吗？
#    - TypeScript: "error TS2345" 等
#    - Python: "SyntaxError:"
#    - Jest: "FAIL" 或 "failing"

# 2. 工具名是 'bash' 吗？
#    其他工具（read_file, write_file）不触发编译检测

# 3. 查看日志:
grep -A5 "isCompileOrTestError" packages/core/src/agent/runner.ts
#   应该匹配到模式

# 4. 手动测试 pattern:
node -e "
  const content = 'error TS2345: some error'
  const pattern = /error\\s+TS\\d+:/
  console.log(pattern.test(content)) // 应该输出 true
"
```

### 问题 2: 性能下降

```bash
# 检查清单：
# 1. schema 清洗是否在循环内？
#    应该在循环 BEFORE，不是 INSIDE

# 2. 查看代码:
grep -n "cleanToolSchemas" packages/core/src/agent/runner.ts
#   应该只出现 1 次（循环外）
#   而不是 N 次（循环内）
```

### 问题 3: 某个 Provider 的 schema 还是报错

```bash
# 1. 检查 PROVIDER_FAMILY_MAP 是否有映射
grep "providerId: 'your-provider'" packages/core/src/tools/schema-compat.ts

# 2. 如果缺少，添加到映射:
//   'your-provider': 'standard',  // 或 'gemini', 'xai'

# 3. 检查 Provider 类是否正确设置 providerId:
grep "readonly providerId" packages/core/src/providers/*.ts

# 4. 添加该 providerId 对应的 schema 清洗规则（如非标准family）
```

---

## 验证清单

- [ ] A1 编译错误检测：18/18 自动测试通过
- [ ] A1 编译重试：手动测试 TypeScript/Python 错误自动修复
- [ ] A1 误检率：运行时错误（TypeError 等）不被误判
- [ ] A2 滑动窗口：history.length 稳定在 30，totalCalls 持续增长
- [ ] A2 内存：100+ 轮循环后内存占用稳定
- [ ] A3 Schema 清洗：Gemini/xAI 的不支持字段被移除
- [ ] A3 无副作用：标准 provider schema 未被修改
- [ ] 整合：编译错误 + 循环检测 + schema 清洗 协作无冲突

---

## 提交测试报告

完成上述验证后，生成报告：

```bash
# 自动测试结果
npx tsx src/__tests__/phase-A.test.ts > test-report.txt

# 手动测试日志
tail -200 packages/core/tmp/equality-logs/tool-*.log >> test-report.txt

# 性能指标（可选）
echo "Performance: ..." >> test-report.txt

# 提交
git add test-report.txt
git commit -m "test(phase-A): verification report"
```
