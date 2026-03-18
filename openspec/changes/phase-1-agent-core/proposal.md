# Proposal: Phase 1 — Agent Core Skeleton

## 意图

实现 equality 的 Agent Core 骨架——一个真正能调用 LLM、维护 Session、流式返回结果的后台服务。  
Phase 1 完成后，Phase 0 的悬浮窗就能与真正的 AI 对话。

## 背景

Phase 0 的 `equality-core.exe` 是一个 stub，只返回 Mock 文本。  
Phase 1 将其替换为完整的 Agent Core，实现：Session 管理、DeepSeek API 调用、流式输出。

## 做什么

1. Session Store（内存版 + JSON 文件持久化）
2. Agent Runner（`runAttempt`：用户消息 → LLM → 流式回复）
3. Gateway HTTP 服务（`/health`、`/chat/stream`、`/sessions`）
4. DeepSeek + 通义千问 Provider（OpenAI 兼容模式）
5. Model Fallback（主模型失败自动切换备用）
6. Cost Ledger（基础版：记录每次调用的 token 和费用）
7. 并发控制（per-SessionKey 串行队列）
8. Tauri 设置面板：API Key 配置（DPAPI 加密存储）

## 不做什么

- ❌ Tools（Phase 2 做）
- ❌ Skills（Phase 2 做）
- ❌ Compaction（Phase 3 做）
- ❌ 渠道适配器（Phase 4 做）
- ❌ RAG 记忆（Phase 5 做）
- ❌ 任务复杂度路由（Phase 5 做）

## 成功标准

- [ ] 用户在悬浮窗输入问题，看到 DeepSeek 的流式回复
- [ ] 关闭并重新打开悬浮窗，历史对话仍然存在（持久化）
- [ ] 模拟 DeepSeek API Key 错误，看到"配置错误"提示
- [ ] 设置面板可以配置 API Key，保存后立即生效（无需重启）
- [ ] 任务结束后，回复末尾显示 "💰 ¥0.0023 | 8,234 tokens"
