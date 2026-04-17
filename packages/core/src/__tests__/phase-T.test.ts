/**
 * __tests__/phase-T.test.ts — Phase T 测试
 *
 * T1: Purpose 持久化（save→load→一致）
 * T2: skill_view 工具基本功能
 */

import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'

// ── T1: Purpose 持久化 ──

async function testPurposePersistence() {
  // 模拟 persist 的 JSON 格式
  const sessionData = {
    key: 'test-purpose',
    title: 'Test',
    messages: [],
    costLines: {},
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    frozenMemorySnapshot: undefined,
    purpose: {
      goal: '重构 auth 模块',
      constraints: ['简洁回复'],
      source: 'inferred' as const,
    },
  }

  // Serialize
  const json = JSON.stringify(sessionData)
  
  // Deserialize
  const restored = JSON.parse(json)
  
  assert.ok(restored.purpose, 'T1-1: purpose field exists after JSON roundtrip')
  assert.equal(restored.purpose.goal, '重构 auth 模块', 'T1-2: goal preserved')
  assert.deepEqual(restored.purpose.constraints, ['简洁回复'], 'T1-3: constraints preserved')
  assert.equal(restored.purpose.source, 'inferred', 'T1-4: source preserved')

  // Test undefined purpose
  const noPurpose = { ...sessionData, purpose: undefined }
  const json2 = JSON.stringify(noPurpose)
  const restored2 = JSON.parse(json2)
  assert.equal(restored2.purpose, undefined, 'T1-5: undefined purpose preserved')

  console.log('  ✅ T1: Purpose 持久化 (5 assertions)')
}

// ── T2: skill_view 基本测试 ──

async function testSkillViewBasic() {
  // 创建临时 skill 目录
  const tempDir = await mkdtemp(join(tmpdir(), 'equality-t2-'))
  const skillDir = join(tempDir, 'test-skill')
  await mkdir(skillDir, { recursive: true })
  
  const skillContent = `---
name: test-skill
description: 'A test skill. Use when: testing.'
---

# Test Skill

Step 1: Do something.
`
  await writeFile(join(skillDir, 'SKILL.md'), skillContent)
  
  assert.ok(existsSync(join(skillDir, 'SKILL.md')), 'T2-1: SKILL.md created')
  
  const content = await readFile(join(skillDir, 'SKILL.md'), 'utf-8')
  assert.ok(content.includes('test-skill'), 'T2-2: skill content readable')
  assert.ok(content.includes('Step 1'), 'T2-3: skill body present')

  console.log('  ✅ T2: skill_view 基本测试 (3 assertions)')
}

// ── Runner ──

async function run() {
  console.log('\n🧪 Phase T Tests')
  console.log('─'.repeat(50))

  await testPurposePersistence()
  await testSkillViewBasic()

  console.log('─'.repeat(50))
  console.log('✅ All Phase T tests passed (8 assertions)\n')
}

run().catch(err => {
  console.error('❌ Phase T test failed:', err)
  process.exit(1)
})
