/**
 * Phase R1: autoCapture 关键词预过滤 — 单元测试
 *
 * 新架构：关键词预过滤 + LLM 意图判断
 * 本测试仅验证预过滤层（不涉及 LLM 调用）
 *
 * 验证:
 *   ✅ "还记得我是谁么" → 通过预过滤（含关键词），交给 LLM 判断
 *   ✅ "记住我的名字是张三" → 通过预过滤（含关键词），交给 LLM 判断
 *   ✅ "请帮我写一个函数" → 被预过滤拦截（无关键词），不调 LLM
 *   ✅ "解释一下 TypeScript 的泛型" → 被预过滤拦截（无关键词），不调 LLM
 */

import assert from 'node:assert/strict'

// ── 从 runner.ts 中抽取相同的预过滤正则 ──

const MEMORY_KEYWORD_PREFILTER = /记住|记下|别忘|记得|remember|keep in mind|don'?t forget|note that|我(喜欢|偏好|习惯|总是|从不|不喜欢)|i (like|prefer|hate|always|never|want)|以后都?用|以后都?别|我的(名字|邮箱|手机|电话|地址|公司)/i

/**
 * 模拟预过滤逻辑：
 * 返回 'pass-to-llm'（包含关键词，需要 LLM 判断）或 'skip'（无关消息，直接跳过）
 */
function simulatePrefilter(text: string): 'pass-to-llm' | 'skip' {
  const trimmed = text.trim()
  if (trimmed.length < 5 || trimmed.length > 500) return 'skip'
  return MEMORY_KEYWORD_PREFILTER.test(trimmed) ? 'pass-to-llm' : 'skip'
}

let assertions = 0
function ok(cond: boolean, msg: string) {
  assert(cond, msg)
  assertions++
  console.log(`  ✅ ${msg}`)
}

try {
  console.log('\n═══ Phase R1: autoCapture 预过滤测试 ═══\n')

  // ── 1. 包含记忆关键词的消息：通过预过滤，交给 LLM 判断 ──
  console.log('── 1. 通过预过滤（含关键词，交 LLM）──')

  ok(simulatePrefilter('还记得我是谁么') === 'pass-to-llm',
    'R1-01: "还记得我是谁么" → 含"记得"，交 LLM 判断')

  ok(simulatePrefilter('记住我的名字是张三') === 'pass-to-llm',
    'R1-02: "记住我的名字是张三" → 含"记住"，交 LLM 判断')

  ok(simulatePrefilter('别忘了这个配置') === 'pass-to-llm',
    'R1-03: "别忘了..." → 含"别忘"，交 LLM 判断')

  ok(simulatePrefilter('我喜欢什么') === 'pass-to-llm',
    'R1-04: "我喜欢什么" → 含"我喜欢"，交 LLM（LLM 会判断这是查询）')

  ok(simulatePrefilter('我喜欢使用 TypeScript') === 'pass-to-llm',
    'R1-05: "我喜欢使用 TypeScript" → 含"我喜欢"，交 LLM 判断')

  ok(simulatePrefilter('我偏好函数式编程') === 'pass-to-llm',
    'R1-06: "我偏好..." → 含"我偏好"，交 LLM 判断')

  ok(simulatePrefilter('remember my timezone is UTC+8') === 'pass-to-llm',
    'R1-07: "remember..." → 含"remember"，交 LLM 判断')

  ok(simulatePrefilter('do you remember my name') === 'pass-to-llm',
    'R1-08: "do you remember..." → 含"remember"，交 LLM 判断')

  ok(simulatePrefilter("keep in mind we use ESM") === 'pass-to-llm',
    'R1-09: "keep in mind..." → 含关键词，交 LLM 判断')

  ok(simulatePrefilter("don't forget the API endpoint") === 'pass-to-llm',
    'R1-10: "don\'t forget..." → 含关键词，交 LLM 判断')

  ok(simulatePrefilter('我的名字是李四') === 'pass-to-llm',
    'R1-11: "我的名字是..." → 含"我的名字"，交 LLM 判断')

  ok(simulatePrefilter('以后都用 ESM 格式') === 'pass-to-llm',
    'R1-12: "以后都用..." → 含关键词，交 LLM 判断')

  ok(simulatePrefilter('I prefer TypeScript over JavaScript') === 'pass-to-llm',
    'R1-13: "I prefer..." → 含关键词，交 LLM 判断')

  ok(simulatePrefilter('I want to use dark theme always') === 'pass-to-llm',
    'R1-14: "I want..." → 含关键词，交 LLM 判断')

  // ── 2. 不含记忆关键词的消息：预过滤拦截，不调 LLM ──
  console.log('\n── 2. 预过滤拦截（无关键词，不调 LLM）──')

  ok(simulatePrefilter('请帮我写一个函数') === 'skip',
    'R1-15: 普通请求 → 拦截')

  ok(simulatePrefilter('这个 bug 怎么修') === 'skip',
    'R1-16: 普通问题 → 拦截')

  ok(simulatePrefilter('解释一下 TypeScript 的泛型') === 'skip',
    'R1-17: 知识问答 → 拦截')

  ok(simulatePrefilter('hello world') === 'skip',
    'R1-18: 简单问候 → 拦截')

  ok(simulatePrefilter('帮我分析一下这段代码') === 'skip',
    'R1-19: 代码分析 → 拦截')

  ok(simulatePrefilter('列出当前目录的文件') === 'skip',
    'R1-20: 工具请求 → 拦截')

  ok(simulatePrefilter('项目结构分析') === 'skip',
    'R1-21: 项目分析 → 拦截')

  ok(simulatePrefilter('在代码库搜索 sessionKey 的使用') === 'skip',
    'R1-22: 搜索请求 → 拦截')

  // ── 3. 边界情况 ──
  console.log('\n── 3. 边界情况 ──')

  ok(simulatePrefilter('abc') === 'skip',
    'R1-23: 短于5字 → 拦截（长度过滤）')

  ok(simulatePrefilter('记住') === 'skip',
    'R1-24: "记住"仅2字 → 拦截（长度过滤）')

  ok(simulatePrefilter('x'.repeat(501)) === 'skip',
    'R1-25: 超过500字 → 拦截（长度过滤）')

  console.log(`\n═══ Phase R1: 全部通过 (${assertions} assertions) ═══\n`)
} catch (err) {
  console.error('\n❌ FAIL:', err)
  process.exit(1)
}
