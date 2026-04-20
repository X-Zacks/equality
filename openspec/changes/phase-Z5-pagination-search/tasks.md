# Tasks: Phase Z5-pagination-search

## P1 + P2: 工具列表分页与搜索

- [ ] 1.1 Settings.tsx: 添加 `toolSearch` state 和搜索框 UI
- [ ] 1.2 Settings.tsx: 添加 `toolPage` state 和分页逻辑（PAGE_SIZE=20）
- [ ] 1.3 Settings.tsx: 工具列表渲染改为 `pagedTools.map()`
- [ ] 1.4 Settings.tsx: 底部分页导航 UI
- [ ] 1.5 Settings.tsx: 分类/搜索变化时重置页码
- [ ] 1.6 验证：搜索 "file" 只显示文件相关工具，分页正确翻页

## P3 + P4: Skills 列表分页与搜索

- [ ] 2.1 Settings.tsx: 添加 `skillSearch` state 和搜索框 UI
- [ ] 2.2 Settings.tsx: 添加 `skillPage` state 和分页逻辑（PAGE_SIZE=20）
- [ ] 2.3 Settings.tsx: Skills 列表渲染改为分页
- [ ] 2.4 Settings.tsx: 底部分页导航 UI
- [ ] 2.5 验证：搜索按名称+描述+body 模糊匹配，分页正确翻页

## 样式

- [ ] 3.1 Settings.css: 添加 `.search-bar`、`.pagination` 样式
