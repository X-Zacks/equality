# Tasks: Phase Z5-bugfixes

## B1: 工具配置卡布局

- [x] 1.1 Settings.tsx: 确保 Brave Search / Chrome 配置卡始终显示，不受分类 tab 切换影响
- [x] 1.2 验证：切换所有分类 tab 时配置卡始终可见

## B2: 黑色主题

- [x] 2.1 App.tsx: 将 className 改为 `theme-${effectiveTheme}` 动态映射
- [x] 2.2 验证：选择纯黑主题后 body 背景为 #000000，CSS 变量正确生效

## B3: 沙箱路径

- [x] 3.1 bash-sandbox.ts: checkInterpreterSafety 中绝对路径提取正则修复，避免从相对路径中误提取子路径
- [x] 3.2 验证：`python -m py_compile app/services/foo.py` 不再被误拦截
