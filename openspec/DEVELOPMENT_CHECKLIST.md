# Equality 开发规范 — 必读检查清单

> **每次开始新 Phase 或修改现有模块前，必须先读本文档。**
> 上次更新：2026-03-14（Phase 4 通知功能完成后）

---

## 一、修改前必做的检查

### 1. 影响范围扫描

**在写第一行代码之前**，先回答以下问题：

- [ ] 我要改的模块被哪些地方引用？（用 `grep -r "模块名" packages/` 确认）
- [ ] 是否有"同一逻辑、多处表达"的情况？（如 provider 优先级同时出现在 `PROVIDER_ORDER` 和 `/settings` 端点）
- [ ] 改完后，哪些现有功能需要回归测试？

**真实案例**：
> 调整 `PROVIDER_ORDER` 时只改了 `providers/index.ts`，没改 `index.ts` 中 `/settings` 端点的判断顺序，导致设置页面显示 `copilot` 但实际用的是 `custom`。

### 2. 相关文件关联表

| 当你要改… | 必须同步检查… |
|-----------|-------------|
| `providers/index.ts` 的 PROVIDER_ORDER | `index.ts` 的 `/settings` activeProvider 判断 |
| `providers/copilot.ts` 的 headers | 检查 Chat Completions 和 Responses API 两条路径 |
| `agent/system-prompt.ts` | 测试 tool calling 是否仍然正常触发 |
| `tools/builtins/index.ts` 增删工具 | `index.ts` 的 `/tools/schemas` 端点是否更新 |
| `cron/scheduler.ts` 的通知逻辑 | `proxy.rs` 的 SSE 监听 + `index.ts` 的 `broadcastNotification` |
| `Cargo.toml` 加新插件 | `lib.rs` 注册 + `capabilities/default.json` 权限 |
| 任何 Tauri 插件 | 同时检查 Rust 端（Cargo.toml + lib.rs）和 JS 端（package.json + import） |

### 3. 优先级/顺序一致性

**规则**：凡是涉及"有序列表"的改动，必须全局搜索所有引用该顺序的代码。

```bash
# 示例：改 provider 优先级后
grep -rn "activeProvider\|PROVIDER_ORDER\|copilot.*custom\|getDefaultProvider" packages/core/src/
```

---

## 二、已踩过的坑（按类型分类）

### A. 改了一处忘了另一处

| 踩坑 | 原因 | 教训 |
|------|------|------|
| 设置显示 copilot 实际用 custom | `PROVIDER_ORDER` 和 `/settings` 判断顺序不一致 | **同一逻辑多处表达 → grep 全改** |

### B. 第三方 API 行为不符合预期

| 踩坑 | 原因 | 教训 |
|------|------|------|
| Copilot API 不触发 tool calling | Headers 错误导致功能降级 | **模仿已知可工作的客户端 headers** |
| Responses API finishReason 缺失 | `response.completed` 不含此字段 | **不同 API 的语义不同，不要假设** |
| Responses API id 前缀不同 | `call_` vs `fc_` | **混用 API 时检查所有 id 字段** |
| cron-parser v5 API 变更 | `parse()` 不是 `parseExpression()` | **装新包后看 .d.ts 确认 API** |
| pdf-parse v2 返回结构变了 | `pages` 从 `string[]` 变成 `{text, num}[]` | **大版本升级后验证返回值结构** |

### C. 架构选择导致的问题

| 踩坑 | 原因 | 教训 |
|------|------|------|
| WebView EventSource 跨域失败 | Tauri WebView 安全策略阻止 | **Tauri 中跨域操作用 Rust 端做** |
| System prompt 过长抑制 tool calling | ~800 字 prompt + 15 工具 schema | **工具型 agent 的 system prompt 要短** |
| 模型只传 required 字段 | `action` 没设 required | **控制流字段必须 required** |

### D. 调试方法不当导致浪费时间

| 踩坑 | 原因 | 教训 |
|------|------|------|
| 反复改代码试 tool calling | 没先隔离是代码层还是 API 层 | **先用直接 API 调用隔离** |
| 在 PowerShell 中调试 SSE | SSE 流式响应在 PS 中行为诡异 | **用 curl 或写测试端点** |

---

## 三、修改后的验证清单

改完代码后，按以下顺序验证：

1. **TypeScript 编译**：`npx tsc --noEmit`
2. **Rust 编译**（如果改了 Tauri）：`cargo check`
3. **Core 启动**：`GET /health` 返回正确的 provider/model
4. **设置页面**：显示的 activeProvider 与 `/health` 一致
5. **聊天功能**：发一条消息，确认 AI 回复且 tool calling 正常
6. **通知功能**（如果改了 cron/SSE）：`POST /test/notify` 能弹系统通知
7. **新增功能**：单独测试新功能
8. **回归测试**：按"影响范围扫描"的结果，重测可能受影响的功能

---

## 四、文件命名和组织规范

每个 Phase 目录下应包含：

```
openspec/changes/phase-X-xxx/
  ├── proposal.md        # 提案（为什么要做）
  ├── design.md          # 技术设计（怎么做）
  ├── tasks.md           # 任务拆分（清单）
  ├── troubleshooting.md # 排查记录（踩过的坑）
  └── delta-spec.md      # 对 specs/ 的增量修改（可选）
```

**troubleshooting.md 格式**：
```
## 问题 N：标题
### 现象
### 排查
### 根因
### 修复
### 原则（一句话总结教训）
```
