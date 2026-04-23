# Tasks: 设置页「模型」Tab 重设计

## Phase 1：Provider 列表行

- [x] **1.1** `Settings.tsx` — 新增 `ProviderRow` 组件  
  固定行高 48px，包含：图标、名称、状态标签、操作按钮  
  状态标签逻辑：激活中（蓝）/ 已配置（绿）/ 未配置（灰）

- [x] **1.2** `Settings.css` — 新增 `.provider-list`、`.provider-row`、`.provider-row-active` 样式  
  激活行左侧 2px 蓝色边框，行 hover 轻微高亮

- [x] **1.3** `Settings.tsx` — 用 `ProviderRow` 列表替换现有折叠面板  
  保留所有现有业务逻辑（saveApiKey / deleteKey / refresh）

## Phase 2：抽屉面板

- [x] **2.1** `Settings.tsx` — 新增 `ProviderDrawer` 组件  
  props: `provider | null`（null = 关闭），`onClose`，`onSaved`  
  包含：标题栏（图标+名称+×）、内容区、底部操作栏（清除+保存）

- [x] **2.2** `Settings.css` — 新增抽屉动画样式  
  `translateX(100%)` → `translateX(0)`，200ms ease-out  
  半透明遮罩 `.drawer-mask`

- [x] **2.3** `Settings.tsx` — 各 Provider 抽屉内容实现  
  - 普通 Provider：API Key 输入框 + 获取链接  
  - 自定义端点：API Key + Base URL + Model 三字段  
  - Copilot：迁移现有 Device Flow 登录 UI

- [x] **2.4** `Settings.tsx` — 连接抽屉与列表状态  
  保存成功后调用 `refresh()`，列表状态自动更新

## Phase 3：收尾

- [x] **3.1** 删除现有折叠面板相关 CSS（`.provider-card`、`.provider-body` 等不再使用的样式）

- [x] **3.2** 验证所有 Provider 的保存/清除/激活流程正常

- [x] **3.3** 验证 Copilot 登录/退出流程在抽屉内正常工作
