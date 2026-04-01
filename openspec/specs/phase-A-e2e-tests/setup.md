# Phase A 端到端测试设置

## 测试文件准备

### 1. TypeScript 编译错误测试

创建文件 `test-compile-error.ts`：

```typescript
// ❌ 这个文件有意包含编译错误
const x: string = 123;  // TS2322: Type 'number' is not assignable to type 'string'
const y: number = "abc";  // TS2322: Type 'string' is not assignable to type 'number'
const result = unknownFunction();  // TS2304: Cannot find name 'unknownFunction'

interface User {
  name: string;
  age: number;
}

const user: User = {
  name: "Alice",
  // age 缺失 - TS2345: Property 'age' is missing in type
};

function add(a: number, b: number): string {
  return a + b;  // TS2322: Type 'number' is not assignable to type 'string'
}
```

**验证编译错误**：
```bash
npx tsc test-compile-error.ts --noEmit
```

预期输出：
```
test-compile-error.ts:1:7 - error TS2322: Type 'number' is not assignable to type 'string'.
test-compile-error.ts:2:7 - error TS2322: Type 'string' is not assignable to type 'number'.
test-compile-error.ts:3:15 - error TS2304: Cannot find name 'unknownFunction'.
...
```

---

### 2. 运行时错误测试（应该NOT被A1检测）

创建文件 `test-runtime-error.py`：

```python
# ❌ 这个文件有运行时错误，不是编译错误
def divide(a, b):
    return a / b

result = divide(10, 0)  # ZeroDivisionError

try:
    data = json.loads("invalid json")
except NameError:  # NameError: name 'json' is not defined
    pass

my_list = [1, 2, 3]
print(my_list[10])  # IndexError: list index out of range

obj = None
print(obj.method())  # AttributeError: 'NoneType' object has no attribute 'method'
```

**验证运行时错误**：
```bash
python test-runtime-error.py
```

预期输出（某个运行时错误）：
```
Traceback (most recent call last):
  File "test-runtime-error.py", line 6, in <module>
    result = divide(10, 0)
ZeroDivisionError: division by zero
```

**关键**：这个错误应该 NOT 被 A1 编译检测器识别为编译错误。

---

### 3. Jest 测试失败

创建文件 `test-jest-fail.test.ts`：

```typescript
describe('Jest Failure Detection', () => {
  test('intentional failure - sum should be correct', () => {
    const sum = 2 + 2;
    expect(sum).toBe(5);  // ❌ 故意失败
  });

  test('another failure - string comparison', () => {
    const str = 'hello';
    expect(str).toBe('world');  // ❌ 故意失败
  });

  test('this one passes', () => {
    expect(1 + 1).toBe(2);  // ✅ 通过
  });
});
```

**验证 Jest 失败**：
```bash
npx jest test-jest-fail.test.ts
```

预期输出：
```
FAIL  test-jest-fail.test.ts
  ● Jest Failure Detection › intentional failure - sum should be correct

    expect(received).toBe(expected)
    Expected: 5
    Received: 4

      2 | test('intentional failure', () => {
      3 |   const sum = 2 + 2;
      4 |   expect(sum).toBe(5);
        | ^

Tests: 1 failed, 1 passed, 2 total
```

---

## 测试场景

### 场景 A1-1: 编译错误自动重试

**用户消息**：
```
请帮我检查这个 TypeScript 文件有没有编译错误：
npx tsc test-compile-error.ts --noEmit
```

**预期 Phase A 行为**：
1. bash tool 执行命令，返回编译错误输出
2. A1 编译检测器识别到 `error TS` 模式
3. 自动设置 `compileErrorDetected = true`
4. 在下一个 toolLoop 迭代中，注入修复提示给 LLM
5. LLM 分析错误，修改代码，再次运行 tsc
6. 第二次 tsc 通过 ✅

**验证方式**：
```bash
# 查看日志
grep -i "compile\|ts2" packages/core/tmp/equality-logs/tool-*.log
```

---

### 场景 A1-2: 运行时错误不被误判

**用户消息**：
```
执行这个 Python 脚本：
python test-runtime-error.py
```

**预期 Phase A 行为**：
1. bash tool 执行命令，返回 `ZeroDivisionError: division by zero`
2. A1 编译检测器检查模式：
   - ❌ 不匹配 `error TS` (TypeScript 编译)
   - ❌ 不匹配 `FAILED\|PASS` (Jest)
   - ❌ 不匹配 `SyntaxError` (Python 编译)
   - ❌ 不匹配 `TypeError`, `ReferenceError` 等运行时错误
3. `compileErrorDetected = false` → **不注入修复提示**
4. LLM 根据实际运行时错误正常响应（而非被推向"修复代码"）

**验证方式**：
```bash
# 查看日志 - 不应该有 "compile" 相关日志
grep -i "compile" packages/core/tmp/equality-logs/tool-*.log
# 应该是空的
```

---

### 场景 A2-1: 滑动窗口限制历史

**用户消息**：
```
重复执行50次相同命令：
for i in {1..50}; do echo "test-$i"; done
```

**预期 Phase A 行为**：
1. 循环检测器记录 50 次调用
2. 内存中只保留最近 30 条记录（`HISTORY_WINDOW_SIZE = 30`）
3. 观察日志或调试输出：`history.length=30, totalCalls=50`

---

### 场景 A3-1: Provider Schema 清理

**用户消息**：
```
使用 Gemini 调用工具，检查 schema 是否被清理过
```

**预期 Phase A 行为**：
1. Gemini provider 初始化时调用 `cleanToolSchemas(schemas, 'gemini')`
2. 所有 tool 的 schema 中：
   - ❌ 移除了 `pattern`, `examples`, `title`, `maxLength`, `minLength` 字段
   - ❌ `anyOf`/`oneOf` 被 flatten
   - ✅ `type`, `properties` 被注入
3. schema 清理发生一次（第一次 runner.toolLoop），不会重复 50 次

**验证方式**：
```bash
# 添加 debug 日志到 runner.ts
console.log(`[A3] cleanToolSchemas called for ${providerId}`)
```

---

## 快速启动

```bash
# 1. 创建测试文件
cat > test-compile-error.ts << 'EOF'
const x: string = 123;
const y: number = "abc";
const result = unknownFunction();
EOF

# 2. 创建 Python 测试文件
cat > test-runtime-error.py << 'EOF'
result = 10 / 0
EOF

# 3. 创建 Jest 测试文件
cat > test-jest-fail.test.ts << 'EOF'
test('fail', () => { expect(2+2).toBe(5); });
EOF

# 4. 启动应用
npm run dev

# 5. 执行测试场景
# 在 UI 中发送用户消息...
```

---

## 检查清单

- [ ] A1-1 编译错误自动重试成功
- [ ] A1-2 运行时错误不被误判
- [ ] A1-3 Jest 失败被检测并重试
- [ ] A2-1 窗口大小限制到 30
- [ ] A3-1 Schema 清理正确应用
- [ ] 所有功能集成工作正常
