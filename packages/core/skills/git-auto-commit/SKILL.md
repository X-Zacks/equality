---
name: git-auto-commit
description: '自动化的 Git 提交和推送工作流：检查状态 → 暂存更改 → 生成提交信息 → 推送到远程。Use when: 用户在 Git 仓库中，想要快速提交并推送更改。NOT for: 仅查看状态或日志；非 Git 仓库操作；初次克隆仓库。'
user-invocable: true
equality:
  auto-generated: true
  source-model: MiniMax-M2.7-highspeed
  created: 2026-04-20
---

# Git Auto Commit

自动化的 Git 提交和推送工作流。

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `{{message}}` | 提交信息（可选，不填则自动生成） | 自动生成 |

## 执行步骤

### Step 1：检查 Git 状态

```bash
git status --short
```

确认当前目录是 Git 仓库且有待提交更改。

### Step 2：暂存更改

```bash
git add -A
```

### Step 3：生成提交信息

**用户提供了 `{{message}}`**：使用用户输入的消息。

**用户未提供**：运行脚本自动生成：
```bash
python scripts/auto_commit.py --path "{{当前目录}}"
```

### Step 4：执行提交

```bash
git commit -m "{{提交信息}}"
```

### Step 5：推送到远程

```bash
git push
```

如无远程仓库或推送失败，输出警告但不中断流程。

---

## 注意事项

- 脚本 `auto_commit.py` 使用 Git diff 和文件状态智能生成提交信息
- 首次使用需确保 `git config user.name` 和 `user.email` 已配置
- 推送前检查是否有拉取需求（可添加 `--rebase` 或 `--pull` 选项）
