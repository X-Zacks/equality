# Phase 12.1: Context Engine — Tasks

> 状态：✅ 完成

## 实施清单

### 1. 接口定义（types.ts）

- [x] 1.1 ContextEngine 接口
- [x] 1.2 AssembleParams / AssembleResult 类型
- [x] 1.3 AfterTurnParams 类型

### 2. DefaultContextEngine

- [x] 2.1 assemble(): system prompt + memory recall + history + compaction + trim
- [x] 2.2 afterTurn(): persist session

### 3. runner.ts 重构

- [x] 3.1 创建 DefaultContextEngine 实例
- [x] 3.2 替换散布的上下文逻辑为 engine.assemble()
- [x] 3.3 runAttempt 结束时调 engine.afterTurn()

### 4. 验证

- [x] 4.1 TypeScript 编译零新增错误
