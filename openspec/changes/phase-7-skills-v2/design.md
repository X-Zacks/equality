# Design: Skills V2

> Phase 7 | Spec: [specs/skills/skills-v2-spec.md](../../specs/skills/skills-v2-spec.md)

## 架构决策

### 1. Scanner 独立模块，与 Gallery 现有扫描解耦

**选择**：新建 `scanner.ts`，不复用 gallery.ts 中的 `scanSkillContent()`。

**理由**：
- gallery.ts 的 `scanSkillContent()` 只接受单个字符串，无法扫描目录下多个脚本文件
- 新 scanner 按 spec 要求扫描 `.py/.js/.ts/.sh/.ps1/.bat/.cmd` 等多种文件类型
- 结果类型不同：gallery 返回 `ScanResult`（简单），scanner 返回 `SkillScanSummary`（结构化）
- gallery 的 `DANGEROUS_PATTERNS` 可以作为参考，但规则体系需要重写为 spec 中定义的 8 条规则

### 2. 扫描缓存基于 filePath + mtime + size 三元组

**选择**：内存 Map，key = `${filePath}:${mtime}:${size}`，value = `SkillScanFinding[]`。

**理由**：
- 避免未变更的文件重复扫描
- mtime + size 足以检测绝大多数变更（不需要 content hash，性能更好）
- 缓存上限 5000 条，LRU 淘汰

### 3. Watcher 改造而非重写

**选择**：在现有 `watcher.ts` 的 `SkillsWatcher` 类上改造。

**改造点**：
- 防抖从 30s → 5s（可配置）
- chokidar 添加 glob 过滤：只监听 `**/SKILL.md`
- 添加 ignore 列表（.git, node_modules, dist, __pycache__, .venv, build, .cache）
- 添加版本号 `version: number`，每次重载 +1
- `stop()` 改为 `closeSkillsWatcher()` 语义
- 重载后触发安全扫描

### 4. 状态报告的依赖检测使用 `where.exe`

**选择**：Windows 用 `where.exe <bin>`，检测结果缓存 30 秒。

**理由**：
- `where.exe` 是 Windows 原生命令，零依赖
- 缓存 30 秒避免频繁 spawn 子进程
- env 检测直接检查 `process.env[name]`，无需子进程

### 5. Skill Creator 放在 bundled skills 目录

**选择**：`packages/core/skills/skill-creator/SKILL.md`

**理由**：
- bundled 优先级 2，可被 managed/personal/workspace 覆盖
- 随代码仓库分发，版本可控

## 数据流

```
loadAllSkills()
    ↓ 每个 SkillEntry
scanSkillDir(skill.baseDir)
    ↓ SkillScanSummary
    ├─ critical > 0 → blocked: true，不注入 System Prompt
    └─ critical == 0 → 正常加载
    ↓
SkillStatusEntry（合并 scan + deps 检测）
    ↓
GET /skills/status → SkillStatusReport JSON
```

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/core/src/skills/scanner.ts` | 新增 | 安全扫描器（8 条规则 + 缓存） |
| `packages/core/src/skills/status.ts` | 新增 | 状态报告 + 依赖检测 |
| `packages/core/src/skills/watcher.ts` | 修改 | glob + ignore + 5s 防抖 + 版本号 + graceful close |
| `packages/core/src/skills/types.ts` | 修改 | 新增 SkillScanFinding, SkillStatusEntry 等类型 |
| `packages/core/src/skills/loader.ts` | 修改 | 集成 scanner，blocked 标记 |
| `packages/core/src/skills/index.ts` | 修改 | 导出新模块 |
| `packages/core/src/index.ts` | 修改 | 新增 GET /skills/status, POST /skills/:name/scan |
| `packages/core/skills/skill-creator/SKILL.md` | 新增 | 元 Skill |
