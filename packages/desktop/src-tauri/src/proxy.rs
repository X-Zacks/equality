use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

const GATEWAY: &str = "http://localhost:18790";

/// 检查 Core 服务是否在线
#[tauri::command]
pub async fn core_health() -> bool {
    let url = format!("{}/health", GATEWAY);
    reqwest::get(&url).await.map(|r| r.status().is_success()).unwrap_or(false)
}

/// 发送消息，通过 Tauri event 推流 SSE 回前端
/// event: "chat-delta" → { type, content?, message?, usage? }
#[tauri::command]
pub async fn chat_stream(app: AppHandle, message: String, session_key: Option<String>, model: Option<String>) -> Result<(), String> {
    let client = reqwest::Client::new();
    let sk = session_key.clone().unwrap_or_default();
    let mut body = serde_json::json!({
        "message": message,
    });
    if let Some(key) = session_key {
        body["sessionKey"] = serde_json::Value::String(key);
    }
    if let Some(m) = model {
        body["model"] = serde_json::Value::String(m);
    }

    let resp = client
        .post(format!("{}/chat/stream", GATEWAY))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("连接 Core 失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Core 返回 HTTP {}", resp.status()));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = match chunk {
            Ok(b) => b,
            Err(e) => {
                // 网络中断时发 error 事件让前端感知，避免 hang 住
                let _ = app.emit("chat-delta", serde_json::json!({
                    "type": "error",
                    "message": format!("网络连接中断: {}", e),
                    "sessionKey": sk
                }));
                break;
            }
        };
        buf.push_str(&String::from_utf8_lossy(&bytes));

        // 按行处理 SSE
        loop {
            if let Some(pos) = buf.find('\n') {
                let line = buf[..pos].trim().to_string();
                buf = buf[pos + 1..].to_string();

                if let Some(json_str) = line.strip_prefix("data: ") {
                    let json_str = json_str.trim();
                    if json_str.is_empty() { continue; }
                    // 解析为 Value 再 emit，避免前端收到双重序列化的字符串
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                        let _ = app.emit("chat-delta", val);
                    }
                }
            } else {
                break;
            }
        }
    }

    Ok(())
}

/// 中止当前正在进行的 chat 请求（借鉴 OpenClaw chat.abort RPC）
#[tauri::command]
pub async fn abort_chat(session_key: Option<String>) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let mut body = serde_json::json!({});
    if let Some(key) = session_key {
        body["sessionKey"] = serde_json::Value::String(key);
    }
    let resp = client
        .post(format!("{}/chat/abort", GATEWAY))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("abort_chat failed: {}", e))?;
    resp.json().await.map_err(|e| format!("abort_chat parse failed: {}", e))
}

/// 暂停时主动持久化 session（防止进程重启后丢失已完成的工具执行结果）
#[tauri::command]
pub async fn persist_session(session_key: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/sessions/{}/persist", GATEWAY, session_key))
        .send()
        .await
        .map_err(|e| format!("persist_session failed: {}", e))?;
    resp.json().await.map_err(|e| format!("persist_session parse failed: {}", e))
}

/// GET /settings
#[tauri::command]
pub async fn get_settings() -> serde_json::Value {
    let url = format!("{}/settings", GATEWAY);
    match reqwest::get(&url).await {
        Ok(r) => r.json().await.unwrap_or(serde_json::json!({ "configured": [], "activeProvider": null })),
        Err(_) => serde_json::json!({ "configured": [], "activeProvider": null }),
    }
}

/// POST /settings/api-key
#[tauri::command]
pub async fn save_api_key(provider: String, key: String) -> bool {
    let client = reqwest::Client::new();
    let url = format!("{}/settings/api-key", GATEWAY);
    client
        .post(&url)
        .json(&serde_json::json!({ "provider": provider, "key": key }))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// DELETE /settings/:key
#[tauri::command]
pub async fn delete_key(key: String) -> bool {
    let client = reqwest::Client::new();
    let url = format!("{}/settings/{}", GATEWAY, key);
    client
        .delete(&url)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

// ─── Copilot ──────────────────────────────────────────────────────────────────

/// POST /copilot/login → 启动 Device Flow
#[tauri::command]
pub async fn copilot_login() -> serde_json::Value {
    let client = reqwest::Client::new();
    let url = format!("{}/copilot/login", GATEWAY);
    match client.post(&url).send().await {
        Ok(r) => r.json().await.unwrap_or(serde_json::json!({ "error": "parse error" })),
        Err(e) => serde_json::json!({ "error": format!("{}", e) }),
    }
}

/// GET /copilot/login/status → 轮询登录状态
#[tauri::command]
pub async fn copilot_login_status() -> serde_json::Value {
    let url = format!("{}/copilot/login/status", GATEWAY);
    match reqwest::get(&url).await {
        Ok(r) => r.json().await.unwrap_or(serde_json::json!({ "status": "error", "message": "parse error" })),
        Err(e) => serde_json::json!({ "status": "error", "message": format!("{}", e) }),
    }
}

/// POST /copilot/logout → 清除 GitHub Token
#[tauri::command]
pub async fn copilot_logout() -> bool {
    let client = reqwest::Client::new();
    let url = format!("{}/copilot/logout", GATEWAY);
    client
        .post(&url)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// GET /copilot/models → 返回可用模型列表
#[tauri::command]
pub async fn copilot_models() -> serde_json::Value {
    let url = format!("{}/copilot/models", GATEWAY);
    match reqwest::get(&url).await {
        Ok(r) => r.json().await.unwrap_or(serde_json::json!([])),
        Err(_) => serde_json::json!([]),
    }
}

// ─── SSE 通知监听（Phase 4: Cron 提醒 → 系统通知）─────────────────────────────

/// 后台任务：连接 Core 的 SSE /events，收到 notification 事件后弹系统通知。
/// 断连后自动重连。在 lib.rs setup 中 spawn。
pub fn start_notification_listener(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            match listen_sse_events(&app).await {
                Ok(_) => {
                    println!("[SSE] connection closed, reconnecting in 3s...");
                }
                Err(e) => {
                    println!("[SSE] connection error: {}, reconnecting in 3s...", e);
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        }
    });
}

async fn listen_sse_events(app: &AppHandle) -> Result<(), String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/events", GATEWAY))
        .send()
        .await
        .map_err(|e| format!("{}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&bytes));

        loop {
            if let Some(pos) = buf.find('\n') {
                let line = buf[..pos].trim().to_string();
                buf = buf[pos + 1..].to_string();

                if let Some(json_str) = line.strip_prefix("data: ") {
                    let json_str = json_str.trim();
                    if json_str.is_empty() { continue; }
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                        if val.get("type").and_then(|t| t.as_str()) == Some("notification") {
                            let title = val.get("title").and_then(|t| t.as_str()).unwrap_or("Equality");
                            let body = val.get("body").and_then(|b| b.as_str()).unwrap_or("");
                            println!("[SSE] 🔔 notification: {} - {}", title, body);
                            let _ = app.notification()
                                .builder()
                                .title(title)
                                .body(body)
                                .show();
                        }
                    }
                }
            } else {
                break;
            }
        }
    }

    Ok(())
}
