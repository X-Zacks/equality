# Proposal: Phase Y — 工具体系补强

> 优先级：🔴 P0-P1  
> 关联：[equality-tool-enhancement-plan.md](../equality-tool-enhancement-plan.md)

## 意图

基于 Hermes Agent 源码扫描分析，Equality 作为**办公智能体**需要在以下关键维度补强：

1. **安全漏洞修复**（P0）：bash 沙箱仅对已知命令做路径检查，`python`/`node`/`curl` 等解释器命令可绕过路径隔离，读取 workspace 以外文件
2. **新增核心工具**（P1）：todo、image_generate(MiniMax)、memory 增强、read_image URL 支持
3. **基础设施补强**（P1-P2）：工具输出预算分层、Checkpoint 文件回滚、同形字攻击检测

## 范围

**本次实施（Phase Y）：**
- Y0: bash 沙箱安全增强 — 解释器命令路径泄露防护
- Y1.1: `todo` 工具 — 结构化任务列表
- Y1.2: `memory` 增强 — delete/list 操作
- Y1.3: `read_image` URL 支持 — 远程图像分析
- Y3.1: `image_generate` — MiniMax 图片生成

**后续 Phase Z（本次只写 Spec，不实施）：**
- Z1: 基础设施（Checkpoint、输出预算、同形字检测、危险命令白名单）
- Z2: MCP 集成、ask_user、HA
- Z3.1: execute_code

## 成功标准

- bash 沙箱能阻止 `python -c "open('/etc/passwd').read()"` 等解释器绕过
- MiniMax image_generate 工具能成功生成并保存图片
- todo 工具支持 write/read/clear，Session 持久化
- memory 新增 delete/list action
- read_image 支持 URL 图像分析
- TypeScript 编译零新增错误
