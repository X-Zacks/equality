# Phase I 提案：多角色与诊断

## 动机

Phase G/H 完成后，Equality Core 已具备项目感知、安全包装、上下文守卫、孤儿恢复、SQLite 存储、Key 轮换、持久化守卫。但仍缺少：

1. **工具没有元数据和分组**——无法按场景（编码/消息/最小）动态调整可用工具集
2. **所有 session 共享同一配置**——无法为不同角色定义不同 Agent 身份/模型/工具
3. **无统一安全检查报告**——用户无法一键检查当前配置的安全状况
4. **无结构化 LLM 调用追踪**——排查"为什么 LLM 给了错误回答"极其困难

## 范围

| ID | 名称 | GAP | 优先级 |
|----|------|-----|--------|
| I1 | Tool Catalog & Profiles | GAP-21 | P2 |
| I2 | Agent Scoping | GAP-24 | P2 |
| I3 | Security Audit | GAP-22 | P3 |
| I4 | Cache Trace | GAP-23 | P3 |

## 非目标

- Channel 系统（Equality 是桌面应用）
- Gateway 分布式探测（单机架构）
- Docker/SSH 沙箱审计（Windows 桌面不普及）
- Auth profiles / 设备配对（单用户桌面应用）

## 成功标准

- I1: 工具目录支持 4 种 profile（minimal/coding/messaging/full），按 section 分组
- I2: 配置文件可定义多 Agent，session key 自动匹配 Agent 配置
- I3: `/security-audit` 命令输出结构化安全报告（info/warn/critical 三级）
- I4: 环境变量开启后，每次 LLM 调用记录 7 阶段 JSONL 追踪
- 新增测试 ≥ 60 个断言
- tsc --noEmit 零错误
- 现有 343 个断言无回归
