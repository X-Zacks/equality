// gateway.rs — 管理 equality-core.exe 子进程
// dev 模式下这些函数不会被调用（由开发者手动运行 pnpm dev:core），
// release 模式下 cfg(not(debug_assertions)) 块会启用它们。
#![allow(dead_code)]

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager};

static GATEWAY_PROC: Mutex<Option<Child>> = Mutex::new(None);

#[allow(dead_code)]
const HEALTH_URL: &str = "http://127.0.0.1:18790/health";
const MAX_RETRIES: u32 = 3;
const POLL_INTERVAL_MS: u64 = 500;
const POLL_MAX_ATTEMPTS: u32 = 20; // 10 秒

/// 解析 equality-core.exe 所在路径：
///   1. EQUALITY_CORE_BIN 环境变量（dev 模式）
///   2. Tauri resource_dir（NSIS 安装版）
///   3. exe 同级 resources/ 子目录（Portable 便携版）
///   4. fallback: exe 同级目录
fn core_exe_path(app: &AppHandle) -> PathBuf {
    // 1. 环境变量（dev 模式）
    if let Ok(p) = std::env::var("EQUALITY_CORE_BIN") {
        return PathBuf::from(p);
    }
    // 2. Tauri resource_dir（NSIS 安装版）
    if let Ok(dir) = app.path().resource_dir() {
        let p = dir.join("equality-core.exe");
        if p.exists() { return p; }
    }
    // 3. exe 同级 resources/ 子目录（Portable zip 含子目录布局）
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("resources").join("equality-core.exe");
            if p.exists() { return p; }
        }
    }
    // 4. exe 同级目录（Portable 平铺布局，所有文件在同一目录）
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("equality-core.exe");
            if p.exists() { return p; }
        }
    }
    // 5. fallback
    PathBuf::from("equality-core.exe")
}

/// 启动 equality-core.exe，轮询 /health 直到就绪
pub fn start(app: &AppHandle) {
    let exe = core_exe_path(app);

    if !exe.exists() {
        eprintln!("[gateway] equality-core.exe not found: {}", exe.display());
        return;
    }

    match spawn_process(&exe) {
        Ok(child) => {
            *GATEWAY_PROC.lock().unwrap() = Some(child);
            if wait_until_ready() {
                println!("[gateway] core ready at {HEALTH_URL}");
            } else {
                eprintln!("[gateway] core did not become ready in time");
            }
        }
        Err(e) => eprintln!("[gateway] failed to spawn: {e}"),
    }
}

/// 停止 equality-core.exe
pub fn stop(_app: &AppHandle) {
    if let Some(mut child) = GATEWAY_PROC.lock().unwrap().take() {
        let _ = child.kill();
    }
}

/// 崩溃后重启（最多 MAX_RETRIES 次）
pub fn watch(app: &AppHandle) {
    let app = app.clone();
    let exe = core_exe_path(&app);
    std::thread::spawn(move || {
        let mut restarts = 0u32;
        loop {
            std::thread::sleep(Duration::from_secs(5));
            let exited = {
                let mut guard = GATEWAY_PROC.lock().unwrap();
                match guard.as_mut() {
                    Some(c) => matches!(c.try_wait(), Ok(Some(_))),
                    None => false,
                }
            };
            if exited {
                if restarts >= MAX_RETRIES {
                    eprintln!("[gateway] crashed {MAX_RETRIES} times, giving up");
                    break;
                }
                eprintln!("[gateway] crashed, restarting ({}/{})", restarts + 1, MAX_RETRIES);
                match spawn_process(&exe) {
                    Ok(child) => {
                        *GATEWAY_PROC.lock().unwrap() = Some(child);
                        wait_until_ready();
                        restarts += 1;
                    }
                    Err(e) => {
                        eprintln!("[gateway] restart failed: {e}");
                        break;
                    }
                }
            }
        }
    });
}

// ── helpers ──────────────────────────────────────────────────────────────────

fn spawn_process(exe: &PathBuf) -> std::io::Result<Child> {
    Command::new(exe).spawn()
}

fn wait_until_ready() -> bool {
    for _ in 0..POLL_MAX_ATTEMPTS {
        std::thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
        if ping_health() {
            return true;
        }
    }
    false
}

fn ping_health() -> bool {
    // 轻量级 TCP 探测，不依赖 reqwest（避免增大二进制体积）
    use std::net::TcpStream;
    TcpStream::connect("127.0.0.1:18790").is_ok()
}
