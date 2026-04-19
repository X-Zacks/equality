# Design: Phase Z3

## Z3.1 MiniMax-M2.7-highspeed

在 `core/src/index.ts` 的 `/models` 路由中，MiniMax 区块增加一行：
```ts
models.push({ value: 'minimax/MiniMax-M2.7-highspeed', label: 'MiniMax M2.7 Highspeed', provider: 'minimax', multiplier: 1 })
```

同时更新 `Settings.tsx` 中 MiniMax 的 label 描述。

## Z3.2 TTS 自动播报

**策略**：在 `sendMessage` 的 `onDone` 回调中，回复完成后自动调用 `speakMessage`。

**状态**：
```ts
const [ttsAutoPlay, setTtsAutoPlay] = useState(true) // 默认开启
```

增加全局开关按钮在输入框区域（🔊/🔇 切换），让用户可快速切换自动播报。

**触发时机**：
- `handleSend` → `sendMessage` → `onDone` 回调中，若 `ttsAutoPlay` 为 true，自动调用 `speakMessage(final, newIdx)`
- 同样适用于 retry 场景

## Z3.3 TTS 内容过滤

在 `speakMessage` 的文本清理逻辑中增加：

```ts
// 去除表情符号 (Unicode emoji ranges)
.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '')
// 去除 token 统计行 (如 "共使用 xxx tokens" / "Token usage:" 等)
.replace(/(?:token|tokens|Token|Tokens|消耗|使用了?|共计|总计|输入|输出|令牌).*(?:\d+[,.]?\d*).*/gi, '')
// 去除括号内的技术描述
.replace(/[（(].*?(?:token|tokens|令牌|消耗).*?[）)]/gi, '')
```

## Z3.4 Eigent UI 分析

产出 `docs/eigent-ui-analysis.md`，包含：
- 技术栈对比
- 色彩体系分析（色值）
- 组件样式对比
- 具体改进建议（高/中/低优先级）
