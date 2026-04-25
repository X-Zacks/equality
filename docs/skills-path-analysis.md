# Skills 存储路径混乱问题分析

> 分析日期：2026-04-25

## 一、问题现象

用户在 Equality 对话中创建 Skill（通过 `@skill-creator`），Skill 被保存到了 workspace 的 `.equality/skills/` 目录（如 `C:\software\workspace-equality\.equality\skills\`），而非 equality 工程目录的 `packages/core/skills/`。

---

## 二、根因分析

### 涉及的 4 个模块

| 模块 | 文件 | 作用 |
|------|------|------|
| System Prompt | `agent/system-prompt.ts` L39, L362 | 告诉 Agent 把 skill 存到哪里 |
| Path Guard（沙箱） | `tools/builtins/path-guard.ts` | 限制 write_file 只能写 workspaceDir 内 |
| Skills Loader | `skills/loader.ts` | 6 级优先级加载 |
| Skills Sync | `skills/sync.ts` | 从 bundled 单向同步到 workspace |

### 链路图

```
用户说 "把这个做成 skill"
  → Agent 激活 @skill-creator
  → System Prompt 指示：保存到 getBundledSkillsDir() = "packages/core/skills/"
  → Agent 调用 write_file("packages/core/skills/xxx/SKILL.md", ...)
  → path-guard 沙箱检查：
      workspaceDir = "C:\software\workspace-equality"
      目标路径 = "C:\software\equality\packages\core\skills\xxx\SKILL.md"
      ❌ 目标不在 workspaceDir 内 → 被沙箱拒绝
  → Agent 重试，改写到 workspaceDir 下
  → 最终写入 "C:\software\workspace-equality\.equality\skills\xxx\SKILL.md"
```

### 根因 #1：System Prompt 指向了错误的目录

```typescript
// system-prompt.ts L39
const skillsDir = getBundledSkillsDir().replace(/\\/g, '/')

// system-prompt.ts L362
保存方法：用 write_file 在 ${skillsDir}/<skill-name>/SKILL.md 创建文件
```

`getBundledSkillsDir()` 返回的是**内置 skill 源码目录**（开发模式下是 `packages/core/skills/`），这个目录：
- 开发模式下：是 git 仓库中的源码，写入会弄脏仓库
- 生产 SEA 模式下：可能是只读目录（exe 同级）
- **任何模式下**：都不在 workspaceDir 内，会被沙箱拦截

### 根因 #2：缺少明确的"用户创建 skill 应保存到哪里"的设计

当前有 3 个 skill 写入目标，但职责不清：

| 目录 | 变量/路径 | 设计意图 | 实际使用 |
|------|-----------|----------|----------|
| `bundled` | `getBundledSkillsDir()` = `packages/core/skills/` | **只读**，系统内置 skill | ❌ System prompt 错误指向这里作为写入目标 |
| `managed` | `getManagedSkillsDir()` = `%APPDATA%/Equality/skills/` | Gallery 安装的 skill | ✅ gallery.ts 正确使用 |
| `synced-bundled` | `<workspaceDir>/.equality/skills/` | sync.ts 同步的副本 | ❌ 被 Agent 误当成创建目标 |

### 根因 #3：Sync 设计是单向的，不覆盖用户创建场景

spec 设计（`subtask-rename-skills-sync/design.md`）中的 sync 方向：

```
bundled (packages/core/skills/) ──→ synced-bundled (<workspaceDir>/.equality/skills/)
               源                              目标（只读副本）
```

**完全没有考虑用户创建 skill 的场景**。用户创建的 skill 不是 bundled，不应该进入 synced-bundled 目录。

---

## 三、6 级加载顺序回顾

```typescript
// loader.ts — SKILLS_LOAD_ORDER（低优先级 → 高优先级）
1. extra           → （配置的额外目录）
2. bundled         → getBundledSkillsDir()          // 系统内置
3. synced-bundled  → <workspaceDir>/.equality/skills/  // bundled 的同步副本
4. managed         → %APPDATA%/Equality/skills/       // Gallery 安装
5. personal-agents → ~/.agents/skills/                 // 个人全局
6. project-agents  → <workspaceDir>/.agents/skills/    // 项目级
7. workspace       → <workspaceDir>/skills/            // 工作区根
```

高优先级覆盖低优先级（同名 skill 后加载的替换先加载的）。

---

## 四、正确的设计应该是什么？

### 用户创建 Skill 的保存位置

| 场景 | 应保存到 | 原因 |
|------|----------|------|
| 用户说"创建 skill" | `managed` = `%APPDATA%/Equality/skills/` | 跨 workspace 可用，不受沙箱限制（AppData 对 write_file 应放行），不污染任何 git 仓库 |
| 用户说"创建 skill 给这个项目用" | `project-agents` = `<workspaceDir>/.agents/skills/` | 项目级别，可 commit 到 git |
| Gallery 安装 | `managed` = `%APPDATA%/Equality/skills/` | ✅ 已正确实现 |
| Bundled sync | `synced-bundled` = `<workspaceDir>/.equality/skills/` | ✅ 已正确实现 |

### 推荐方案：System Prompt 改为指向 managed 目录

```typescript
// system-prompt.ts — 修改
const managedSkillsDir = getManagedSkillsDir().replace(/\\/g, '/')

// prompt 中改为：
保存方法：用 write_file 在 ${managedSkillsDir}/<skill-name>/SKILL.md 创建文件
```

**同时**需要修改 `path-guard.ts`，将 `%APPDATA%/Equality/` 加入白名单（当前只允许 workspaceDir 和 tmpDir）。

---

## 五、需要修改的文件

| 文件 | 改动 |
|------|------|
| `agent/system-prompt.ts` | `skillsDir` 改用 `getManagedSkillsDir()` 作为 skill 创建目标 |
| `tools/builtins/path-guard.ts` | 添加 `%APPDATA%/Equality/` 白名单（与 tmpDir 同级待遇） |
| `skills/skill-creator/SKILL.md` | 如果其中有路径指引，也需对齐 |

### 可选改进

| 改动 | 优先级 | 说明 |
|------|--------|------|
| 支持 `--project` 参数创建项目级 skill | P2 | 写入 `<workspaceDir>/.agents/skills/` |
| synced-bundled 目录标记为只读 | P3 | 防止用户误编辑同步副本 |
| skill-creator Skill 增加保存位置选择 | P2 | "这个 skill 是所有项目通用还是只给当前项目用？" |

---

## 六、与 Spec 的对比

| Spec 文档 | 相关内容 | 是否冲突 |
|-----------|----------|----------|
| `subtask-rename-skills-sync/design.md` | sync: bundled → synced-bundled（单向） | ✅ 不冲突，sync 设计正确 |
| `subtask-rename-skills-sync/design.md` | 加载优先级 | ✅ 不冲突，7 级加载正确 |
| `skills/skills-v2-spec.md` | 未提及 skill 创建的保存位置 | ⚠️ 缺失 — 需补充 |
| `system-prompt.ts` 代码 | `skillsDir = getBundledSkillsDir()` 用于写入 | ❌ 冲突 — bundled 是只读源，不应作为写入目标 |

**结论**：Spec 本身没有错，问题是代码实现时把 `bundled`（只读源）当成了 skill 的写入目标。应该用 `managed`。

---

## 七、与同类项目的横向对比

### 7.1 OpenClaw（example/openclaw-2026.3.31）

OpenClaw 是 Equality 参考设计最多的项目，其 Skills 存储设计如下：

#### 目录结构（6 层加载，优先级从低到高）

```
extra           → config.skills.load.extraDirs（用户自定义额外目录）
bundled         → <exe同级>/skills/  或  <pkg根>/skills/   （env: OPENCLAW_BUNDLED_SKILLS_DIR）
openclaw-managed → CONFIG_DIR/skills/ = ~/.openclaw/skills/
agents-personal  → ~/.agents/skills/
agents-project   → <workspaceDir>/.agents/skills/
workspace        → <workspaceDir>/skills/
```

`CONFIG_DIR` 定义（`src/utils.ts`）：
```typescript
// 优先读取 OPENCLAW_STATE_DIR 环境变量，否则用 ~/.openclaw
export const CONFIG_DIR = path.join(homedir(), ".openclaw")  // 可被 OPENCLAW_STATE_DIR 覆盖
```

#### skill-creator 如何指导 Agent 创建 Skill

OpenClaw 的 `skills/skill-creator/SKILL.md` 明确指定使用 **脚本** 来初始化 skill，而不是直接写文件：

```bash
# 始终通过 init_skill.py 脚本创建，脚本指定 --path 输出目录
scripts/init_skill.py <skill-name> --path skills/public
```

输出目录 `skills/public` 在 OpenClaw 仓库中是**已提交到 git 的公开 skill 目录**（与 `skills/` 同级），即 **用户创建的 skill 始终进入 git 仓库**，而不是 `~/.openclaw/skills/`。

这是 OpenClaw 与 Equality 设计的核心差异：

| 维度 | OpenClaw | Equality（期望设计）|
|------|----------|---------------------|
| 用户创建 skill 的目标 | `<仓库>/skills/public/`（进 git） | `%APPDATA%/Equality/skills/`（跨 workspace 漫游）|
| Agent 创建工具 | `scripts/init_skill.py` 脚本（deterministic） | `write_file` 工具 |
| 沙箱限制 | 无（仓库目录本身就是 workspaceDir） | `path-guard.ts` 只允许 workspaceDir 内 |
| 配置目录格式 | `~/.openclaw/`（Linux/macOS 风格） | `%APPDATA%/Equality/`（Windows 优先） |

OpenClaw 的方案简单粗暴：直接写仓库，任何人都能 commit → PR。这符合 OpenClaw 的开源生态定位，但不适合 Equality（用户的私人 skill 不应该进 git）。

---

### 7.2 Hermes-Agent（example/hermes-agent）

Hermes-Agent 是 Python 编写的命令行 AI Agent，其 Skills 设计如下：

#### 目录结构（2 层 + 可扩展）

```python
# hermes_constants.py
def get_hermes_home() -> Path:
    return Path(os.getenv("HERMES_HOME", Path.home() / ".hermes"))

# skill_utils.py
def get_all_skills_dirs() -> List[Path]:
    dirs = [get_hermes_home() / "skills"]          # 主目录：~/.hermes/skills/
    dirs.extend(get_external_skills_dirs())          # 可扩展：config.yaml 中 skills.external_dirs
    return dirs
```

内置 skill 在仓库的 `skills/` 目录（分类组织，如 `skills/software-development/`），随安装包分发；用户自定义 skill 写入 `~/.hermes/skills/`。

#### Hermes-Agent 的 Skill 格式

Hermes SKILL.md 支持更丰富的 frontmatter：

```yaml
---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks.
version: 1.1.0
author: Hermes Agent (adapted from obra/superpowers)
license: MIT
metadata:
  hermes:
    tags: [delegation, subagent, implementation, workflow, parallel]
    related_skills: [writing-plans, requesting-code-review]
---
```

比 OpenClaw 多了 `version`、`author`、`license`、`metadata.hermes.tags` 等字段，并支持**平台过滤**（`platforms: [macos]`）和**工具集条件激活**（`requires_toolsets`）。

#### skill 创建位置

Hermes-Agent 文档/脚本中没有 skill-creator 这类 Agent 自动创建 skill 的机制——用户通过 CLI 手动管理，写入 `~/.hermes/skills/`。

---

### 7.3 三方横向对比总结

| 维度 | OpenClaw | Hermes-Agent | Equality（当前 Bug） | Equality（期望）|
|------|----------|--------------|---------------------|----------------|
| 内置 Skill 位置 | `<pkg根>/skills/` | `<pkg根>/skills/` | `packages/core/skills/` | `packages/core/skills/` ✅ |
| 用户创建 Skill 位置 | `<仓库>/skills/public/`（进 git）| `~/.hermes/skills/` | `<workspaceDir>/.equality/skills/`（被沙箱逼的）| `%APPDATA%/Equality/skills/` |
| 全局用户 Skill 目录 | `~/.openclaw/skills/` | `~/.hermes/skills/` | `%APPDATA%/Equality/skills/`（managed，未使用）| `%APPDATA%/Equality/skills/` ✅ |
| 项目级 Skill | `<workspaceDir>/.agents/skills/` | `skills.external_dirs` | `<workspaceDir>/.agents/skills/` | `<workspaceDir>/.agents/skills/` ✅ |
| Agent 创建 Skill 工具 | `init_skill.py` 脚本 | 无 | `write_file`（被沙箱拦） | `write_file`（需放行 AppData）|
| Skill 文件格式 | `name` + `description`（简洁） | 含 version/author/tags（丰富） | `name` + `description`（简洁） | 同左 |
| 配置目录 | `~/.openclaw/`（可覆盖） | `~/.hermes/`（可覆盖） | `%APPDATA%/Equality/` | 同左 ✅ |

**关键结论**：

1. **OpenClaw 和 Hermes-Agent 都有明确的"用户 skill 目录"**（`~/.openclaw/skills/` 和 `~/.hermes/skills/`），且与内置 skill 目录完全隔离。Equality 有同等设计（`%APPDATA%/Equality/skills/`），但 system-prompt 错误地把 Agent 创建目标指向了内置目录。

2. **OpenClaw 用脚本创建 skill** 规避了沙箱问题；Equality 用 `write_file` 工具直接写，必须通过 path-guard 放行目标目录。

3. **Hermes-Agent 的 frontmatter 格式值得参考**：`version`、`tags`、`platforms` 等字段让 skill 管理更灵活——Equality 未来可以扩展。
