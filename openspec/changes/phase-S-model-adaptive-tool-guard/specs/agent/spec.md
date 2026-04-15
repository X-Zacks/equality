# Delta Spec: Agent Answer Evidence Guard

> Phase: S  
> 领域: agent (runner)

## ADDED Requirements

### Requirement: 事实断言证据类别定义

系统 MUST 定义以下事实断言证据类别（Evidence Category）：

| 类别 | 标识 | 说明 |
|---|---|---|
| Git 状态 | `git_status` | 已推送/未推送/已提交/已合并 |
| 文件改动 | `file_change` | 已写入/已修改/已创建/已删除 |
| 命令执行 | `command_result` | 已执行/执行成功/执行完成 |
| 编译测试 | `compile_result` | 编译通过/测试通过/编译失败 |
| 服务状态 | `service_status` | 服务已启动/端口可访问/服务已停止 |

#### Scenario: 正确分类 Git 状态断言
- GIVEN 模型回答包含"代码已经推送到远端"
- WHEN 证据守卫进行断言检测
- THEN 检测到证据类别为 `git_status`

#### Scenario: 正确分类编译结果断言
- GIVEN 模型回答包含"编译通过，没有错误"
- WHEN 证据守卫进行断言检测
- THEN 检测到证据类别为 `compile_result`

#### Scenario: 不误判纯语言表达
- GIVEN 模型回答包含"我建议你推送到 git"
- WHEN 证据守卫进行断言检测
- THEN 不检测到任何事实断言

---

### Requirement: 证据类别与工具映射

系统 MUST 维护证据类别到工具名称的映射表，用于判断本轮是否有对应证据：

| 证据类别 | 可提供证据的工具 |
|---|---|
| `git_status` | `bash` (含 git 命令) |
| `file_change` | `write_file`, `edit_file`, `apply_patch`, `bash` |
| `command_result` | `bash` |
| `compile_result` | `bash` |
| `service_status` | `bash`, `web_fetch` |

系统 SHOULD 对 `bash` 工具做进一步匹配：仅当 bash 执行了与断言类别相关的命令时，才认为有证据。

#### Scenario: bash + git 命令提供 git_status 证据
- GIVEN 本轮 executedToolNames 包含 `bash`
- AND 本轮工具消息中包含 `git status` 或 `git log` 的执行结果
- WHEN 检查 `git_status` 类别的证据
- THEN 判定为有证据

#### Scenario: 仅有 read_file 不提供 file_change 证据
- GIVEN 本轮 executedToolNames 仅包含 `read_file`
- WHEN 检查 `file_change` 类别的证据
- THEN 判定为无证据

---

### Requirement: 无证据断言的回答改写

当模型回答中包含事实性断言，但本轮没有匹配的工具证据时，系统 MUST 对回答进行改写。

改写策略：
1. 保留原回答的非断言部分
2. 在回答末尾追加证据缺失提示
3. 提示内容 SHOULD 包含：缺失的证据类别、建议的检查操作

#### Scenario: 无证据的 Git 状态断言被改写
- GIVEN 模型回答"代码已经推送到远端了"
- AND 本轮 executedToolNames 为空集
- WHEN 证据守卫执行
- THEN 回答被改写，追加"⚠️ 我尚未实际检查 Git 状态，以上关于推送状态的判断可能不准确。需要我帮你检查一下吗？"

#### Scenario: 有证据的断言不被改写
- GIVEN 模型回答"根据 git status 检查结果，代码已经推送到远端"
- AND 本轮 executedToolNames 包含 `bash`
- AND bash 结果包含 git 相关输出
- WHEN 证据守卫执行
- THEN 回答不被改写，原样输出

#### Scenario: 多类别断言部分有证据
- GIVEN 模型回答包含 file_change 断言和 git_status 断言
- AND 本轮执行了 write_file 但未执行 git 相关命令
- WHEN 证据守卫执行
- THEN 仅对 git_status 部分追加证据缺失提示

---

### Requirement: 守卫执行位置

证据守卫 MUST 在以下位置执行：

1. 在 `guardUnsupportedSuccessClaims`（已有的执行证据守卫）之后
2. 在 Interactive Payload 检测（Phase F1）之前
3. 在 `contextEngine.afterTurn` 之前

即：现有执行证据守卫拦截"根本没调工具"的硬性违规，新守卫补充拦截"调了工具但证据不匹配断言"的软性违规。

#### Scenario: 守卫链正确串联
- GIVEN runner 生成最终回答
- WHEN 执行后处理链
- THEN 先执行 guardUnsupportedSuccessClaims，再执行 guardUnverifiedClaims

---

## MODIFIED Requirements

### Requirement: guardUnsupportedSuccessClaims 职责边界

现有的 `guardUnsupportedSuccessClaims` 保持不变，继续负责：
- 完全没有工具调用却宣称"已执行"
- 没有写工具却宣称"已修改文件"
- 没有 bash 却输出伪终端记录

新增的 `guardUnverifiedClaims` 负责：
- 有工具调用但证据类别不匹配
- 模型从上下文推测状态但未实际核验
