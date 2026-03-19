mod gateway;
mod proxy;
mod tray;
mod window;

use tauri::Manager;

/// 写入临时文件（用于前端剪贴板图片粘贴）
#[tauri::command]
fn write_temp_file(data: Vec<u8>, filename: String) -> Result<String, String> {
    let dir = std::env::temp_dir().join("equality-paste");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&filename);
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // 1. 系统托盘
            tray::setup(app.handle())?;

            // 2. 启动 Gateway 进程（dev 模式跳过，由开发者手动运行 pnpm dev:core）
            #[cfg(not(debug_assertions))]
            {
                gateway::start(app.handle());
                gateway::watch(app.handle());
            }

            // 3. 后台 SSE 监听 Core 通知事件 → 弹系统通知（Phase 4: Cron 提醒）
            proxy::start_notification_listener(app.handle().clone());

            Ok(())
        })
        // 窗口事件：点击 ✕ 时隐藏而非关闭
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                crate::window::hide(window.app_handle());
            }
        })
        // Tauri 命令：前端通过 invoke() 调用
        .invoke_handler(tauri::generate_handler![
            proxy::core_health,
            proxy::chat_stream,
            proxy::abort_chat,
            proxy::persist_session,
            proxy::get_settings,
            proxy::save_api_key,
            proxy::delete_key,
            proxy::copilot_login,
            proxy::copilot_login_status,
            proxy::copilot_logout,
            proxy::copilot_models,
            write_temp_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Equality");
}
