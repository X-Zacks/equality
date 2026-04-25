# Proposal: Write Confirm Toggle

## 意图

当前 write_file / edit_file / replace_in_file / apply_patch 四个写工具执行后，会弹出 Diff 预览，用户必须点击 Accept/Reject 才能继续。这在批量生成多个文件时严重拖慢流程——用户需要逐个点击 Accept。

## 目标

在工具详情右侧抽屉（ToolDetailDrawer）中，为 write_file 等写工具添加一个"写入前确认"开关：

- **开关打开（默认）**：维持现有行为，写入前需要 Accept/Reject
- **开关关闭**：write_file 执行后自动放行，无需用户确认

## 范围

- 前端：Settings.tsx — ToolDetailDrawer 组件
- 前端：useGateway.ts — SecretKey 类型
- 前端：i18n 翻译
- 后端：index.ts — enhancedBeforeToolCall 读取配置决定是否等待确认
- 配置键：`WRITE_CONFIRM_ENABLED`，默认 `on`

## 非范围

- 不改变 DiffPreview 组件本身
- 不改变 beforeToolCall 的安全检查逻辑
- 不影响 read_file 等非写工具
