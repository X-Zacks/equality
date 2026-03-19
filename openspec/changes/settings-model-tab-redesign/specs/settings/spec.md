# Spec: 设置页「模型」Tab 重设计

## Requirements

### Requirement: Provider 列表行（固定高度）

设置页模型 Tab 的 Provider 区域 MUST 以固定行高列表展示所有 Provider，
行高 MUST 固定（48px），任何操作 MUST NOT 导致列表高度变化。

#### Scenario: 查看 Provider 状态
- GIVEN 用户打开设置页模型 Tab
- WHEN 页面加载完成
- THEN 所有 Provider SHALL 以单行形式显示，包含名称、状态标签、操作按钮
- AND 激活中的 Provider 行 SHALL 显示蓝色左边框
- AND 已配置但未激活的 Provider SHALL 显示绿色实心圆点状态标签
- AND 未配置的 Provider SHALL 显示灰色空心圆点状态标签

---

### Requirement: 抽屉面板配置

Provider 的详细配置 MUST 在抽屉面板（Drawer）中完成，
MUST NOT 在主列表中展开折叠。

#### Scenario: 打开配置抽屉
- GIVEN 用户看到 Provider 列表
- WHEN 用户点击某 Provider 的操作按钮（管理/配置）
- THEN 抽屉面板 SHALL 从设置页右侧滑入，动画时长 200ms
- AND 主列表 SHALL 保持不动，不发生任何高度变化
- AND 半透明遮罩 SHALL 覆盖主列表区域

#### Scenario: 关闭配置抽屉
- GIVEN 抽屉面板已打开
- WHEN 用户点击遮罩区域或右上角 × 按钮
- THEN 抽屉 SHALL 滑出关闭，不保存任何修改

#### Scenario: 保存配置
- GIVEN 抽屉面板已打开且用户填写了 API Key
- WHEN 用户点击「保存」按钮
- THEN 系统 SHALL 调用 saveApiKey 保存数据
- AND 抽屉 SHALL 关闭
- AND 对应 Provider 行的状态标签 SHALL 更新为「已配置」或「激活中」

---

### Requirement: 当前模型区域稳定性

模型选择下拉和 Auto 复选框所在区块 MUST 固定在列表顶部，
MUST NOT 因任何 Provider 配置操作而发生位移或高度变化。

#### Scenario: Provider 配置操作不影响模型选择
- GIVEN 用户选择了某个模型
- WHEN 用户打开任意 Provider 的配置抽屉
- THEN 模型选择下拉 SHALL 保持原位，不发生位移
- AND 已选模型 SHALL 不变

---

### Requirement: Copilot 登录流程集成到抽屉

Copilot 的 Device Flow 登录流程 MUST 在抽屉面板内完成。

#### Scenario: Copilot 未登录时打开抽屉
- GIVEN Copilot 未登录
- WHEN 用户点击 Copilot 行的「登录 GitHub」按钮
- THEN 抽屉 SHALL 打开并显示 Device Flow 验证码和等待状态
- AND 登录成功后抽屉 SHALL 自动更新为已登录状态
