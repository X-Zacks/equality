use tauri::{AppHandle, Manager};

/// 恢复窗口到前台（托盘单击、菜单"显示"时调用）
pub fn restore(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// 隐藏窗口到托盘（点击 ✕ 时调用，窗口不销毁）
pub fn hide(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}
