/**
 * __tests__/system-prompt.test.ts — Phase F2 Prompt 稳定性快照测试
 *
 * 运行：npx tsx src/__tests__/system-prompt.test.ts
 * 更新快照：npx tsx src/__tests__/system-prompt.test.ts --update
 *
 * 6 个场景覆盖 buildSystemPrompt 的所有分支：
 *   S1 — 基础（无参数）
 *   S2 — 带工作目录
 *   S3 — 带 Skills 列表
 *   S4 — 带 activeSkill（@ 指定）
 *   S5 — 全参数组合
 *   S6 — 空参数对象
 */

import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSystemPrompt } from '../agent/system-prompt.js'
import type { Skill } from '../skills/types.js'

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SNAPSHOT_DIR = join(__dirname, '__snapshots__')
const SNAPSHOT_FILE = join(SNAPSHOT_DIR, 'system-prompt.snap.json')
const UPDATE_MODE = process.argv.includes('--update')

// ─── Test Harness ─────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function ok(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ ${message}`)
    passed++
  } else {
    console.error(`  ❌ ${message}`)
    failed++
  }
}

// ─── 动态值规范化 ─────────────────────────────────────────────────────────────

/**
 * 将 prompt 中的动态值替换为稳定占位符，用于快照对比。
 *
 * 替换项：
 * - 日期时间（如 "2026/4/3 14:30:00"）→ "{{NOW}}"
 * - 平台信息（如 "win32 x64 (10.0.26100)"）→ "{{PLATFORM}}"
 * - 用户主目录路径（如 "C:/Users/xxx" 或 "~/..."）→ "{{HOME}}"
 * - Skills 目录绝对路径 → "{{SKILLS_DIR}}"
 */
function normalizePrompt(text: string): string {
  let result = text

  // 日期时间：匹配 "当前: YYYY/M/D HH:MM:SS" 或类似格式
  result = result.replace(
    /当前: \d{4}\/\d{1,2}\/\d{1,2}\s+(?:上午|下午)?\d{1,2}:\d{2}:\d{2}/g,
    '当前: {{NOW}}'
  )

  // 平台信息：匹配 "| win32 x64 (xxx)" 或 "| darwin arm64 (xxx)"
  result = result.replace(
    /\|\s*(win32|darwin|linux)\s+\S+\s+\([^)]+\)/g,
    '| {{PLATFORM}}'
  )

  // Skills 目录：匹配绝对路径或以 ~ 开头的路径到 /skills/bundled
  result = result.replace(
    /(?:[A-Za-z]:)?[\\/][^\s"'`]+[\\/]skills[\\/]bundled/g,
    '{{SKILLS_DIR}}'
  )
  // 前向 / 的版本
  result = result.replace(
    /(?:[A-Za-z]:)?\/[^\s"'`]*\/skills\/bundled/g,
    '{{SKILLS_DIR}}'
  )

  // 创建日期占位符
  result = result.replace(
    /created: \d{4}-\d{2}-\d{2}/g,
    'created: {{TODAY}}'
  )

  return result
}

// ─── Mock Skill 构造 ──────────────────────────────────────────────────────────

const mockSkill1: Skill = {
  name: 'test-coding',
  description: 'Test coding skill. Use when: writing tests. NOT for: production code.',
  filePath: '/mock/skills/test-coding/SKILL.md',
  baseDir: '/mock/skills/test-coding',
  body: '## Steps\n1. Read the test file\n2. Write assertions\n3. Run tests',
  metadata: {
    name: 'test-coding',
    description: 'Test coding skill. Use when: writing tests. NOT for: production code.',
    tools: ['bash', 'write_file'],
  },
}

const mockSkill2: Skill = {
  name: 'git-workflow',
  description: 'Git workflow. Use when: committing, branching. NOT for: code review.',
  filePath: '/mock/skills/git-workflow/SKILL.md',
  baseDir: '/mock/skills/git-workflow',
  body: '## Steps\n1. Check status\n2. Stage changes\n3. Commit',
  metadata: {
    name: 'git-workflow',
    description: 'Git workflow. Use when: committing, branching. NOT for: code review.',
    tools: ['bash'],
  },
}

// ─── 快照读写 ─────────────────────────────────────────────────────────────────

type SnapshotMap = Record<string, string>

function loadSnapshot(): SnapshotMap | null {
  if (!existsSync(SNAPSHOT_FILE)) return null
  try {
    return JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf-8'))
  } catch {
    return null
  }
}

function saveSnapshot(snap: SnapshotMap): void {
  if (!existsSync(SNAPSHOT_DIR)) {
    mkdirSync(SNAPSHOT_DIR, { recursive: true })
  }
  writeFileSync(SNAPSHOT_FILE, JSON.stringify(snap, null, 2), 'utf-8')
}

// ─── 场景定义 ─────────────────────────────────────────────────────────────────

interface Scenario {
  id: string
  label: string
  options: Parameters<typeof buildSystemPrompt>[0]
}

const SCENARIOS: Scenario[] = [
  {
    id: 'S1',
    label: '基础（无参数）',
    options: undefined,
  },
  {
    id: 'S2',
    label: '带工作目录',
    options: { workspaceDir: 'C:\\projects\\my-app' },
  },
  {
    id: 'S3',
    label: '带 Skills 列表',
    options: { skills: [mockSkill1, mockSkill2] },
  },
  {
    id: 'S4',
    label: '带 activeSkills（@ 指定，单个）',
    options: { activeSkills: [mockSkill1] },
  },
  {
    id: 'S5',
    label: '全参数组合',
    options: {
      workspaceDir: 'C:\\projects\\my-app',
      skills: [mockSkill1, mockSkill2],
      activeSkills: [mockSkill1],
      modelName: 'gpt-5.2',
    },
  },
  {
    id: 'S6',
    label: '空参数对象',
    options: {},
  },
  {
    id: 'S7',
    label: '多 activeSkills（@ 指定，2个）',
    options: { activeSkills: [mockSkill1, mockSkill2] },
  },
]

// ─── 运行 ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log('── Phase F2: System Prompt 快照测试 ──\n')

  // 1. 生成所有场景的 prompt
  const generated: SnapshotMap = {}
  for (const s of SCENARIOS) {
    const raw = buildSystemPrompt(s.options)
    generated[s.id] = normalizePrompt(raw)
  }

  // 2. 基本结构断言（与快照无关）
  console.log('── 结构性断言 ──')

  const s1 = generated['S1']
  ok(s1.includes('你是 Equality'), 'S1 包含身份声明')
  ok(s1.includes('{{NOW}}'), 'S1 时间已规范化')
  ok(s1.includes('{{PLATFORM}}'), 'S1 平台已规范化')
  ok(!s1.includes('工作目录:'), 'S1 无工作目录')
  ok(!s1.includes('用户指定 Skill'), 'S1 无 activeSkill')

  const s2 = generated['S2']
  ok(s2.includes('工作目录:'), 'S2 包含工作目录')

  const s3 = generated['S3']
  ok(s3.includes('test-coding'), 'S3 包含 skill-1 名称')
  ok(s3.includes('git-workflow'), 'S3 包含 skill-2 名称')

  const s4 = generated['S4']
  ok(s4.includes('用户指定 Skill：test-coding'), 'S4 包含 activeSkill 名称')
  ok(s4.includes('严格按照以下 Skill 的步骤执行'), 'S4 包含 activeSkill 指令')

  const s5 = generated['S5']
  ok(s5.includes('工作目录:'), 'S5 包含工作目录')
  ok(s5.includes('test-coding'), 'S5 包含 skill 名称')
  ok(s5.includes('用户指定 Skill'), 'S5 包含 activeSkill')
  ok(s5.includes('gpt-5.2'), 'S5 包含 modelName')

  const s6 = generated['S6']
  ok(s6.includes('你是 Equality'), 'S6 包含身份声明')
  ok(!s6.includes('工作目录:'), 'S6 无工作目录')

  const s7 = generated['S7']
  ok(s7.includes('用户指定 Skills（共 2 个）'), 'S7 包含多 Skill 标题')
  ok(s7.includes('使用顺序'), 'S7 包含编排指引')
  ok(s7.includes('Skill 1：test-coding'), 'S7 包含 Skill 1 名称')
  ok(s7.includes('Skill 2：git-workflow'), 'S7 包含 Skill 2 名称')
  ok(!s7.includes('严格按照以下 Skill'), 'S7 多 Skill 不使用严格模式')

  // 3. 快照对比
  console.log('\n── 快照对比 ──')

  const existing = loadSnapshot()

  if (UPDATE_MODE || !existing) {
    // 首次运行或 --update：保存快照
    saveSnapshot(generated)
    const reason = existing ? '快照已更新' : '首次运行，快照已生成'
    console.log(`  📸 ${reason} → ${SNAPSHOT_FILE}`)
    for (const s of SCENARIOS) {
      ok(true, `${s.id} (${s.label}): ${reason}`)
    }
  } else {
    // 对比模式
    for (const s of SCENARIOS) {
      const expected = existing[s.id]
      const actual = generated[s.id]

      if (!expected) {
        ok(false, `${s.id} (${s.label}): 快照中无此场景，请 --update`)
        continue
      }

      if (actual === expected) {
        ok(true, `${s.id} (${s.label}): 快照匹配`)
      } else {
        // 找第一处差异
        const lines1 = expected.split('\n')
        const lines2 = actual.split('\n')
        let diffLine = -1
        for (let i = 0; i < Math.max(lines1.length, lines2.length); i++) {
          if (lines1[i] !== lines2[i]) { diffLine = i + 1; break }
        }
        ok(false, `${s.id} (${s.label}): 快照不匹配（首个差异在第 ${diffLine} 行）`)
        console.error(`    期望: ${(lines1[diffLine - 1] ?? '(EOF)').slice(0, 80)}`)
        console.error(`    实际: ${(lines2[diffLine - 1] ?? '(EOF)').slice(0, 80)}`)
      }
    }
  }

  // ─── 汇总 ──────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`Phase F2 — System Prompt Snapshot: ${passed} passed, ${failed} failed`)
  console.log(`${'═'.repeat(60)}`)
  if (failed > 0) process.exit(1)
}

run()
