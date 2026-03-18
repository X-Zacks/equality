@echo off
setlocal

:: ──────────────────────────────────────────────
:: Equality Dev Launcher
:: 窗口1: Core 服务 (Node.js Gateway)
:: 窗口2: Tauri Dev (Vite + Rust)
:: ──────────────────────────────────────────────

:: 读取 .env.local（如果存在），否则用默认值
set CUSTOM_API_KEY=
set CUSTOM_BASE_URL=
set CUSTOM_MODEL=

if exist "%~dp0.env.local" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0.env.local") do (
        set %%A=%%B
    )
)

:: 校验：Custom Provider 未配置时仅警告（Copilot 不依赖此项）
if "%CUSTOM_API_KEY%"=="" (
    echo [WARN] CUSTOM_API_KEY 未设置，Custom Provider 不可用
    echo        如需使用，请创建 .env.local 文件
    echo        Copilot / DeepSeek / Qwen 等 Provider 不受影响
    echo.
)

:: 添加 Cargo 到 PATH
set PATH=%PATH%;%USERPROFILE%\.cargo\bin

:: 停止旧的 desktop.exe（Tauri 编译前必须释放文件锁）
taskkill /IM desktop.exe /F >nul 2>&1

:: 停止已有 Node 占用的 18790 端口
for /f "tokens=5" %%P in ('netstat -aon ^| findstr ":18790 " 2^>nul') do (
    taskkill /PID %%P /F >nul 2>&1
)

echo [1/2] 启动 Core 服务 (localhost:18790)...
start "Equality Core" cmd /k "cd /d %~dp0 && set CUSTOM_API_KEY=%CUSTOM_API_KEY% && set CUSTOM_BASE_URL=%CUSTOM_BASE_URL% && set CUSTOM_MODEL=%CUSTOM_MODEL% && pnpm --filter @equality/core dev"

:: 等待 Core 就绪（轮询端口）
echo 等待 Core 启动...
:wait_core
timeout /t 1 /nobreak >nul
netstat -an | findstr ":18790 " >nul 2>&1
if errorlevel 1 goto wait_core
echo Core 已就绪 ✓

echo [2/2] 启动 Tauri Dev...
start "Equality Desktop" cmd /k "cd /d %~dp0 && pnpm --filter @equality/desktop tauri:dev"

echo.
echo ✅ 所有服务已启动
echo    Core  → http://localhost:18790/health
echo    UI    → Tauri 窗口编译完成后自动弹出（首次需要几分钟）
echo.
echo 按任意键关闭此窗口（服务继续在各自窗口运行）
pause >nul
