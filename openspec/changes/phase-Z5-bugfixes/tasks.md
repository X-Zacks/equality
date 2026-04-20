# Tasks: Phase Z5-bugfixes

## B1: 工具配置卡布局

- [ ] 1.1 Settings.tsx: 确保 Brave Search / Chrome 配置卡始终显示，不受分类 tab 切换影响
- [ ] 1.2 验证：切换所有分类 tab 时配置卡始终可见

## B2: 黑色主题

- [ ] 2.1 App.tsx: 将 className 改为 `theme-${effectiveTheme}` 动态映射
- [ ] 2.2 验证：选择纯黑主题后 body 背景为 #000000，CSS 变量正确生效

## B3: 沙箱路径

- [ ] 3.1 sandbox.ts: workspaceDir 在比较前也做 realpathSync 规范化
- [ ] 3.2 验证：bash 工具能正确访问 workspace 目录下的文件
