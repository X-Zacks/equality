/**
 * __tests__/phase-O3.test.ts — Phase O3: 技能增强
 *
 * O3.1: system prompt 包含 4 段技能指引（6 断言）
 *
 * 共计 6 断言
 */

import { strict as assert } from 'node:assert'

import { buildSystemPrompt } from '../agent/system-prompt.js'
import type { Skill } from '../skills/types.js'

function makeTestSkill(name: string): Skill {
  return {
    name,
    description: `A test skill: ${name}. Use when: testing. NOT for: production.`,
    filePath: `C:\\test\\skills\\${name}\\SKILL.md`,
    baseDir: `C:\\test\\skills\\${name}`,
    body: `# ${name}\n\n1. Do something`,
    metadata: {
      name,
      description: `A test skill: ${name}. Use when: testing. NOT for: production.`,
    },
  }
}

// O3.1-T1: 技能匹配指引
function testO3SkillMatching() {
  const prompt = buildSystemPrompt({
    skills: [makeTestSkill('test-skill')],
  })

  // 匹配指引
  assert.ok(prompt.includes('技能匹配'), 'O3.1-T1a: system prompt contains 技能匹配 section')
  // 引用指引
  assert.ok(prompt.includes('技能引用'), 'O3.1-T1b: system prompt contains 技能引用 section')

  console.log('  ✅ O3.1-T1: 技能匹配+引用指引 (2 assertions)')
}

// O3.1-T2: 技能沉淀指引
function testO3SkillCreation() {
  const prompt = buildSystemPrompt()

  // 沉淀指引
  assert.ok(prompt.includes('技能沉淀'), 'O3.1-T2a: system prompt contains 技能沉淀 section')
  assert.ok(prompt.includes('5 个或更多工具调用') || prompt.includes('5个或更多工具调用'),
    'O3.1-T2b: skill creation threshold mentions 5+ tool calls')

  console.log('  ✅ O3.1-T2: 技能沉淀指引 (2 assertions)')
}

// O3.1-T3: 技能 Patch 指引
function testO3SkillPatch() {
  const prompt = buildSystemPrompt()

  assert.ok(prompt.includes('技能 Patch') || prompt.includes('Patch'),
    'O3.1-T3a: system prompt contains Patch section')
  assert.ok(prompt.includes('更新已有 Skill'),
    'O3.1-T3b: patch guidance says update existing skill')

  console.log('  ✅ O3.1-T3: 技能 Patch 指引 (2 assertions)')
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🧪 Phase O3: 技能增强\n')

  console.log('── O3.1: system prompt 增强 ──')
  testO3SkillMatching()
  testO3SkillCreation()
  testO3SkillPatch()

  console.log('\n✅ Phase O3 全部通过 (6 assertions)\n')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
