# Design: 修复 Skills 路径 & 增强 Frontmatter

## Part A：Skills 路径修复

### A1. system-prompt.ts 改动

**当前**（L39）：
```typescript
const skillsDir = getBundledSkillsDir().replace(/\\/g, '/')
```

**改为**：
```typescript
const managedSkillsDir = getManagedSkillsDir().replace(/\\/g, '/')
```

**Prompt 文本**（L362 区域）中所有 `${skillsDir}` 引用改为 `${managedSkillsDir}`。

### A2. path-guard.ts 改动

在 tmpDir 白名单之后，新增 AppData/Equality 白名单：

```typescript
// 3) AppData/Equality 目录 → 允许（managed skills、配置等）
const appDataDir = norm(path.join(
  process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
  'Equality'
))
if (normalizedReal === appDataDir || normalizedReal.startsWith(appDataDir + '/')) {
  return { absPath }
}
```

### A3. skill-creator/SKILL.md

无需改动——skill-creator 中没有硬编码路径，它引导的是 Agent 行为，而路径由 system-prompt 控制。

### A4. 影响分析

| 场景 | 修改前 | 修改后 |
|------|--------|--------|
| Agent 创建 Skill | ❌ 被沙箱拦截 → 落入 synced-bundled | ✅ 写入 `%APPDATA%/Equality/skills/` |
| Agent 读取 AppData Skill | ❌ 被沙箱拦截 | ✅ path-guard 放行 |
| Gallery 安装 Skill | ✅ 不受影响（直接 fs 操作不经 path-guard）| ✅ 不变 |
| workspace skills 读写 | ✅ 不变 | ✅ 不变 |
| bundled sync | ✅ 不变 | ✅ 不变 |

---

## Part B：增强 Frontmatter

### B1. 新增字段（全部可选，向后兼容）

```typescript
// types.ts SkillMetadata 新增字段
interface SkillMetadata {
  // ...existing fields...
  
  /** Skill 版本号（semver 格式） */
  version?: string
  /** 分类标签（自由格式，用于搜索和过滤） */
  tags?: string[]
  /** 作者信息 */
  author?: string
  /** 支持的平台列表（空 = 全平台） */
  platforms?: Array<'windows' | 'macos' | 'linux'>
}
```

### B2. frontmatter.ts 解析逻辑

在 `parseSkillFile` 中添加新字段提取：

```typescript
version: typeof meta.version === 'string' ? meta.version : undefined,
tags: asStringArray(meta.tags),
author: typeof meta.author === 'string' ? meta.author : undefined,
platforms: asStringArray(meta.platforms)?.filter(
  p => ['windows', 'macos', 'linux'].includes(p)
) as SkillMetadata['platforms'],
```

### B3. 平台过滤（loader.ts）

在 `loadAllSkills` 扫描后，增加平台过滤：

```typescript
// 平台过滤：只加载兼容当前平台的 Skill
const currentPlatform = process.platform === 'win32' ? 'windows'
  : process.platform === 'darwin' ? 'macos' : 'linux'

for (const entry of result) {
  const platforms = entry.skill.metadata.platforms
  if (platforms && platforms.length > 0 && !platforms.includes(currentPlatform)) {
    entry.blocked = true  // 复用已有的 blocked 机制
  }
}
```

### B4. skill-creator SKILL.md 模板更新

在 Step 3 的 frontmatter 模板中添加可选字段说明：

```yaml
name: skill-name
description: '...'
version: '1.0.0'                   # 可选：语义版本号
tags: [workflow, automation]        # 可选：分类标签
author: 'username'                  # 可选：作者
platforms: [windows, macos, linux]  # 可选：限定平台（省略=全平台）
```

### B5. system-prompt.ts 中的 frontmatter 模板更新

在 Crew 模式 Skill 沉淀提示中，添加新字段到模板。
