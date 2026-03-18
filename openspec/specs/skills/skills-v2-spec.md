# Skills V2 Specification

> 描述 Skills 系统的增强能力：安全扫描、文件监控热更新、状态报告与依赖检测、Skill Creator 内置 Skill。  
> 前置依赖：[skills/spec.md](spec.md)（Skills V1：文件格式、加载优先级、System Prompt 注入、自动沉淀）  
> 参考来源：OpenClaw `example/src/agents/skills/`, `example/src/security/skill-scanner.ts`

---

## Requirements

### Requirement: Skill 安全扫描

当 Skill 目录中包含脚本文件时，系统 MUST 在首次加载前进行安全扫描。

**可扫描文件类型：** `.py` `.js` `.ts` `.mjs` `.cjs` `.sh` `.ps1` `.bat` `.cmd`

**扫描规则：**

| 规则 ID | 级别 | 触发条件 | 说明 |
|---------|------|---------|------|
| `dangerous-exec` | critical | Python: `subprocess.call`/`Popen`/`os.system`; JS: `child_process.exec`/`spawn` | 未受控的 shell 执行 |
| `dynamic-code` | critical | `eval()` / `exec()` / `new Function()` | 动态代码执行 |
| `env-harvesting` | critical | `os.environ`/`process.env` + HTTP 请求 | 凭证窃取 |
| `crypto-mining` | critical | `stratum+tcp` / `xmrig` / `coinhive` | 挖矿行为 |
| `data-exfiltration` | warn | 文件读取 + HTTP 请求组合 | 可能的数据外泄 |
| `obfuscated-code` | warn | 大段 hex/base64 编码（≥200 字符）| 代码混淆 |
| `suspicious-network` | warn | 非标准端口的 WebSocket/HTTP | 可疑网络连接 |
| `powershell-bypass` | warn | `-ExecutionPolicy Bypass` / `Set-ExecutionPolicy` | Windows 安全策略绕过 |

**扫描结果类型：**

```typescript
type SkillScanSeverity = 'info' | 'warn' | 'critical'

interface SkillScanFinding {
  ruleId: string
  severity: SkillScanSeverity
  file: string           // 相对于 Skill 目录的路径
  line: number
  message: string
  evidence: string       // 触发行内容（截断至 120 字符）
}

interface SkillScanSummary {
  scannedFiles: number
  critical: number
  warn: number
  info: number
  findings: SkillScanFinding[]
}
```

**行为规则：**
- `critical` 级发现 → 该 Skill MUST 标记为 `blocked: true`，不注入 System Prompt
- `warn` 级发现 → Skill 正常加载，日志输出警告
- `info` 级 → 仅记录日志
- 扫描结果 MUST 按 `filePath + mtime + size` 三元组缓存，避免重复扫描
- 缓存上限：5000 条文件级记录

#### Scenario: 检测到恶意 Skill

- GIVEN 用户在 `~/.agents/skills/evil-tool/scripts/run.js` 中写了 `eval(atob('...'))`
- WHEN Skills 加载器扫描该目录
- THEN 检测到 `dynamic-code` (critical) + `obfuscated-code` (warn)
- AND 该 Skill 标记为 `blocked: true`
- AND 日志输出：`[skills/security] ⚠️ Skill "evil-tool" blocked: dynamic-code in scripts/run.js:42`
- AND System Prompt 不包含该 Skill 的索引条目

#### Scenario: 安全 Skill 正常加载

- GIVEN Skill `python` 的 `scripts/` 目录中只有普通 Python 脚本（无 eval、无网络请求）
- WHEN Skills 加载器扫描该目录
- THEN 扫描结果为 0 critical / 0 warn
- AND Skill 正常加载，`blocked: false`

#### Scenario: 手动触发扫描

- GIVEN 用户调用 `POST /skills/:name/scan`
- WHEN 系统对指定 Skill 执行扫描（忽略缓存）
- THEN 返回 `SkillScanSummary` JSON
- AND 如果 critical > 0，该 Skill 立即标记为 `blocked`

---

### Requirement: Skills 文件监控与热更新

系统 MUST 监控所有已注册的 Skills 目录，文件变化后自动重载 Skills 集合。

**监控目标（glob 模式）：**
```
<skillsRoot>/SKILL.md
<skillsRoot>/*/SKILL.md
```

**忽略列表：**
```
/(^|[\\/])\.git([\\/]|$)/
/(^|[\\/])node_modules([\\/]|$)/
/(^|[\\/])dist([\\/]|$)/
/(^|[\\/])__pycache__([\\/]|$)/
/(^|[\\/])\.venv([\\/]|$)/
/(^|[\\/])build([\\/]|$)/
/(^|[\\/])\.cache([\\/]|$)/
```

**防抖策略：**
- 默认防抖 5000ms（`skills.watch.debounceMs` 可配置）
- 多次变更合并为一次重载

**版本控制：**

```typescript
interface SkillsChangeEvent {
  version: number          // 递增版本号（Date.now() 或 +1）
  reason: 'watch' | 'manual' | 'api'
  changedPath?: string     // 触发变更的文件路径
}
```

**生命周期：**
1. Gateway 启动时 MUST 调用 `ensureSkillsWatcher(workspaceDir)` 初始化监控
2. Watcher 监听 `add` / `change` / `unlink` 事件
3. 防抖后触发 `bumpSkillsVersion()` → 通知所有注册的 listeners
4. 下一次 `runAttempt` MUST 使用新的 Skills 集合
5. 当前正在运行的 `runAttempt` 不受影响（使用启动时的快照）
6. Gateway 关闭时 MUST 调用 `closeSkillsWatcher()` 释放文件描述符

#### Scenario: 编辑 Skill 文件自动重载

- GIVEN Equality 正在运行，已加载 8 个 Skills
- WHEN 用户编辑 `packages/core/skills/python/SKILL.md` 并保存
- THEN 5 秒后 watcher 触发重载
- AND 日志输出 `[skills/watch] Reloaded: python/SKILL.md changed (v=1710518400001)`
- AND 下一次对话自动使用更新后的 Python Skill

#### Scenario: 快速连续编辑防抖

- GIVEN 用户在 2 秒内连续保存 3 次 SKILL.md
- WHEN watcher 收到 3 次 change 事件
- THEN 仅在最后一次保存后 5 秒触发 1 次重载（防抖合并）

#### Scenario: 新增 Skill 自动发现

- GIVEN 用户在 `packages/core/skills/` 下新建 `docker/SKILL.md`
- WHEN watcher 检测到 `add` 事件
- THEN 5 秒后自动加载新 Skill
- AND 安全扫描通过后注入下一次对话的 System Prompt

#### Scenario: 优雅关闭

- GIVEN Equality 进程收到退出信号
- WHEN Gateway 执行 shutdown 流程
- THEN `closeSkillsWatcher()` 被调用
- AND chokidar watcher 关闭，文件描述符释放

---

### Requirement: Skill 状态报告与依赖检测

系统 MUST 提供 `GET /skills/status` API，返回每个 Skill 的运行状态和依赖满足情况。

**状态类型定义：**

```typescript
interface SkillStatusEntry {
  name: string
  description: string
  source: SkillSource          // 来自哪个优先级层
  emoji?: string
  filePath: string
  baseDir: string

  // 状态标记
  enabled: boolean             // 是否启用（未被配置禁用）
  eligible: boolean            // 是否满足所有运行条件
  blocked: boolean             // 是否被安全扫描阻止
  always: boolean              // 是否始终注入（always: true）

  // 依赖检测结果
  requirements: {
    bins: Array<{ name: string; found: boolean }>
    env: Array<{ name: string; found: boolean }>
  }
  missing: {
    bins: string[]             // 缺失的命令行工具
    env: string[]              // 缺失的环境变量
  }
}

interface SkillStatusReport {
  total: number
  eligible: number
  blocked: number
  disabled: number
  missingDeps: number          // 有缺失依赖的 Skill 数量
  skills: SkillStatusEntry[]
}
```

**依赖检测机制：**
- `requires.bins` → 调用 `where.exe <bin>` (Windows) 检测系统命令是否存在
- `requires.env` → 检查 `process.env[name]` 是否非空
- 检测结果 SHOULD 缓存 30 秒，避免频繁 spawn 子进程

**eligible 判定逻辑：**
```
eligible = enabled AND NOT blocked AND bins全部found AND env全部found
```

#### Scenario: 查看 Skills 状态

- GIVEN 系统已加载 10 个 Skills
- AND `docker` Skill 依赖 `docker` 命令但本机未安装
- AND `evil-tool` Skill 被安全扫描阻止
- WHEN 调用 `GET /skills/status`
- THEN 返回：
  ```json
  {
    "total": 10,
    "eligible": 8,
    "blocked": 1,
    "disabled": 0,
    "missingDeps": 1,
    "skills": [
      { "name": "python", "eligible": true, "blocked": false, "missing": { "bins": [], "env": [] } },
      { "name": "docker", "eligible": false, "blocked": false, "missing": { "bins": ["docker"], "env": [] } },
      { "name": "evil-tool", "eligible": false, "blocked": true, "missing": { "bins": [], "env": [] } }
    ]
  }
  ```

#### Scenario: bins 依赖检测

- GIVEN Skill `git` 的 frontmatter 中声明 `requires.bins: [git]`
- AND 系统中已安装 git
- WHEN 执行依赖检测
- THEN `requirements.bins` 返回 `[{ name: "git", found: true }]`
- AND `missing.bins` 为空数组
- AND `eligible` 为 true

#### Scenario: 环境变量依赖检测

- GIVEN Skill `openai` 的 frontmatter 中声明 `requires.env: [OPENAI_API_KEY]`
- AND `process.env.OPENAI_API_KEY` 未设置
- WHEN 执行依赖检测
- THEN `requirements.env` 返回 `[{ name: "OPENAI_API_KEY", found: false }]`
- AND `missing.env` 为 `["OPENAI_API_KEY"]`
- AND `eligible` 为 false

---

### Requirement: Skill Creator 内置 Skill

系统 MUST 内置一个 `skill-creator` Skill，用于指导 LLM 创建高质量的 Skill。

该 Skill 的 `SKILL.md` MUST 包含以下内容：

1. **Skill 目录结构规范**
   ```
   skill-name/
   ├── SKILL.md          # 必填：YAML frontmatter + Markdown 正文
   ├── scripts/          # 可选：可执行脚本（.py / .js / .ps1）
   ├── references/       # 可选：参考文档（按需 read_file 加载）
   └── assets/           # 可选：输出资源（模板、图片、字体）
   ```

2. **渐进式披露原则**
   - 元数据（name + description）：始终在上下文中（~100 词）
   - SKILL.md 正文：Skill 触发后加载（< 500 行）
   - 资源文件：按需读取（无上限，脚本可不读入上下文直接执行）

3. **Windows 兼容规则**
   - 脚本用 `.py` 或 `.js`，不要用 `.sh`
   - 不要用 heredoc（`<<EOF`），先 `write_file` 保存再执行
   - 路径用正斜杠 `/` 或 `r"..."` 原始字符串

4. **PRC 镜像规则**
   - pip 安装加 `-i https://pypi.tuna.tsinghua.edu.cn/simple`
   - npm 安装加 `--registry https://registry.npmmirror.com`
   - conda 安装加 `-c https://mirrors.tuna.tsinghua.edu.cn/anaconda`

5. **命名规范**
   - 小写字母 + 数字 + 连字符，≤ 64 字符
   - 动词开头描述动作（如 `excel-diff`、`pdf-rotate`）
   - 目录名与 `name` 字段一致

6. **反面案例**
   - 不要创建 README.md / CHANGELOG.md 等冗余文件
   - 不要在 SKILL.md 中解释 LLM 已知的常识
   - 不要在正文和 references/ 中重复同一信息

#### Scenario: LLM 使用 skill-creator 创建新 Skill

- GIVEN 用户说"帮我创建一个 PDF 旋转的 Skill"
- WHEN LLM 读取 `skill-creator/SKILL.md` 获取创建指南
- THEN LLM 按照规范创建 `pdf-rotate/SKILL.md`，包含正确的 frontmatter 和 scripts/
- AND 脚本模板使用 `.py` 文件（非 heredoc）
- AND pip 安装指令包含清华镜像源

---

### Requirement: Skill 依赖安装器

> 此 Requirement 优先级较低，安排在 Phase 5.x 实施。

当 Skill 的 `metadata.install` 定义了安装指令时，系统 SHOULD 提供一键安装能力。

**支持的安装方式（PRC 适配）：**

| 方式 | 命令模板 | 镜像 |
|------|---------|------|
| pip | `pip install -i {mirror} {spec}` | `https://pypi.tuna.tsinghua.edu.cn/simple` |
| npm | `npm install --registry {mirror} -g {spec}` | `https://registry.npmmirror.com` |
| conda | `conda install -c {mirror} {spec}` | `https://mirrors.tuna.tsinghua.edu.cn/anaconda` |
| go | `GOPROXY={mirror} go install {spec}` | `https://goproxy.cn` |
| winget | `winget install {spec}` | — |
| download | HTTP 下载 + 解压到 `targetDir` | — |

**Skill 元数据示例：**

```yaml
equality:
  install:
    - kind: pip
      spec: pandas openpyxl
      mirror: https://pypi.tuna.tsinghua.edu.cn/simple
    - kind: winget
      spec: Python.Python.3.12
```

**安装流程：**
1. 调用 `POST /skills/:name/install` 触发安装
2. 系统安全扫描 Skill 目录（如有 critical 发现则拒绝安装）
3. 执行安装命令（超时 120s）
4. 安装完成后 bump Skills 版本 → 重新检测依赖
5. 返回安装结果 `{ ok, message, stdout, stderr }`

#### Scenario: 一键安装 Skill 依赖

- GIVEN Skill `excel-diff` 声明 `install: [{ kind: pip, spec: "pandas openpyxl" }]`
- AND 本机未安装 pandas
- WHEN 用户调用 `POST /skills/excel-diff/install`
- THEN 系统执行 `pip install -i https://pypi.tuna.tsinghua.edu.cn/simple pandas openpyxl`
- AND 安装成功后依赖检测刷新
- AND `excel-diff` 变为 `eligible: true`

---

## 实现文件清单

```
packages/core/src/skills/
├── scanner.ts        # Requirement: Skill 安全扫描
├── watcher.ts        # Requirement: Skills 文件监控与热更新
├── status.ts         # Requirement: Skill 状态报告与依赖检测
├── installer.ts      # Requirement: Skill 依赖安装器（Phase 5.x）
├── loader.ts         # MODIFY: 集成 scanner，blocked 标记
└── types.ts          # MODIFY: 新增 SkillScanFinding, SkillStatusEntry 等类型

packages/core/src/index.ts
  # MODIFY: 新增 GET /skills/status, POST /skills/:name/scan API

packages/core/skills/skill-creator/
└── SKILL.md           # Requirement: Skill Creator 内置 Skill
```
