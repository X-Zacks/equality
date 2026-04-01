/**
 * __tests__/phase-A.test.ts
 *
 * Phase A 功能集成测试
 * 
 * 运行方式：
 *   npx tsx src/__tests__/phase-A.test.ts
 *
 * 或使用 npm test 脚本（需要在 package.json 中添加）
 */

// ─── A1: 编译错误检测测试 ──────────────────────────────────────────────

console.log('\n' + '═'.repeat(80))
console.log('Phase A Test Suite')
console.log('═'.repeat(80))

// 模拟 isCompileOrTestError 函数
function isCompileOrTestError(toolName: string, content: string): boolean {
  if (toolName !== 'bash') return false

  const tsPatterns = [
    /error\s+TS\d+:/,
    /\.tsx?:\(\d+,\d+\):\s*error/,
    /SyntaxError: Unexpected token/i,
    /Cannot find module '.*'/i,
    /Module not found/i,
  ]

  const pyPatterns = [
    /SyntaxError:/,
    /IndentationError:/,
    /ModuleNotFoundError:/,
    /ImportError:/,
  ]

  const rsPatterns = [
    /^error\[E\d+\]:/m,
    /error: could not compile/i,
  ]

  const goPatterns = [
    /^.*\.go:\d+:\d+:.*(?:undefined|cannot|expected)/m,
  ]

  const testPatterns = [
    /\d+ failing/i,
    /FAIL\s+.*\.test\./i,
    /Tests:\s+\d+ failed/i,
    /FAILED\s+.*\.rs/i,
    /pytest.*\d+ failed/i,
  ]

  const allPatterns = [...tsPatterns, ...pyPatterns, ...rsPatterns, ...goPatterns, ...testPatterns]
  return allPatterns.some(p => p.test(content))
}

function extractCompileErrors(content: string, maxChars: number = 2000): string {
  const lines = content.split('\n')
  const errorLineIndices = new Set<number>()
  const errorPattern = /^error|^fatal|\berror\[E\d|error\s+TS\d|SyntaxError|IndentationError|ModuleNotFoundError|ImportError|FAIL\s|Tests:.*failed|failing/i
  
  for (let i = 0; i < lines.length; i++) {
    if (errorPattern.test(lines[i])) {
      errorLineIndices.add(i)
    }
  }

  const selectedLines = new Set<number>()
  for (const idx of errorLineIndices) {
    if (idx > 0) selectedLines.add(idx - 1)
    selectedLines.add(idx)
    if (idx < lines.length - 1) selectedLines.add(idx + 1)
  }

  const sortedIndices = [...selectedLines].sort((a, b) => a - b)
  const collected = sortedIndices.map(i => lines[i])

  if (collected.length === 0) {
    const tailStart = Math.max(0, lines.length - 10)
    collected.push(...lines.slice(tailStart))
  }

  let summary = collected.join('\n')
  if (summary.length > maxChars) {
    summary = summary.slice(0, maxChars) + '\n... (截断)'
  }

  return summary
}

// ─── 测试用例 ──────────────────────────────────────────────────────────

interface TestCase {
  name: string
  toolName: string
  content: string
  expectedError: boolean
  description: string
}

const testCases: TestCase[] = [
  // ✅ 应该检测到的编译错误
  {
    name: '✓ TypeScript 编译错误',
    toolName: 'bash',
    content: `error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.`,
    expectedError: true,
    description: 'tsc 输出的标准错误'
  },
  {
    name: '✓ Python 语法错误',
    toolName: 'bash',
    content: `  File "script.py", line 10
    if x = 5:
         ^
SyntaxError: invalid syntax`,
    expectedError: true,
    description: 'Python SyntaxError'
  },
  {
    name: '✓ Node.js 模块找不到',
    toolName: 'bash',
    content: `Error: Cannot find module './missing'`,
    expectedError: true,
    description: 'require 失败'
  },
  {
    name: '✓ Jest 测试失败汇总',
    toolName: 'bash',
    content: `FAIL  src/__tests__/api.test.ts
  ● MyTest › should work
    Error: Expected true to be false`,
    expectedError: true,
    description: 'Jest 输出的测试失败摘要'
  },
  {
    name: '✓ Python import 错误',
    toolName: 'bash',
    content: `ModuleNotFoundError: No module named 'numpy'`,
    expectedError: true,
    description: 'Python 导入失败'
  },
  
  // ❌ 不应该检测为编译错误（运行时错误）
  {
    name: '✗ TypeError（运行时，不是编译错误）',
    toolName: 'bash',
    content: `TypeError: Cannot read property 'length' of undefined`,
    expectedError: false,
    description: '正常的运行时错误，不应该被误判'
  },
  {
    name: '✗ 正常的 Python import 代码',
    toolName: 'bash',
    content: `from mylib import error_handler  # 正常导入`,
    expectedError: false,
    description: '不是错误，只是代码中包含 import'
  },
  {
    name: '✗ 非 bash 工具的错误',
    toolName: 'read_file',
    content: `error TS2345: Some TypeScript error`,
    expectedError: false,
    description: '只有 bash 工具才检测'
  },
  {
    name: '✗ Python Traceback（运行时异常）',
    toolName: 'bash',
    content: `Traceback (most recent call last):
  File "script.py", line 5, in <module>
    result = 10 / 0
ZeroDivisionError: division by zero`,
    expectedError: false,
    description: 'Traceback 是运行时异常，不是编译错误'
  },
  {
    name: '✗ Python 无法运行脚本',
    toolName: 'bash',
    content: `python: can't open file 'missing.py': [Errno 2] No such file or directory`,
    expectedError: false,
    description: '文件不存在是 shell 错误，不是编译/parse 错误'
  }
]

// ─── 运行测试 ──────────────────────────────────────────────────────────

console.log('\n### A1: 编译错误检测测试 ###\n')

let passed = 0
let failed = 0

for (const tc of testCases) {
  const result = isCompileOrTestError(tc.toolName, tc.content)
  const success = result === tc.expectedError

  if (success) {
    console.log(`✅ ${tc.name}`)
    console.log(`   ${tc.description}`)
    passed++
  } else {
    console.log(`❌ ${tc.name}`)
    console.log(`   ${tc.description}`)
    console.log(`   预期: ${tc.expectedError}, 实际: ${result}`)
    console.log(`   内容: ${tc.content.slice(0, 60)}...`)
    failed++
  }
  console.log()
}

// ─── A3: extractCompileErrors 去重测试 ──────────────────────────────

console.log('\n### A3: 错误提取与去重测试 ###\n')

const extractTestCases = [
  {
    name: '连续错误行去重',
    input: `line0
error line1
error line2
error line3
line4`,
    expectNoRepeat: true,
    description: '连续3行错误，应无重复行'
  },
  {
    name: '无错误行时取末尾',
    input: `normal line 1
normal line 2
normal line 3`,
    expectHasContent: true,
    description: '无匹配错误时，取末尾内容'
  }
]

for (const tc of extractTestCases) {
  const result = extractCompileErrors(tc.input, 2000)
  const lines = result.split('\n')
  
  if (tc.expectNoRepeat) {
    const lineSet = new Set(lines)
    const hasRepeat = lineSet.size < lines.length
    if (!hasRepeat) {
      console.log(`✅ ${tc.name}`)
      console.log(`   ${tc.description}`)
      console.log(`   提取行数: ${lines.length}, 唯一行数: ${lineSet.size}`)
      passed++
    } else {
      console.log(`❌ ${tc.name}`)
      console.log(`   发现重复行`)
      failed++
    }
  }
  
  if (tc.expectHasContent) {
    if (result.length > 0) {
      console.log(`✅ ${tc.name}`)
      console.log(`   ${tc.description}`)
      console.log(`   提取内容长度: ${result.length}`)
      passed++
    } else {
      console.log(`❌ ${tc.name}`)
      console.log(`   未能提取内容`)
      failed++
    }
  }
  console.log()
}

// ─── A2: Loop Detector 滑动窗口测试 ──────────────────────────────────

console.log('\n### A2: 循环检测滑动窗口测试 ###\n')

class SimpleLoopDetector {
  private history: Array<{ name: string; hash: string }> = []
  private totalCalls = 0
  private readonly WINDOW_SIZE = 30

  check(name: string, hash: string): boolean {
    this.totalCalls++
    this.history.push({ name, hash })

    // 滑动窗口裁剪
    if (this.history.length > this.WINDOW_SIZE) {
      this.history.shift()
    }

    return this.history.length <= this.WINDOW_SIZE
  }

  getHistoryLength(): number {
    return this.history.length
  }

  getTotalCalls(): number {
    return this.totalCalls
  }
}

const detector = new SimpleLoopDetector()

// 插入 50 条记录
for (let i = 0; i < 50; i++) {
  detector.check('bash', `hash_${i}`)
}

const historyAfter50 = detector.getHistoryLength()
const totalCalls = detector.getTotalCalls()

if (historyAfter50 === 30 && totalCalls === 50) {
  console.log(`✅ 滑动窗口容量测试`)
  console.log(`   50次调用后: history=${historyAfter50}, totalCalls=${totalCalls}`)
  console.log(`   符合预期: 窗口=30, 总数=50`)
  passed++
} else {
  console.log(`❌ 滑动窗口容量测试`)
  console.log(`   期望: history=30, totalCalls=50`)
  console.log(`   实际: history=${historyAfter50}, totalCalls=${totalCalls}`)
  failed++
}

// ─── A3: Schema 兼容映射测试 ──────────────────────────────────────────

console.log('\n### A3: Provider 映射测试 ###\n')

const PROVIDER_FAMILY_MAP: Record<string, string> = {
  'google-gemini': 'gemini',
  'gemini': 'gemini',
  'xai': 'xai',
  'x-ai': 'xai',
  'openai': 'standard',
  'openai-azure': 'standard',
  'anthropic': 'standard',
  'cohere': 'standard',
  'perplexity': 'standard',
  'deepseek': 'standard',
  'qwen': 'standard',
  'volc': 'standard',
  'minimax': 'standard',
  'copilot': 'standard',
  'custom': 'standard',
}

function resolveProviderFamily(providerId: string): string {
  return PROVIDER_FAMILY_MAP[providerId.toLowerCase()] ?? 'standard'
}

const providerTests = [
  { id: 'deepseek', expectFamily: 'standard' },
  { id: 'qwen', expectFamily: 'standard' },
  { id: 'gemini', expectFamily: 'gemini' },
  { id: 'xai', expectFamily: 'xai' },
  { id: 'unknown-provider', expectFamily: 'standard' },
]

for (const test of providerTests) {
  const family = resolveProviderFamily(test.id)
  if (family === test.expectFamily) {
    console.log(`✅ ${test.id} → ${family}`)
    passed++
  } else {
    console.log(`❌ ${test.id}: 期望 ${test.expectFamily}, 实际 ${family}`)
    failed++
  }
}

// ─── 汇总 ──────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(80))
console.log(`测试结果: ${passed} ✅ passed, ${failed} ❌ failed`)
console.log('═'.repeat(80) + '\n')

process.exit(failed > 0 ? 1 : 0)
