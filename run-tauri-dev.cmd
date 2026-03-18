@echo off
set PATH=%PATH%;%USERPROFILE%\.cargo\bin
cd /d "%~dp0"
pnpm --filter @equality/desktop tauri:dev
