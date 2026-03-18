# Delta Spec: Gateway — 窗口模型变更

> 此为 [specs/gateway/spec.md](../../../specs/gateway/spec.md) 的差量规格。

---

## MODIFIED Requirements

### Requirement: Gateway 进程模型

> 变更部分：Tauri 启动 Gateway 子进程的场景

#### Scenario: Tauri 启动 Gateway 子进程（修改后）
- GIVEN Tauri 主进程启动
- WHEN 主窗口显示完成
- THEN Tauri SHALL 启动 `equality-core.exe` 子进程
- AND 等待 Gateway 在 18790 端口就绪（最多 10 秒）
- AND 就绪后在底部状态栏显示"● Core 在线"

（变更前：等待"系统托盘初始化完成"后启动。现在窗口直接可见，不再依赖托盘初始化。）

#### Scenario: 窗口关闭行为（新增）
- GIVEN 用户点击窗口标题栏的关闭按钮（✕）
- WHEN 前端收到 CloseRequested 事件
- THEN 窗口 SHALL 隐藏（hide），而非销毁（destroy）
- AND 进程继续在后台运行，系统托盘图标保持可见
- AND 用户可通过托盘左键单击恢复窗口

#### Scenario: 托盘恢复窗口（修改后）
- GIVEN 窗口处于隐藏状态
- WHEN 用户左键单击系统托盘图标
- THEN 窗口 SHALL 显示并获得焦点

（变更前：左键单击执行"toggle"——显示↔隐藏。现在改为单向"restore"。）

---

## REMOVED Requirements

### Requirement: 全局快捷键 Alt+Space

移除。标准窗口应用不需要全局热键呼出，用户通过任务栏或 Alt+Tab 切换到 Equality。

（原因：浮窗模式中 Alt+Space 是唯一的呼出方式；标准窗口模式中，系统已提供完善的窗口切换机制。）
