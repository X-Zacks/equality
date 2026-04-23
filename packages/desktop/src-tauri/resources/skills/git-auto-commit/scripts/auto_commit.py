#!/usr/bin/env python3
"""
Git Auto Commit - 智能生成提交信息并执行提交推送
"""
import argparse
import os
import subprocess
import re
from datetime import datetime


def run_cmd(cmd, cwd=None):
    """执行命令并返回输出"""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding='utf-8'
        )
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except Exception as e:
        return "", str(e), 1


def get_git_status(path):
    """获取 Git 状态"""
    stdout, _, code = run_cmd("git status --short", cwd=path)
    if code != 0:
        return None
    return stdout


def get_git_diff(path):
    """获取变更统计"""
    stdout, _, _ = run_cmd("git diff --stat", cwd=path)
    if not stdout:
        stdout, _, _ = run_cmd("git diff --cached --stat", cwd=path)
    return stdout


def parse_changed_files(status_output):
    """解析变更文件"""
    added = []
    modified = []
    deleted = []
    renamed = []
    
    for line in status_output.split('\n'):
        if not line:
            continue
        # 解析 git status --short 格式: XY filename
        if len(line) >= 3:
            status = line[:2]
            filename = line[3:].strip()
            
            if status[0] == '?' or status[0] == 'A' or status[1] == 'A':
                added.append(filename)
            elif status[0] == 'D' or status[1] == 'D':
                deleted.append(filename)
            elif status[0] == 'R' or status[1] == 'R':
                renamed.append(filename)
            else:
                modified.append(filename)
    
    return {
        'added': added,
        'modified': modified,
        'deleted': deleted,
        'renamed': renamed
    }


def guess_commit_type(changes):
    """根据变更猜测提交类型"""
    total = (len(changes['added']) + len(changes['modified']) + 
             len(changes['deleted']) + len(changes['renamed']))
    
    if total == 0:
        return "chore", "update"
    
    # 根据文件扩展名猜测
    all_files = (changes['added'] + changes['modified'] + 
                 changes['renamed'])
    
    has_py = any(f.endswith('.py') for f in all_files)
    has_js = any(f.endswith(('.js', '.ts', '.jsx', '.tsx')) for f in all_files)
    has_md = any(f.endswith('.md') for f in all_files)
    has_config = any('config' in f.lower() or 'package' in f.lower() 
                     for f in all_files)
    
    if has_config and total < 3:
        return "chore", "config"
    elif has_py:
        return "feat", "python"
    elif has_js:
        return "feat", "javascript"
    elif has_md and total < 2:
        return "docs", "documentation"
    else:
        return "update", "changes"


def generate_commit_message(changes):
    """生成提交信息"""
    commit_type, default_msg = guess_commit_type(changes)
    
    total = (len(changes['added']) + len(changes['modified']) + 
             len(changes['deleted']) + len(changes['renamed']))
    
    # 生成描述
    parts = []
    
    if changes['added']:
        count = len(changes['added'])
        suffix = "s" if count > 1 else ""
        parts.append(f"add {count} file{suffix}")
    
    if changes['modified']:
        count = len(changes['modified'])
        suffix = "s" if count > 1 else ""
        parts.append(f"modify {count} file{suffix}")
    
    if changes['deleted']:
        count = len(changes['deleted'])
        suffix = "s" if count > 1 else ""
        parts.append(f"delete {count} file{suffix}")
    
    if changes['renamed']:
        count = len(changes['renamed'])
        suffix = "s" if count > 1 else ""
        parts.append(f"rename {count} file{suffix}")
    
    if parts:
        desc = ", ".join(parts)
    else:
        desc = "update files"
    
    # 简化提交类型
    if commit_type == "chore" and "config" in default_msg:
        emoji = "🔧"
        title = "chore"
    elif commit_type == "docs":
        emoji = "📝"
        title = "docs"
    elif commit_type == "feat":
        emoji = "✨"
        title = "feat"
    else:
        emoji = "📦"
        title = "update"
    
    message = f"{emoji} {title}: {desc}"
    
    return message


def get_branch_name(path):
    """获取当前分支名"""
    stdout, _, _ = run_cmd("git rev-parse --abbrev-ref HEAD", cwd=path)
    return stdout if stdout else "unknown"


def has_remote(path):
    """检查是否有远程仓库"""
    stdout, _, _ = run_cmd("git remote -v", cwd=path)
    return bool(stdout)


def main():
    parser = argparse.ArgumentParser(description='Git Auto Commit')
    parser.add_argument('--path', default='.', help='Git 仓库路径')
    parser.add_argument('--message', '-m', default=None, help='自定义提交信息')
    parser.add_argument('--dry-run', action='store_true', help='仅显示将要执行的操作')
    args = parser.parse_args()
    
    # 转为绝对路径
    path = os.path.abspath(args.path)
    
    # 检查是否是 Git 仓库
    status = get_git_status(path)
    if status is None:
        print(f"❌ 错误: {path} 不是 Git 仓库")
        return 1
    
    if not status:
        print("📋 工作区干净，无需提交")
        return 0
    
    # 解析变更
    changes = parse_changed_files(status)
    
    # 显示变更
    print("📊 变更概览:")
    if changes['added']:
        print(f"   ➕ 新增: {', '.join(changes['added'])}")
    if changes['modified']:
        print(f"   ✏️  修改: {', '.join(changes['modified'])}")
    if changes['deleted']:
        print(f"   🗑️  删除: {', '.join(changes['deleted'])}")
    if changes['renamed']:
        print(f"   📝 重命名: {', '.join(changes['renamed'])}")
    print()
    
    # 生成或使用用户消息
    if args.message:
        message = args.message
    else:
        message = generate_commit_message(changes)
    
    branch = get_branch_name(path)
    has_remotes = has_remote(path)
    
    print(f"🌿 分支: {branch}")
    print(f"📨 提交信息: {message}")
    print()
    
    if args.dry_run:
        print("🔍 模拟运行，实际不会执行提交")
        return 0
    
    # 执行 git add
    print("📦 暂存所有更改...")
    _, err, code = run_cmd("git add -A", cwd=path)
    if code != 0:
        print(f"❌ 暂存失败: {err}")
        return 1
    
    # 执行 git commit
    print("✅ 提交更改...")
    _, err, code = run_cmd(f'git commit -m "{message}"', cwd=path)
    if code != 0:
        print(f"❌ 提交失败: {err}")
        return 1
    
    print("✅ 提交成功!")
    
    # 执行 git push
    if has_remotes:
        print("🚀 推送到远程...")
        _, err, code = run_cmd("git push", cwd=path)
        if code != 0:
            print(f"⚠️ 推送失败: {err}")
            print("   提交已成功，可以在合适的时候手动推送")
            return 1
        print("✅ 推送成功!")
    else:
        print("⚠️ 未配置远程仓库，跳过推送")
        print("   添加远程仓库: git remote add origin <url>")
    
    return 0


if __name__ == "__main__":
    exit(main())
