use serde_json::Value;
use tauri::AppHandle;

use crate::api::routes::{Route, RouteFailure};
use crate::commands::blocking;

#[tauri::command]
pub async fn api_request(app: AppHandle, route: Route) -> Result<Value, RouteFailure> {
    blocking(app, move |_, shell| {
        let name = route.name();
        shell
            .api
            .forward(&route)
            .inspect(|_| log::info!("api {name}: ok"))
            .map_err(|failure| {
                let failure = RouteFailure::from(&failure);
                log::warn!("api {name}: {:?} {:?}", failure.kind, failure.status);
                failure
            })
    })
    .await
}
