# Design: Multi-Skill @ 选取 — 技术设计

## 架构概览

```
用户输入 @skill-a @skill-b → Chat.tsx 追加到 skillTags[]
                                    ↓
                              chip 区显示多个绿色 chip
                                    ↓
                              handleSend 构建前缀 [@skill-a,@skill-b]
                                    ↓
                              Core index.ts 解析多个 skill 名
                                    ↓
                              runner.ts 查找多个 Skill 对象
                                    ↓
                              buildSystemPrompt({ activeSkills: [...] })
                                    ↓
                              prompt 注入所有 Skill body + 编排指引
                                    ↓
                              LLM 自主决定使用顺序和取舍
```

---

## 1. Desktop 前端改动

### 1.1 Chat.tsx 状态变更

```typescript
// Before:
const [skillTag, setSkillTag] = useState<string | null>(null)

// After:
const [skillTags, setSkillTags] = useState<string[]>([])
```

所有引用 `skillTag` 的位置需要替换为 `skillTags`。

### 1.2 handleMentionSelect 逻辑

```typescript
// Before:
if (mentionState.type === 'skill') {
  setSkillTag(name)
}

// After:
if (mentionState.type === 'skill') {
  setSkillTags(prev => prev.includes(name) ? prev : [...prev, name])
}
```

与 toolTags 的追加逻辑完全一致。

### 1.3 消息前缀构建（handleSend）

```typescript
// Before:
if (skillTag) prefixParts.push(`[@${skillTag}]`)

// After:
if (skillTags.length > 0) prefixParts.push(`[${skillTags.map(s => '@' + s).join(',')}]`)
```

单 Skill 时结果为 `[@openspec]`，多 Skill 时为 `[@openspec,@git]`，格式向后兼容。

### 1.4 Chip 渲染

```tsx
// Before:
{skillTag && (
  <span className="mention-chip mention-chip-skill">
    🧩 {skillTag}
    <button onClick={() => setSkillTag(null)}>✕</button>
  </span>
)}

// After:
{skillTags.map(s => (
  <span key={s} className="mention-chip mention-chip-skill">
    🧩 {s}
    <button onClick={() => setSkillTags(prev => prev.filter(x => x !== s))}>✕</button>
  </span>
))}
```

### 1.5 发送后重置

```typescript
// Before:
setSkillTag(null)

// After:
setSkillTags([])
```

### 1.6 超过 3 个 Skill 提示

当 `skillTags.length > 3` 时，在 chip 区域末尾追加一个警告提示：

```tsx
{skillTags.length > 3 && (
  <span className="mention-chip-warning">⚠ 已选 {skillTags.length} 个 Skill，可能影响响应质量</span>
)}
```

---

## 2. Core 后端改动

### 2.1 index.ts 正则解析

```typescript
// Before:
const skillMatch = message.match(/^\[@([a-zA-Z0-9_-]+)\]\s*/)
const activeSkillName = skillMatch?.[1]

// After:
const skillMatch = message.match(/^\[(@[a-zA-Z0-9_-]+(?:,@[a-zA-Z0-9_-]+)*)\]\s*/)
const activeSkillNames = skillMatch
  ? skillMatch[1].split(',').map(s => s.replace(/^@/, '').trim()).filter(Boolean)
  : undefined
```

单 Skill `[@openspec]` 和多 Skill `[@openspec,@git]` 都能正确解析。

### 2.2 runner.ts 多 Skill 查找

```typescript
// Before:
activeSkillName?: string
// ...
const activeSkill = params.activeSkillName && params.skills
  ? params.skills.find(s => s.name === params.activeSkillName)
  : undefined

// After:
activeSkillNames?: string[]
// ...
const activeSkills = params.activeSkillNames?.length && params.skills
  ? params.activeSkillNames
      .map(name => params.skills!.find(s => s.name === name))
      .filter((s): s is Skill => s !== undefined)
  : undefined
```

不存在的 Skill 名会被 `.filter()` 静默忽略。

### 2.3 system-prompt.ts 多 Skill 注入

```typescript
// Before:
activeSkill?: Skill

// After:
activeSkills?: Skill[]
```

注入逻辑：

```typescript
if (options?.activeSkills?.length) {
  const skills = options.activeSkills
  if (skills.length === 1) {
    // 单 Skill：保持原有严格模式
    const sk = skills[0]
    prompt += `\n
## 🎯 用户指定 Skill：${sk.name}

用户通过 @ 明确指定了本次使用此 Skill，请**严格按照以下 Skill 的步骤执行**，不要跳过：

${sk.body}

---
`
  } else {
    // 多 Skill：给 Agent 编排自由度
    prompt += `\n
## 🎯 用户指定 Skills（共 ${skills.length} 个）

用户通过 @ 指定了以下 Skills，请根据当前任务的实际需要自行决定：
- **使用顺序**：先用哪个、后用哪个
- **是否全部使用**：某个 Skill 与当前任务无关时可跳过
- **组合使用**：一个 Skill 的输出可作为另一个的输入

执行时在回复中说明"正在使用 Skill: xxx"。

`
    skills.forEach((sk, i) => {
      prompt += `### Skill ${i + 1}：${sk.name}\n\n${sk.body}\n\n---\n\n`
    })
  }
}
```

**设计决策**：
- 单 Skill 保持 "严格按步骤执行"（向后兼容）
- 多 Skill 改为 "根据任务需要自行决定"（赋予编排自由度）
- 这是因为多 Skill 场景下，用户的意图是"我需要这几个能力"，而非"按这个顺序执行"

### 2.4 context-engine.ts 透传

`DefaultContextEngine.assemble()` 中 `activeSkill` 参数也需要改为 `activeSkills`，透传给 `buildSystemPrompt`。

---

## 3. 数据流完整路径

```
1. 用户在 Chat.tsx 选择 @openspec + @git
   skillTags = ['openspec', 'git']

2. 发送消息 → handleSend 构建：
   "[@openspec,@git] 帮我写规格并提交到仓库"

3. Core index.ts 接收消息，正则解析：
   activeSkillNames = ['openspec', 'git']

4. runAttempt 接收 activeSkillNames，查找 Skill 对象：
   activeSkills = [Skill{name:'openspec',body:'...'}, Skill{name:'git',body:'...'}]

5. buildSystemPrompt({ activeSkills }) 注入 prompt：
   "## 🎯 用户指定 Skills（共 2 个）
    ...编排指引...
    ### Skill 1：openspec
    ...body...
    ### Skill 2：git
    ...body..."

6. LLM 收到 prompt + 用户消息，自主决定：
   "先用 openspec 的步骤写规格，再用 git 的步骤提交"
```

---

## 4. 兼容性

| 场景 | Before | After | 是否兼容 |
|------|--------|-------|---------|
| 零 Skill | 无注入 | 无注入 | ✅ |
| 单 Skill `[@openspec]` | 注入 activeSkill | 注入 activeSkills[0]，严格模式 | ✅ |
| 多 Skill `[@a,@b]` | 不支持 | 注入 activeSkills，编排模式 | 新功能 |
| `[@a] [#bash]` | a 为 activeSkill + bash 过滤 | a 为 activeSkills[0] + bash 过滤 | ✅ |

---

## 5. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/desktop/src/Chat.tsx` | 修改 | `skillTag→skillTags`，约 8 处引用替换 |
| `packages/core/src/index.ts` | 修改 | 正则 + 变量名（2 处）|
| `packages/core/src/agent/runner.ts` | 修改 | 参数 + 查找逻辑（3 处）|
| `packages/core/src/agent/system-prompt.ts` | 修改 | 接口 + 注入逻辑（约 20 行）|
| `packages/core/src/agent/context-engine.ts` | 修改 | 透传参数（1 处）|
| `packages/core/src/__tests__/__snapshots__/*.json` | 更新 | 快照自动更新 |

---
