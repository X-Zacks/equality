@echo off
setlocal enabledelayedexpansion

:: Equality Dev Launcher
:: Window 1: Core service (Node.js Gateway)
:: Window 2: Tauri Dev (Vite + Rust)

:: -----------------------------------------------
:: Phase 0: Read .env.local
:: -----------------------------------------------

set CUSTOM_API_KEY=
set CUSTOM_BASE_URL=
set CUSTOM_MODEL=

if exist "%~dp0.env.local" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0.env.local") do (
        set "%%A=%%B"
    )
)

if "%CUSTOM_API_KEY%"=="" (
    echo [WARN] CUSTOM_API_KEY not set, Custom Provider unavailable
    echo        Create .env.local if needed
    echo        Copilot / DeepSeek / Qwen providers are not affected
    echo.
)

:: -----------------------------------------------
:: Phase 1: Environment checks
:: -----------------------------------------------

set TMPVER=%TEMP%\_equality_ver.tmp

echo.
echo ===============================================
echo   Equality Dev Environment Check
echo ===============================================

set ENV_FAIL=0

:: -- 1.1 Node.js --
set NODE_STATUS=[FAIL]
set "NODE_INFO=not installed"
node --version >"%TMPVER%" 2>nul
if errorlevel 1 goto :node_fail
set /p NODE_VER=<"%TMPVER%"
set "NODE_VER_NUM=%NODE_VER:v=%"
for /f "tokens=1 delims=." %%M in ("%NODE_VER_NUM%") do set NODE_MAJOR=%%M
if %NODE_MAJOR% geq 18 (
    set "NODE_STATUS=[OK]  "
    set "NODE_INFO=%NODE_VER%"
) else (
    set "NODE_STATUS=[WARN]"
    set "NODE_INFO=%NODE_VER% (need >= v18)"
)
goto :node_done
:node_fail
set ENV_FAIL=1
:node_done

:: -- 1.2 pnpm (note: pnpm is a .cmd, must use 'call') --
set PNPM_STATUS=[FAIL]
set "PNPM_INFO=not installed"
call pnpm --version >"%TMPVER%" 2>nul
if errorlevel 1 goto :pnpm_fail
set /p PNPM_VER=<"%TMPVER%"
set "PNPM_STATUS=[OK]  "
set "PNPM_INFO=v%PNPM_VER%"
goto :pnpm_done
:pnpm_fail
set ENV_FAIL=1
:pnpm_done

:: -- 1.3 Cargo/Rust --
set PATH=%PATH%;%USERPROFILE%\.cargo\bin
set CARGO_STATUS=[FAIL]
set "CARGO_INFO=not installed"
cargo --version >"%TMPVER%" 2>nul
if errorlevel 1 goto :cargo_fail
set /p CARGO_LINE=<"%TMPVER%"
set "CARGO_STATUS=[OK]  "
set "CARGO_INFO=%CARGO_LINE%"
goto :cargo_done
:cargo_fail
set ENV_FAIL=1
:cargo_done

:: -- 1.4 MSVC link.exe --
set MSVC_STATUS=[FAIL]
set "MSVC_INFO=not found"
set VCVARS_FOUND=0
set VS_INSTALLED_BUT_NO_CPP=0

where link.exe >nul 2>&1
if not errorlevel 1 (
    set "MSVC_STATUS=[OK]  "
    set "MSVC_INFO=link.exe in PATH"
    set VCVARS_FOUND=1
    goto :msvc_done
)

:: Try to find vcvarsall.bat via vswhere (works for any VS install location)
set VCVARS_PATH=
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if exist "%VSWHERE%" (
    for /f "tokens=*" %%P in ('"%VSWHERE%" -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul') do (
        if exist "%%P\VC\Auxiliary\Build\vcvarsall.bat" (
            set "VCVARS_PATH=%%P\VC\Auxiliary\Build\vcvarsall.bat"
        )
    )
    REM If vswhere exists but found no VC install, check if VS is installed without C++
    if "!VCVARS_PATH!"=="" (
        for /f "tokens=*" %%Q in ('"%VSWHERE%" -latest -property installationPath 2^>nul') do (
            set VS_INSTALLED_BUT_NO_CPP=1
        )
    )
)

:: Fallback: check well-known paths
if "%VCVARS_PATH%"=="" if exist "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" (
    set "VCVARS_PATH=C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
)
if "%VCVARS_PATH%"=="" if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" (
    set "VCVARS_PATH=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat"
)
if "%VCVARS_PATH%"=="" if exist "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvarsall.bat" (
    set "VCVARS_PATH=C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvarsall.bat"
)
if "%VCVARS_PATH%"=="" if exist "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvarsall.bat" (
    set "VCVARS_PATH=C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvarsall.bat"
)
if "%VCVARS_PATH%"=="" if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" (
    set "VCVARS_PATH=C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
)

:: Fallback 2: check if BuildTools dir exists but vcvarsall missing (incomplete install)
if "%VCVARS_PATH%"=="" if exist "C:\Program Files\Microsoft Visual Studio\2022\BuildTools" (
    set VS_INSTALLED_BUT_NO_CPP=1
)

if "%VCVARS_PATH%"=="" goto :msvc_try_install
echo [INFO] Loading MSVC build environment...
call "%VCVARS_PATH%" x64 >nul 2>&1
where link.exe >nul 2>&1
if errorlevel 1 goto :msvc_try_install
set "MSVC_STATUS=[OK]  "
set "MSVC_INFO=loaded via vcvarsall.bat"
set VCVARS_FOUND=1
goto :msvc_done

:msvc_try_install
echo.
if %VS_INSTALLED_BUT_NO_CPP% equ 1 (
    echo   [MSVC] Visual Studio / Build Tools IS installed, but C++ workload is MISSING.
    echo.
    echo   Fix: Open "Visual Studio Installer" and add the C++ workload:
    echo.
    echo     Option A - GUI:
    echo       1. Open Start Menu, search "Visual Studio Installer"
    echo       2. Click "Modify" on your Build Tools / VS installation
    echo       3. Check "Desktop development with C++"
    echo       4. Click "Modify" to install
    echo.
    echo     Option B - Command line (run as Administrator^):
    echo       "%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vs_installer.exe" modify --installPath "C:\Program Files\Microsoft Visual Studio\2022\BuildTools" --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --quiet
    echo.
    echo   After adding C++ workload, RESTART terminal and re-run dev.cmd.
    goto :msvc_not_found
)
echo   [MSVC] Visual Studio Build Tools not found.
echo          Tauri/Rust compilation requires MSVC C++ toolchain.
echo.
where winget >nul 2>&1
if errorlevel 1 goto :msvc_no_winget
echo   Auto-install available! This will download ~2GB and takes a few minutes.
echo.
set /p MSVC_CHOICE="   Install now via winget? (Y/n): "
if /i "%MSVC_CHOICE%"=="n" goto :msvc_not_found
if /i "%MSVC_CHOICE%"=="N" goto :msvc_not_found
echo.
echo   [INFO] Installing Visual Studio Build Tools with C++ workload...
echo          This may take several minutes, please wait...
echo.
:: Note: use separate --add flags to avoid quote-escaping issues in cmd
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
    echo.
    echo   [WARN] winget install returned an error. You may need to:
    echo          1. Run this terminal as Administrator
    echo          2. Or install manually: https://visualstudio.microsoft.com/visual-cpp-build-tools/
    goto :msvc_not_found
)
echo.
echo   [OK] Build Tools installed! Searching for vcvarsall.bat...
:: Re-scan after install
set VCVARS_PATH=
if exist "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" (
    set "VCVARS_PATH=C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
)
if "%VCVARS_PATH%"=="" goto :msvc_restart_needed
echo   [INFO] Loading MSVC build environment...
call "%VCVARS_PATH%" x64 >nul 2>&1
where link.exe >nul 2>&1
if errorlevel 1 goto :msvc_restart_needed
set "MSVC_STATUS=[OK]  "
set "MSVC_INFO=auto-installed via winget"
set VCVARS_FOUND=1
goto :msvc_done

:msvc_restart_needed
echo   [INFO] Build Tools installed but vcvarsall.bat not yet available.
echo          Please RESTART your terminal and re-run dev.cmd.
set "MSVC_INFO=installed, restart needed"
set ENV_FAIL=1
goto :msvc_done

:msvc_no_winget
echo   winget not available. Please install manually:
echo   https://visualstudio.microsoft.com/visual-cpp-build-tools/
echo   Select "Desktop development with C++" workload.

:msvc_not_found
set ENV_FAIL=1
:msvc_done

:: -- 1.5 node_modules --
set "DEPS_STATUS=[OK]  "
set "DEPS_INFO=installed"
if not exist "%~dp0node_modules" (
    echo [INFO] node_modules not found, running pnpm install...
    echo.
    call pnpm install
    if errorlevel 1 (
        set "DEPS_STATUS=[FAIL]"
        set "DEPS_INFO=pnpm install failed"
        set ENV_FAIL=1
    ) else (
        set "DEPS_INFO=auto-installed"
    )
)

:: -- Cleanup temp file --
del "%TMPVER%" >nul 2>&1

:: -- 1.6 Summary --
echo.
echo ===============================================
echo   %NODE_STATUS% Node.js    %NODE_INFO%
echo   %PNPM_STATUS% pnpm       %PNPM_INFO%
echo   %CARGO_STATUS% Cargo      %CARGO_INFO%
echo   %MSVC_STATUS% MSVC       %MSVC_INFO%
echo   %DEPS_STATUS% Deps       %DEPS_INFO%
echo ===============================================

if %ENV_FAIL% equ 0 goto :env_ok

echo.
echo [ERROR] Environment check failed. Please fix the following:
echo.
if "%NODE_STATUS%"=="[FAIL]" (
    echo   Node.js:  Install Node.js ^>= 18
    echo             https://nodejs.org/
    echo             or: winget install OpenJS.NodeJS.LTS
    echo.
)
if "%PNPM_STATUS%"=="[FAIL]" (
    echo   pnpm:     npm install -g pnpm
    echo             or: winget install pnpm.pnpm
    echo.
)
if "%CARGO_STATUS%"=="[FAIL]" (
    echo   Rust:     Install Rust toolchain
    echo             https://rustup.rs/
    echo             or: winget install Rustlang.Rustup
    echo.
)
if "%MSVC_STATUS%"=="[FAIL]" (
    echo   MSVC:     See detailed instructions above.
    echo             Most common fix: open "Visual Studio Installer" and add
    echo             "Desktop development with C++" workload.
    echo.
)
if "%DEPS_STATUS%"=="[FAIL]" (
    echo   Deps:     Run pnpm install manually to check errors
    echo.
)
echo Please fix issues above, then re-run dev.cmd
pause
exit /b 1

:env_ok
echo.
echo Environment check passed!
echo.

:: -----------------------------------------------
:: Phase 2: Kill old processes
:: -----------------------------------------------

taskkill /IM desktop.exe /F >nul 2>&1

for /f "tokens=5" %%P in ('netstat -aon ^| findstr ":18790 " 2^>nul') do (
    taskkill /PID %%P /F >nul 2>&1
)

:: -----------------------------------------------
:: Phase 2.5: Ensure Tauri resource placeholders
:: -----------------------------------------------
set "RES_DIR=%~dp0packages\desktop\src-tauri\resources"
if not exist "%RES_DIR%" mkdir "%RES_DIR%"
if not exist "%RES_DIR%\better-sqlite3.node" (
    echo [INFO] Creating placeholder for better-sqlite3.node...
    echo placeholder > "%RES_DIR%\better-sqlite3.node"
)
if not exist "%RES_DIR%\equality-core.exe" (
    echo [INFO] Creating placeholder for equality-core.exe...
    echo placeholder > "%RES_DIR%\equality-core.exe"
)

:: -----------------------------------------------
:: Phase 3: Start services
:: -----------------------------------------------

echo [1/2] Starting Core service (localhost:18790)...
:: Write a helper bat to avoid special-char quoting issues with start cmd /k
set "CORE_LAUNCHER=%TEMP%\_equality_core_launch.bat"
(
    echo @echo off
    echo set "CUSTOM_API_KEY=%CUSTOM_API_KEY%"
    echo set "CUSTOM_BASE_URL=%CUSTOM_BASE_URL%"
    echo set "CUSTOM_MODEL=%CUSTOM_MODEL%"
    echo cd /d "%~dp0"
    echo pnpm --filter @equality/core dev
) > "%CORE_LAUNCHER%"
start "Equality Core" cmd /k "%CORE_LAUNCHER%"

echo Waiting for Core to start...
:wait_core
timeout /t 1 /nobreak >nul
netstat -an | findstr ":18790 " >nul 2>&1
if errorlevel 1 goto wait_core
echo Core ready!

echo [2/2] Starting Tauri Dev...
start "Equality Desktop" cmd /k "cd /d %~dp0 && set PATH=%PATH%;%USERPROFILE%\.cargo\bin && pnpm --filter @equality/desktop tauri:dev"

echo.
echo All services started!
echo    Core  -^> http://localhost:18790/health
echo    UI    -^> Tauri window will open after compilation (first time takes a few minutes)
echo.
echo Press any key to close this window (services keep running in their own windows)
pause >nul
