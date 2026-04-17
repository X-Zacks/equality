# Design: Phase T

## T1: Purpose 持久化

在 `persist.ts` 的 `save()` payload 中加入 `purpose` 字段。在 `store.ts` 的 `getOrCreate()` 恢复时读取。

受影响文件:
- `packages/core/src/session/persist.ts` — save + load
- `packages/core/src/session/store.ts` — getOrCreate 恢复

## T2: Skills 渐进式披露

修改 `skills/prompt.ts` 的 `buildSkillsPromptBlock()`：
- 非 active 的 skill：只输出 `<skill name="xxx" description="..." />`
- active 的 skill（@ 指定）：保持全量注入

新增 `tools/builtins/skill-view.ts`：
- 参数: `name: string`
- 逻辑: 在所有 skill 目录中查找匹配的 SKILL.md，返回内容
- 注册到 catalog

受影响文件:
- `packages/core/src/skills/prompt.ts` — 改为元数据模式
- `packages/core/src/tools/builtins/skill-view.ts` — 新建
- `packages/core/src/tools/builtins/index.ts` — 注册
- `packages/core/src/tools/catalog.ts` — 注册

## T3: 子代理深度限制

在 `subagent-spawn.ts` 中：
- 新增 `MAX_SUBAGENT_DEPTH = 3`
- 从 runner context / session metadata 获取当前 depth
- 超限返回错误

受影响文件:
- `packages/core/src/tools/builtins/subagent-spawn.ts` — 深度检查
