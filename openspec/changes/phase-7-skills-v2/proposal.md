# Proposal: Skills V2

> Phase 7 | 优先级: 🟡 P1  
> Spec: [specs/skills/skills-v2-spec.md](../../specs/skills/skills-v2-spec.md)  
> 对标: OpenClaw skill-scanner, refresh, skills-status

## 意图

当前 Skills 系统（V1）能加载和注入 Skills，但缺少安全防护、精细化监控和状态可观测性。
用户从 Gallery 安装或自己编写的 Skill 可能包含恶意脚本，系统没有检测和阻断能力。
Watcher 的防抖过于保守（30s），且没有 glob 过滤和版本追踪。
没有 API 可以查看每个 Skill 的启用状态和依赖满足情况。
没有内置的 skill-creator 来指导 LLM 生成高质量 Skill。

## 目标

实现 skills-v2-spec.md 中的 4 个 Requirement（第 5 个安装器推迟）：

1. **安全扫描** — 加载前扫描脚本文件，critical 级阻止加载，带缓存
2. **Watcher 优化** — glob 过滤、ignore 列表、5s 防抖、版本号、graceful close
3. **状态报告** — `GET /skills/status` API，依赖检测（bins + env）
4. **Skill Creator** — 内置 skill-creator/SKILL.md 元 Skill

## 范围

- **包含**：scanner.ts、watcher.ts 改造、status.ts、skill-creator SKILL.md、types 扩展、API 路由
- **不包含**：Req 5 依赖安装器（推迟到后续 Phase）、Gallery UI 集成

## 成功标准

- 包含 `eval(atob(...))` 的 Skill 被自动阻止加载
- 编辑 SKILL.md 后 5 秒内自动重载
- `GET /skills/status` 返回完整的状态报告含依赖检测
- skill-creator Skill 能指导 LLM 生成符合规范的 SKILL.md
