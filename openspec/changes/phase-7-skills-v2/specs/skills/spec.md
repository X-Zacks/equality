# Delta Spec: Skills V2

> Phase 7 变更对 [specs/skills/spec.md](../../../specs/skills/spec.md) 和 [specs/skills/skills-v2-spec.md](../../../specs/skills/skills-v2-spec.md) 的影响

## ADDED Requirements

### Requirement: Skill 安全扫描
从 [skills-v2-spec.md](../../../specs/skills/skills-v2-spec.md) 实现。

### Requirement: Skills 文件监控与热更新（增强版）
从 [skills-v2-spec.md](../../../specs/skills/skills-v2-spec.md) 实现，对现有 V1 Watcher 的增强。

### Requirement: Skill 状态报告与依赖检测
从 [skills-v2-spec.md](../../../specs/skills/skills-v2-spec.md) 实现。

### Requirement: Skill Creator 内置 Skill
从 [skills-v2-spec.md](../../../specs/skills/skills-v2-spec.md) 实现。

## MODIFIED Requirements

### Requirement: Skills 热更新
原 V1 spec 中的 30s 防抖改为 5s，增加 glob 过滤、ignore 列表和版本号。

### Requirement: Skills 加载优先级
加载流程增加安全扫描步骤，critical 级发现阻止该 Skill 注入 System Prompt。
