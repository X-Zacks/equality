# Delta Spec: Workspace Bootstrap

> Phase G1 (GAP-16) — 对话驱动的工作区引导  
> 新增领域：workspace-bootstrap（从 agent-runner 拆出）

---

## ADDED Requirements

### Requirement: 引导文件类型

系统 MUST 支持以下 6 种引导文件，统称为 `BootstrapFileName`：

| 文件名 | 用途 | 生命周期 |
|--------|------|---------|
| `BOOTSTRAP.md` | 首次运行引导脚本 | 一次性，引导完成后由 Agent 删除 |
| `AGENTS.md` | 项目级 Agent 行为指令 | 持久存在 |
| `IDENTITY.md` | Agent 身份信息（姓名/性格/emoji） | 持久存在，Agent 可通过对话更新 |
| `USER.md` | 用户档案（姓名/时区/偏好） | 持久存在，Agent 可通过对话更新 |
| `SOUL.md` | Agent 灵魂/行为准则 | 持久存在，Agent 可通过对话更新 |
| `TOOLS.md` | 项目环境备注 | 持久存在 |

文件加载顺序 SHALL 按上述表格顺序（BOOTSTRAP → AGENTS → IDENTITY → USER → SOUL → TOOLS）。

#### Scenario: 加载全部引导文件
- GIVEN 工作区目录下存在全部 6 个引导文件
- WHEN `loadWorkspaceBootstrapFiles()` 被调用
- THEN 返回结果中 `files` 包含 6 个 `BootstrapFile` 对象
- AND 顺序为 BOOTSTRAP → AGENTS → IDENTITY → USER → SOUL → TOOLS
- AND `isBootstrapping` 为 `true`（因为 BOOTSTRAP.md 存在）

#### Scenario: 部分文件缺失
- GIVEN 工作区只存在 `AGENTS.md` 和 `SOUL.md`
- WHEN `loadWorkspaceBootstrapFiles()` 被调用
- THEN 返回结果中 `files` 只包含 2 个文件
- AND `errors` 中包含 4 个 `{ reason: 'missing' }` 条目
- AND `isBootstrapping` 为 `false`

---

### Requirement: 自动种子（ensureWorkspaceBootstrap）

系统 MUST 在 Core 启动时调用 `ensureWorkspaceBootstrap(workspaceDir)` 自动种下模板文件。

**全新工作区**（无任何引导文件存在）：
- 系统 SHALL 种下全部 6 个模板文件，**包含** `BOOTSTRAP.md`
- 返回 `{ seeded: [...全部文件名], isNewWorkspace: true }`

**已有内容的工作区**（至少存在 1 个引导文件）：
- 系统 SHALL 只补种缺失的文件，**跳过** `BOOTSTRAP.md`
- 返回 `{ seeded: [...缺失文件名], isNewWorkspace: false }`

**原子性**：种子操作 MUST 使用 `writeFile(flag: 'wx')`（非覆盖写入），已存在的文件 SHALL NOT 被覆盖。

#### Scenario: 全新工作区自动种子
- GIVEN 工作区目录为空
- WHEN `ensureWorkspaceBootstrap()` 被调用
- THEN 目录下出现 6 个 `.md` 文件
- AND `seeded` 包含全部 6 个文件名
- AND `isNewWorkspace` 为 `true`
- AND `BOOTSTRAP.md` 包含首次引导脚本

#### Scenario: 已有工作区补种
- GIVEN 工作区已存在 `AGENTS.md`
- WHEN `ensureWorkspaceBootstrap()` 被调用
- THEN 补种 `IDENTITY.md`、`USER.md`、`SOUL.md`、`TOOLS.md`
- AND `BOOTSTRAP.md` 不被创建（跳过）
- AND 已有的 `AGENTS.md` 内容不被覆盖

#### Scenario: 重复调用幂等
- GIVEN 全部 6 个文件已存在
- WHEN `ensureWorkspaceBootstrap()` 再次被调用
- THEN `seeded` 为空数组
- AND 所有文件内容不变

---

### Requirement: 对话驱动的首次引导流程

当 `BOOTSTRAP.md` 存在时，系统 MUST 将其内容作为**最高优先级引导指令**注入 system prompt。

引导流程：
1. Agent 看到 `<bootstrap-script>` → 主动发起对话
2. Agent 通过对话了解用户姓名、偏好、风格等
3. Agent 使用 `write_file` 工具更新 `IDENTITY.md`、`USER.md`、`SOUL.md`
4. Agent 删除 `BOOTSTRAP.md`，引导完成

#### Scenario: 首次引导 prompt 注入
- GIVEN `BOOTSTRAP.md` 存在于工作区
- WHEN `formatBootstrapBlock()` 被调用
- THEN 输出包含 `<bootstrap-script>` 标签
- AND 输出包含"首次引导（最高优先级）"
- AND 输出包含"你主动开场"

#### Scenario: 引导完成后
- GIVEN `BOOTSTRAP.md` 已被 Agent 删除
- WHEN `loadWorkspaceBootstrapFiles()` 被调用
- THEN `isBootstrapping` 为 `false`
- AND 其他引导文件正常加载

---

### Requirement: 安全约束

#### 路径边界
系统 MUST 验证每个引导文件路径在 `workspaceDir` 内部。使用 `resolve()` + `relative()` 检测 `..` 逃逸和 symlink 逃逸。

#### Scenario: 路径逃逸
- GIVEN 文件名被篡改为包含 `../../etc/passwd` 的路径
- WHEN 路径边界检查执行
- THEN 该文件被拒绝加载
- AND `errors` 中记录 `{ reason: 'security' }`

#### 文件大小限制
单个引导文件 MUST NOT 超过 2MB（2 * 1024 * 1024 bytes）。

#### Scenario: 超大文件
- GIVEN `AGENTS.md` 大小为 3MB
- WHEN `loadWorkspaceBootstrapFiles()` 被调用
- THEN 该文件不被加载
- AND `errors` 中记录 `{ reason: 'too_large' }`

---

### Requirement: 缓存

系统 SHOULD 对引导文件内容进行 mtime + size 缓存，避免重复磁盘 I/O。

- 缓存 key：文件绝对路径
- 缓存 identity：`${mtimeMs}:${size}`
- 文件 mtime 或 size 变化时自动失效
- `invalidateBootstrapCache()` 供测试使用

#### Scenario: 缓存命中
- GIVEN `AGENTS.md` 已被加载过且 mtime 未变化
- WHEN 再次调用 `loadWorkspaceBootstrapFiles()`
- THEN 返回缓存内容，不触发磁盘读取

---

### Requirement: System Prompt 注入格式

`formatBootstrapBlock()` MUST 将引导文件格式化为两种 XML 标签：

**BOOTSTRAP.md（引导脚本）**：
```xml
## 🚀 首次引导（最高优先级）
<bootstrap-script>
...引导脚本内容...
</bootstrap-script>
请立即开始引导对话。不要等用户先说话——你主动开场。
```

**其他引导文件**：
```xml
## 项目上下文（工作区引导文件）
<workspace-context name="AGENTS.md">
...内容...
</workspace-context>
```

YAML frontmatter MUST 在注入前被剥离。

#### Scenario: 混合注入
- GIVEN 工作区存在 BOOTSTRAP.md 和 AGENTS.md
- WHEN `formatBootstrapBlock()` 被调用
- THEN 输出同时包含 `<bootstrap-script>` 和 `<workspace-context>` 标签
- AND `<bootstrap-script>` 在前（高优先级）

#### Scenario: 无引导文件
- GIVEN 工作区不存在任何引导文件
- WHEN `formatBootstrapBlock([])` 被调用
- THEN 返回空字符串
