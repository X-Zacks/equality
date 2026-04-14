# Proposal: Phase I.5b — Gateway 缝合冲刺（G4-G9）

> Status: in-progress
> Created: 2026-04-14
> Priority: P1
> Depends: phase-I5-gateway-stitch (G1-G3 已完成)

---

## 动机

G1-G3 已完成核心缝合（codebase_search 注册 + Hooks 接入 runner + Session 生命周期事件）。
本轮完成剩余 6 个 Gap，使 Phase J-O 的全部模块级代码真正接入运行时。

## 范围

| # | Gap | 风险评估 | 工作量 |
|---|-----|---------|--------|
| G4 | Config 验证接入启动 | 低（warn only，不阻断） | 小 |
| G5 | Web 搜索走 Registry | 中（改工具内部逻辑，需保持行为不变） | 中 |
| G6 | Bash 接入 CommandQueue | 中（并发限流，需保证现有前台/后台双模式兼容） | 中 |
| G7 | Links beforeLLMCall hook | 低（纯新增，hook 异常隔离） | 小 |
| G8 | Plugin loader 磁盘加载 | 低（新文件，不改现有代码） | 小 |
| G9 | Structured Logger 替换 index.ts 入口日志 | 低（console.log → logger，纯输出改变） | 小 |

## 设计原则

1. **行为不变**：G5/G6 对外 API 行为完全不变，仅内部实现走 Registry/Queue
2. **降级安全**：所有新代码路径出错时都 fallback 到原有行为
3. **最小改动**：每个 Gap 只改 1-3 个文件
