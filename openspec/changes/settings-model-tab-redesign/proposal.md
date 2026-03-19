# Proposal: 设置页「模型」Tab 重设计

## 背景

当前「模型」Tab 将两个性质不同的操作混在一起：
- **模型选择**（当前对话用哪个模型）
- **Provider 配置**（给各服务商填 API Key）

使用折叠面板（Accordion）承载 Provider 配置，存在以下问题：
1. 展开某个 Provider 后页面高度变化，其他内容被推走，视觉跳动
2. 多个 Provider 同时展开时相互遮挡，难以对比状态
3. 激活状态用"优先"badge + 绿点 + active-dot 三套视觉语言，含义不统一
4. 用户想"选模型"却被迫看到大量配置细节，认知负担重

## 目标

1. **模型选择区域始终稳定**，不受 Provider 配置操作影响
2. **Provider 列表一屏全览**，状态一眼可知
3. **配置细节在独立空间操作**（抽屉面板），不污染主列表
4. **激活状态统一视觉语言**

## 范围

- `packages/desktop/src/Settings.tsx` — 模型 Tab 重构
- `packages/desktop/src/Settings.css` — 新增抽屉、列表行样式
- 不改动 Core 后端接口
- 不改动其他 Tab（工具、Skills、高级、关于）
