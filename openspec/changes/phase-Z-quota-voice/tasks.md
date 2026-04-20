# Tasks: Phase Z — 配额设置 UI + 语音输入

## Z1: 配额设置 UI

- [x] Z1.1 后端：在 `index.ts` 新增 `DELETE /quota` 路由
- [x] Z1.2 前端：在 Settings.tsx 配额状态卡片右侧添加编辑/删除按钮
- [x] Z1.3 前端：添加「+ 添加配额规则」按钮和内联表单（provider/tier/monthlyLimit/warnPct/criticalPct/autoDowngrade）
- [x] Z1.4 前端：表单提交调用 `PUT /quota`，删除调用 `DELETE /quota`，操作后刷新列表

## Z2: 语音输入

- [x] Z2.1 在 Chat.tsx 添加 `isListening` 状态和 `toggleVoice` 函数
- [x] Z2.2 在输入区添加麦克风按钮（📎 和 textarea 之间）
- [x] Z2.3 在 SessionPanel.css 添加 `.voice-btn` 和 `.listening` 动画样式
- [x] Z2.4 处理 SpeechRecognition 不可用时的降级提示

## 验证

- [x] V1 TypeScript 编译零新增错误
- [x] V2 提交 Git 并推送
