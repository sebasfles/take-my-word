use serde_json::Value;
use tauri::AppHandle;

use crate::account::Problem;
use crate::api::routes::{Route, RouteFailure};
use crate::commands::blocking;
use crate::foreground;
use crate::i18n::Message;

#[tauri::command]
pub async fn api_request(app: AppHandle, route: Route) -> Result<Value, RouteFailure> {
    blocking(app, move |_, shell| {
        let name = route.name();
        shell
            .api
            .forward(&route)
            .inspect(|_| {
                log::info!("api {name}: ok");
                if route.changes_app_rules() {
                    shell.reload_rules();
                }
            })
            .map_err(|failure| {
                let failure = RouteFailure::from(&failure);
                log::warn!("api {name}: {:?} {:?}", failure.kind, failure.status);
                failure
            })
    })
    .await
}

#[tauri::command]
pub async fn running_apps() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(foreground::running_apps)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn copy_text(app: AppHandle, text: String) -> Result<(), Problem> {
    blocking(app, move |_, shell| {
        shell.copy(&text).map_err(|error| {
            log::warn!("copying a dictation failed: {error}");
            Problem::from(Message::CopyFailed)
        })
    })
    .await
}
