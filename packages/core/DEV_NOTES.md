# Core 开发备忘录

## ⚠️ 终端操作注意事项

### 1. 不要用 `Stop-Process -Name node` 杀进程

`Get-Process -Name node | Stop-Process -Force` 会杀掉**所有** Node 进程，包括刚启动的 dev server。

**正确做法**：按端口精确杀：

```powershell
# 查看占用 18790 端口的进程
netstat -ano | findstr :18790

# 杀掉指定 PID
Stop-Process -Id <PID> -Force
```

或者直接在运行 server 的终端里按 `Ctrl+C`。

### 2. 启动 dev server 必须在 `packages/core` 目录下

```powershell
Set-Location c:\software\equality\packages\core
