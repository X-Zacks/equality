# Phase 7: Skills V2 — Tasks

> 状态：✅ 完成  
> Spec: [specs/skills/skills-v2-spec.md](../../specs/skills/skills-v2-spec.md)

## 实施清单

### 1. 类型扩展（types.ts）

- [x] 1.1 新增 `SkillScanSeverity`、`SkillScanFinding`、`SkillScanSummary` 类型
- [x] 1.2 新增 `SkillStatusEntry`、`SkillStatusReport` 类型
- [x] 1.3 在 `SkillEntry` 中增加 `blocked?: boolean`、`scanSummary?: SkillScanSummary`

### 2. 安全扫描（scanner.ts）

- [x] 2.1 实现 8 条扫描规则（4 critical + 4 warn）
- [x] 2.2 实现 `scanSkillDir(baseDir)` — 扫描目录下所有脚本文件
- [x] 2.3 实现 `scanFile(filePath)` — 逐行扫描单个文件
- [x] 2.4 实现缓存：filePath + mtime + size → findings，上限 5000 条 LRU
- [x] 2.5 实现 `scanSkillDirNoCache(baseDir)` — 忽略缓存的强制扫描

### 3. Watcher 优化（watcher.ts）

- [x] 3.1 防抖从 30s 改为 5s（DEFAULT_DEBOUNCE_MS = 5000）
- [x] 3.2 chokidar 事件中过滤只关心 SKILL.md / *.skill.md
- [x] 3.3 添加 ignore 列表（.git, node_modules, dist, __pycache__, .venv, build, .cache）
- [x] 3.4 添加 `version` 字段，每次重载递增
- [x] 3.5 新增 `close()` 方法，日志输出文件描述符释放
- [x] 3.6 `SkillsChangeEvent` 类型（version + reason + changedPath）

### 4. Loader 集成（loader.ts）

- [x] 4.1 加载后调用 `scanSkillDir()` 扫描每个 Skill
- [x] 4.2 critical > 0 → `blocked: true`，日志输出被阻止的规则

### 5. 状态报告（status.ts）

- [x] 5.1 实现 `checkBinExists(name)` — `where.exe` 检测，缓存 30s
- [x] 5.2 实现 `checkEnvExists(name)` — 检查 `process.env`
- [x] 5.3 实现 `buildSkillStatus(entries)` — 生成 `SkillStatusReport`
- [x] 5.4 eligible 判定：enabled AND NOT blocked AND bins全部found AND env全部found

### 6. Skill Creator 内置 Skill

- [x] 6.1 创建 `packages/core/skills/skill-creator/SKILL.md`
- [x] 6.2 包含：目录结构规范、SKILL.md 模板、渐进式披露、Windows 兼容规则、PRC 镜像规则、命名规范、反面案例

### 7. API 路由（index.ts）

- [x] 7.1 `GET /skills/status` — 返回 SkillStatusReport
- [x] 7.2 `POST /skills/:name/scan` — 强制扫描指定 Skill

### 8. 导出与集成

- [x] 8.1 skills/index.ts 导出新模块（scanner, status, 新类型）
- [x] 8.2 TypeScript 编译零新增错误
