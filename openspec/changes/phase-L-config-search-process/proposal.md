# Phase L 提案：配置与搜索与进程

## 动机

Phase K 完成插件 SDK / 记忆增强 / 链接理解后，系统的扩展性和智能得到大幅提升。但运维健壮性仍有三个薄弱环节：

1. **配置无验证**（GAP-33）——`secrets.ts` 存储 21 个配置项，全部是手工 `getSecret(key)` 读取，无 schema 验证。用户写错 key 名或值类型时无提示，且版本升级时无配置自动迁移。
2. **搜索引擎硬编码**（GAP-29）——`web-search.ts` 硬编码 Brave+DDG 两个搜索函数，无法在运行时切换或注册新 provider。对比 LLM Provider 已有统一 `LLMProvider` 接口和工厂模式，Web Search 缺少同等抽象。
3. **子进程管理粗放**（GAP-34）——`bash-sandbox.ts` 支持前台/后台执行和 `taskkill /F /T`，但无命令队列（可同时执行无限进程）、无并发上限，后台进程的 kill tree 也未与 `process-manager.ts` 集成。

## 范围

| ID | 名称 | GAP | 优先级 |
|----|------|-----|--------|
| L1 | Config Schema Validation | GAP-33 | P2 |
| L2 | Web Search Abstraction | GAP-29 | P2 |
| L3 | Process Supervision | GAP-34 | P2 |

## 非目标

- Zod 库引入（L1 使用自研轻量 schema 验证，零依赖原则）
- 配置 UI 编辑器（属于 Desktop 前端范畴）
- JavaScript 渲染搜索（无 headless browser）
- Docker/SSH 沙箱后端（Windows 桌面不适用）
- Daemon/systemd 服务化（Tauri 已管理进程生命周期）

## 成功标准

- L1: 定义 `ConfigSchema` + `validateConfig()` + `migrateConfig()` ，支持类型验证/默认值/迁移
- L2: 定义 `WebSearchProvider` 接口 + `WebSearchRegistry`，支持运行时注册/切换搜索 provider
- L3: 实现命令队列（并发上限 5）+ 子进程 kill tree + 超时清理
- 新增测试 ≥ 70 个断言
- tsc --noEmit 零错误
- 现有断言无回归
