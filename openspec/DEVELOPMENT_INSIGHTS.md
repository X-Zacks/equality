# Equality 项目开发总结

> 截至 2026-03-14，Phase 0 → Phase 4.5 全部完成。

---

## 一、项目概况

**Equality** 是面向中国大陆 Windows 用户的 AI 桌面助理，借鉴 OpenClaw 架构但专注于 Windows 桌面场景。

```
Tauri v2 (Rust + React/TypeScript)
    ↕ Tauri IPC
Fastify Core (Node.js, port 18790)
    ↕ HTTP/SSE
OpenAI SDK → LLM APIs (Copilot / Custom / DeepSeek / Qwen / Volc)
```

**核心指标**：15 个内置工具、5 个 LLM Provider、cron 定时任务、SSE 系统通知、Skills 知识注入。

---

## 二、技术选择及理由

### 运行时

| 选择 | 理由 | 备选 | 不选的原因 |
|------|------|------|----------|
| **Tauri v2** | 安装包小（~8MB），Rust 性能好，Windows 原生 WebView2 | Electron | 安装包 150MB+，内存占用高 |
| **Fastify** | 最快的 Node.js HTTP 框架，TypeScript 友好 | Express | 性能差，中间件模型过时 |
| **tsx watch** | 零配置 TypeScript 热重载，开发体验极好 | ts-node, nodemon | tsx 更快且无需 tsconfig 配置 |
| **OpenAI SDK v4** | 同时支持 Chat Completions 和 Responses API | 自写 HTTP | SDK 处理了重试、类型、SSE 解析 |

### LLM 策略

| 选择 | 理由 |
|------|------|
| **多 Provider Fallback** | 中国网络环境不稳定，单 Provider 不可靠 |
| **Custom 优先于 Copilot** | 自定义 OpenAI 端点 100% 支持标准 function calling，Copilot 有额外 header 限制 |
| **System prompt 极简** | 长 prompt 抑制 tool calling；让 tool schema 的 description 自己说话 |
| **Responses API 用于 GPT-5.x** | GPT-5.x 不支持 Chat Completions，必须走 Responses API |

### 桌面集成

| 选择 | 理由 |
|------|------|
| **Rust 端 SSE 监听** | Tauri WebView 中 EventSource 跨域受限，Rust 端用 reqwest 无此问题 |
| **tauri-plugin-notification** | Windows 原生通知，不依赖浏览器 Notification API |
| **tauri-plugin-dialog** | 原生文件选择器，支持拖拽 |
| **系统托盘常驻** | 关闭窗口只是隐藏，后台持续运行（cron 调度需要） |

### 存储

| 选择 | 理由 |
|------|------|
| **JSON 文件** | 会话历史、cron 任务、设置 — 数据量小，JSON 可读可调试 |
| **%APPDATA%/Equality/** | Windows 标准应用数据目录 |
| 未来 Phase 6 **SQLite** | Memory/RAG 需要向量检索，JSON 不够 |

---

## 三、解决的关键问题及方案模式

### 模式 1：API 兼容性问题 → "模仿已知可工作的客户端"

**问题**：Copilot API 在错误 headers 下静默禁用 tool calling。
**方案**：从 OpenClaw 源码（pi-ai 库）提取正确的 headers。
**适用场景**：任何行为不明确的第三方 API。

```
解决步骤：
1. 找到一个已知能正常工作的开源客户端
2. 提取其 HTTP headers / 请求格式
3. 逐字复制，不要自作主张改动
```

### 模式 2：流式 API 事件不一致 → "多 key 注册 + fallback"

**问题**：Responses API 的 `function_call_arguments.delta` 事件 `item_id` 与 `output_item.added` 的 `item.id` 不一致。
**方案**：同一个 function_call 对象注册 3 个 key（item.id、call_id、output_index），加 `lastFc` 全局 fallback。

```
解决步骤：
1. 打印所有相关事件的 payload 结构
2. 找到所有可能的关联 ID
3. 多 key 注册 + fallback 兜底
4. 参考成熟实现（OpenClaw 的 currentItem 状态机）
```

### 模式 3：两套 API 混用 → "统一转换层"

**问题**：Chat Completions 用 `call_` 前缀，Responses API 用 `fc_` 前缀。
**方案**：`toFcId()` 转换函数，在 API 边界统一处理。

```
解决步骤：
1. 明确两套 API 各自的 ID 格式规范
2. 在 convertToXxx 函数中统一转换
3. 不要在业务逻辑中处理格式差异
```

### 模式 4：LLM 不调用工具 → "逐变量隔离"

**问题**：AI 始终用文字描述而不调用工具。
**方案**：隔离法 — 用直接 API 调用逐一排除 schema、headers、prompt、model 等变量。

```
排查决策树：
直接 API 调用（无 prompt，1 个工具）→ 能调用？
  ├─ 是 → 问题在 prompt / headers / 工具数量
  │   ├─ 加 prompt 还能调用？→ prompt 长度问题
  │   └─ 加所有工具还能调用？→ 工具 schema 问题
  └─ 否 → API 本身不支持 / 端点错误
```

### 模式 5：跨域/安全限制 → "把逻辑移到 Rust 端"

**问题**：Tauri WebView 中 EventSource 跨域受限。
**方案**：在 Rust 端做 HTTP 请求，通过 Tauri event 推给前端。

```
Tauri 架构原则：
- 前端 → Rust → 外部 API（不直接从 WebView 访问外部服务）
- 通知、文件系统、进程管理 → Rust 端处理
- UI 渲染、交互 → 前端处理
```

### 模式 6：优先级/顺序改动 → "grep 全改"

**问题**：改了 `PROVIDER_ORDER` 但没改 `/settings` 的判断顺序。
**方案**：任何"有序列表"的改动都要 grep 所有引用点。

```
grep -rn "关键词1\|关键词2" packages/core/src/
# 确保所有引用点的顺序一致
```

### 模式 7：npm 包大版本升级 → "看 .d.ts 确认 API"

**问题**：cron-parser v5 的 API 与 v4 不兼容。
**方案**：装包后直接读 `node_modules/包名/lib/index.d.ts`。

```
解决步骤：
1. npm install / pnpm add
2. 直接看 node_modules 中的 .d.ts 文件
3. 不要信 npm README（可能过时）
4. 不要信 AI 的记忆（可能是旧版 API）
```

---

## 四、架构经验

### 4.1 Core 是纯 Node.js 服务，不依赖 Tauri

```
packages/core/   → 纯 Node.js，可独立运行、独立测试
packages/desktop/ → Tauri 壳，只做 IPC 转发和系统集成
```

**好处**：
- Core 可以用 `pnpm dev` 单独跑，热重载快（tsx watch ~1s）
- Tauri 编译慢（~2min），只在需要测试桌面集成时重启
- 未来可以把 Core 部署为服务器，配合飞书/钉钉渠道

### 4.2 工具 Schema 就是最好的文档

```typescript
// ❌ 不要这样：system prompt 里写工具使用说明
"当用户要求文件操作时，使用 read_file / write_file..."

// ✅ 应该这样：让 tool schema 的 description 自己说话
{
  name: 'cron',
  description: '管理定时任务。支持创建、查看、修改、删除...',
  inputSchema: { ... }
}
```

System prompt 只需一句：`"当用户的请求可以通过工具完成时，直接调用工具。"`

### 4.3 SSE 是轻量级实时推送的最佳选择

```
Core → SSE /events → Rust proxy → tauri-plugin-notification
```

不需要 WebSocket 的双向通信能力时，SSE 更简单：
- 单向推送、自动重连、HTTP 兼容
- Node.js 端只需 `res.write('data: ...\n\n')`

### 4.4 Tauri 插件的"三件套"

每加一个 Tauri 插件，必须同时改三个地方：

```
1. Cargo.toml        → 加 Rust 依赖
2. lib.rs            → .plugin(tauri_plugin_xxx::init())
3. capabilities/     → 加权限声明
(可选)
4. package.json      → 加 JS 绑定包
```

漏掉任何一个都会导致静默失败。

---

## 五、性能和成本数据

| 指标 | 数值 | 说明 |
|------|------|------|
| Core 启动时间 | ~1.5s | tsx watch 热重载 |
| Tauri 增量编译 | ~15-30s | Rust 增量，首次 ~2min |
| 单次对话成本 | ¥0.00-0.02 | Copilot 免费，Custom gpt-4o ~¥0.01/次 |
| Tool calling 延迟 | +1-3s/工具 | 包含工具执行时间 |
| Cron tick 间隔 | 60s | 精度 ±60s，足够提醒场景 |
| SSE 通知延迟 | <100ms | Rust 端 reqwest 直连 |

---

## 六、下一步建议

1. **Phase 4.1 Tool Loop Detection**（P0）：防止 AI 无限循环调用工具，当前只有基础的 maxTurns 限制
2. **用户主动选择 Provider**：当前是自动 fallback，用户在设置里选了 Copilot 但可能实际用的是 Custom。需要加"用户选定 > 自动 fallback"的逻辑
3. **清理调试代码**：`base.ts` 和 `runner.ts` 中的 debug 日志和 `debug-request.json` 写入应该移除
4. **集成测试**：目前全靠手动测试，应该加基础的 API 集成测试

---

## 七、项目哲学

> "差异化不是每样东西都要有差异。差异的目的是补足 OpenClaw 做不到的事。"

Equality 不是 OpenClaw 的重写版。它是：
- **Windows 原生**：系统通知、托盘、快捷键、右键菜单
- **中国特色**：国内 Provider、中文 system prompt、企业网络代理
- **桌面助理**：定时提醒、文件操作、进程管理 — 比聊天机器人更实用
- **能复用就复用**：browser tool 直接调 OpenClaw 的 browser server，不重新实现
