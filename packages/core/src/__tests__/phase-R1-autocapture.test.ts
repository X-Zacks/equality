/**
 * Phase R1: autoCapture 反向排除修正 — 单元测试
 *
 * 验证:
 *   ✅ "还记得我是谁么" → 不触发保存（查询型）
 *   ✅ "你记得我说过什么吗" → 不触发保存（查询型）
 *   ✅ "do you remember my name" → 不触发保存（查询型）
 *   ✅ "记住我的名字是张三" → 触发保存（指令型）
 *   ✅ "别忘了这个配置" → 触发保存（指令型）
 *   ✅ "我喜欢 TypeScript" → 触发保存（偏好型）
 */

import assert from 'node:assert/strict'

// ── 从 runner.ts 中抽取相同的正则表达式进行测试 ──

const CAPTURE_TRIGGERS = [
  /记住|记下|别忘/,
  /remember|keep in mind|don'?t forget|note that/i,
  /我(喜欢|偏好|习惯|总是|从不|不喜欢)/,
  /i (like|prefer|hate|always|never|want)/i,
  /以后都?用|以后都?别/,
  /我的(名字|邮箱|手机|电话|地址|公司)/,
]

const CAPTURE_ANTI_PATTERNS = [
  /还记得|你记得|记得.{0,4}(吗|么|嘛|没|不)/,
  /记住了?.{0,4}(吗|么|嘛|没|不)/,
  /上次.{0,6}记住/,
  /do you remember|can you recall|you still remember/i,
  /what did (i|we) (say|tell|mention)/i,
  /^(你|我)?(还)?(记得|记住了?)(吗|么|嘛|没)?[？?]?$/,
]

/**
 * 模拟 autoCapture 的匹配逻辑：
 * 返回 'save'（会保存）、'skip-query'（查询型跳过）、'no-match'（无触发词）
 */
function simulateAutoCapture(text: string): 'save' | 'skip-query' | 'no-match' {
  const trimmed = text.trim()
  if (trimmed.length < 5 || trimmed.length > 500) return 'no-match'

  // 反向排除
  for (const anti of CAPTURE_ANTI_PATTERNS) {
    if (anti.test(trimmed)) return 'skip-query'
  }

  // 正向触发
  for (const pat of CAPTURE_TRIGGERS) {
    if (pat.test(trimmed)) return 'save'
  }

  return 'no-match'
}

let assertions = 0
function ok(cond: boolean, msg: string) {
  assert(cond, msg)
  assertions++
  console.log(`  ✅ ${msg}`)
}

try {
  console.log('\n═══ Phase R1: autoCapture 反向排除测试 ═══\n')

  // ── 1. 查询型消息：不应触发保存 ──
  console.log('── 1. 查询型（应跳过）──')

  ok(simulateAutoCapture('还记得我是谁么') === 'skip-query',
    'R1-01: "还记得我是谁么" → 跳过（查询型）')

  ok(simulateAutoCapture('你还记得我的名字吗') === 'skip-query',
    'R1-02: "你还记得我的名字吗" → 跳过（查询型）')

  ok(simulateAutoCapture('你记得我说过什么吗') === 'skip-query',
    'R1-03: "你记得我说过什么吗" → 跳过（查询型）')

  ok(simulateAutoCapture('记得吗？这个配置很重要') === 'skip-query',
    'R1-04: "记得吗？这个配置很重要" → 跳过（查询型）')

  ok(simulateAutoCapture('你记得么？上次的方案') === 'skip-query',
    'R1-05: "你记得么？上次的方案" → 跳过（查询型）')

  ok(simulateAutoCapture('还记得上次讨论的方案吗') === 'skip-query',
    'R1-06: "还记得上次讨论的方案吗" → 跳过（查询型）')

  ok(simulateAutoCapture('do you remember my name') === 'skip-query',
    'R1-07: "do you remember my name" → 跳过（查询型）')

  ok(simulateAutoCapture('can you recall what I said') === 'skip-query',
    'R1-08: "can you recall what I said" → 跳过（查询型）')

  ok(simulateAutoCapture('you still remember that config right') === 'skip-query',
    'R1-09: "you still remember..." → 跳过（查询型）')

  ok(simulateAutoCapture('上次让你记住的东西还在吗') === 'skip-query',
    'R1-10: "上次...记住..." → 跳过（查询型）')

  ok(simulateAutoCapture('what did I say about the deployment') === 'skip-query',
    'R1-11: "what did I say about..." → 跳过（查询型）')

  ok(simulateAutoCapture('what did we mention in the last meeting') === 'skip-query',
    'R1-12: "what did we mention..." → 跳过（查询型）')

  // ── 2. 指令型消息：应触发保存 ──
  console.log('\n── 2. 指令型（应触发保存）──')

  ok(simulateAutoCapture('记住我的名字是张三') === 'save',
    'R1-13: "记住我的名字是张三" → 保存')

  ok(simulateAutoCapture('记下这个配置，端口是8080') === 'save',
    'R1-14: "记下这个配置" → 保存')

  ok(simulateAutoCapture('别忘了我们约定的编码风格') === 'save',
    'R1-15: "别忘了..." → 保存')

  ok(simulateAutoCapture('remember my timezone is UTC+8') === 'save',
    'R1-16: "remember my timezone" → 保存')

  ok(simulateAutoCapture("keep in mind that I use vim keybindings") === 'save',
    'R1-17: "keep in mind" → 保存')

  ok(simulateAutoCapture("don't forget the API endpoint") === 'save',
    'R1-18: "don\'t forget" → 保存')

  ok(simulateAutoCapture('note that we use pnpm not npm') === 'save',
    'R1-19: "note that" → 保存')

  // ── 3. 偏好型消息：应触发保存 ──
  console.log('\n── 3. 偏好型（应触发保存）──')

  ok(simulateAutoCapture('我喜欢使用 TypeScript') === 'save',
    'R1-20: "我喜欢..." → 保存')

  ok(simulateAutoCapture('我偏好函数式编程风格') === 'save',
    'R1-21: "我偏好..." → 保存')

  ok(simulateAutoCapture('我习惯用 VSCode 开发') === 'save',
    'R1-22: "我习惯..." → 保存')

  ok(simulateAutoCapture('我总是用单引号而不是双引号') === 'save',
    'R1-23: "我总是..." → 保存')

  ok(simulateAutoCapture('我从不用 var 声明变量') === 'save',
    'R1-24: "我从不..." → 保存')

  ok(simulateAutoCapture('我不喜欢 tabs 缩进') === 'save',
    'R1-25: "我不喜欢..." → 保存')

  ok(simulateAutoCapture('I like using dark themes') === 'save',
    'R1-26: "I like..." → 保存')

  ok(simulateAutoCapture('I prefer TypeScript over JavaScript') === 'save',
    'R1-27: "I prefer..." → 保存')

  ok(simulateAutoCapture('以后都用 ESM 格式') === 'save',
    'R1-28: "以后都用..." → 保存')

  ok(simulateAutoCapture('我的名字是李四') === 'save',
    'R1-29: "我的名字是..." → 保存')

  ok(simulateAutoCapture('我的邮箱是 test@example.com') === 'save',
    'R1-30: "我的邮箱是..." → 保存')

  // ── 4. 无关消息：不应触发 ──
  console.log('\n── 4. 无关消息（不匹配）──')

  ok(simulateAutoCapture('请帮我写一个函数') === 'no-match',
    'R1-31: 普通请求 → 不匹配')

  ok(simulateAutoCapture('这个 bug 怎么修') === 'no-match',
    'R1-32: 普通问题 → 不匹配')

  ok(simulateAutoCapture('解释一下 TypeScript 的泛型') === 'no-match',
    'R1-33: 知识问答 → 不匹配')

  ok(simulateAutoCapture('hello world') === 'no-match',
    'R1-34: 简单问候 → 不匹配')

  // ── 5. 边界情况 ──
  console.log('\n── 5. 边界情况 ──')

  ok(simulateAutoCapture('abc') === 'no-match',
    'R1-35: 短于5字 → 不匹配（长度过滤）')

  ok(simulateAutoCapture('记住') === 'no-match',
    'R1-36: "记住"仅2字 → 不匹配（长度过滤）')

  // 关键：含"记住"但是查询型的句子
  ok(simulateAutoCapture('你还记得吗，上次记住的内容') === 'skip-query',
    'R1-37: 混合"还记得"+"记住" → 反向模式优先，跳过')

  // "记住了吗" 是在确认，不是指令
  ok(simulateAutoCapture('你记住了吗那个配置') === 'skip-query',
    'R1-38: "你记住了吗那个配置" → 查询型，跳过')

  // "Do you remember" + "remember" 的混合
  ok(simulateAutoCapture('Do you remember what I said about TypeScript?') === 'skip-query',
    'R1-39: "Do you remember..." → 查询型，跳过')

  console.log(`\n═══ Phase R1: 全部通过 (${assertions} assertions) ═══\n`)
} catch (err) {
  console.error('\n❌ FAIL:', err)
  process.exit(1)
}
