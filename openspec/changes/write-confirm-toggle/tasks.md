# Tasks: Write Confirm Toggle

## 1. 后端

- [x] 1.1 index.ts: `enhancedBeforeToolCall` 中读取 `WRITE_CONFIRM_ENABLED`，值为 `'off'` 时跳过确认
- [x] 1.2 验证编译通过

## 2. 前端

- [x] 2.1 useGateway.ts: SecretKey 增加 `'WRITE_CONFIRM_ENABLED'`
- [x] 2.2 Settings.tsx: ToolDetailDrawer 为写工具（write_file/edit_file/replace_in_file/apply_patch）显示"写入确认"开关
- [x] 2.3 zh-CN.json / en.json: 添加 i18n 键
- [x] 2.4 验证编译通过

## 3. 验收

- [ ] 3.1 开关默认打开 → 写文件弹出确认
- [ ] 3.2 关闭开关 → 写文件自动执行
- [ ] 3.3 刷新后开关状态保持
