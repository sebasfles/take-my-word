use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::activity::Activity;
use crate::shell::Shell;
use crate::windows;

const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
const IDLE_POLL: Duration = Duration::from_millis(250);
const CONFIG_KEY: &str = "updater";

pub fn enabled(config: &tauri::Config) -> bool {
    !cfg!(debug_assertions) && configured(config)
}

fn configured(config: &tauri::Config) -> bool {
    config.plugins.0.contains_key(CONFIG_KEY)
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "phase", rename_all = "camelCase")]
pub enum Phase {
    Available,
    Downloading { percent: Option<u8> },
    Installing,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateView {
    pub version: String,
    pub notes: String,
    #[serde(flatten)]
    pub phase: Phase,
}

struct Offer<U> {
    update: U,
    version: String,
    notes: String,
    phase: Phase,
    downloaded: u64,
}

pub struct Offers<U> {
    current: Option<Offer<U>>,
}

impl<U> Default for Offers<U> {
    fn default() -> Self {
        Self { current: None }
    }
}

impl<U: Clone> Offers<U> {
    pub fn found(&mut self, update: U, version: String, notes: String) -> bool {
        if self.installing() {
            return false;
        }
        self.current = Some(Offer {
            update,
            version,
            notes,
            phase: Phase::Available,
            downloaded: 0,
        });
        true
    }

    pub fn postpone(&mut self) {
        if !self.installing() {
            self.current = None;
        }
    }

    pub fn start_install(&mut self) -> Option<U> {
        let offer = self.current.as_mut()?;
        if !matches!(offer.phase, Phase::Available | Phase::Failed) {
            return None;
        }
        offer.phase = Phase::Downloading { percent: None };
        offer.downloaded = 0;
        Some(offer.update.clone())
    }

    pub fn downloaded(&mut self, chunk: usize, total: Option<u64>) -> bool {
        let Some(offer) = self.current.as_mut() else {
            return false;
        };
        let Phase::Downloading { percent } = offer.phase else {
            return false;
        };
        offer.downloaded = offer.downloaded.saturating_add(chunk as u64);
        let now = total
            .filter(|total| *total > 0)
            .map(|total| (offer.downloaded.min(total) * 100 / total) as u8);
        offer.phase = Phase::Downloading { percent: now };
        now != percent
    }

    pub fn installing(&self) -> bool {
        self.current.as_ref().is_some_and(|offer| {
            matches!(offer.phase, Phase::Downloading { .. } | Phase::Installing)
        })
    }

    pub fn ready_to_install(&mut self) {
        self.set_phase(Phase::Installing);
    }

    pub fn failed(&mut self) {
        self.set_phase(Phase::Failed);
    }

    fn set_phase(&mut self, phase: Phase) {
        if let Some(offer) = self.current.as_mut() {
            offer.phase = phase;
        }
    }

    pub fn view(&self) -> Option<UpdateView> {
        self.current.as_ref().map(|offer| UpdateView {
            version: offer.version.clone(),
            notes: offer.notes.clone(),
            phase: offer.phase.clone(),
        })
    }
}

pub struct Updates(Mutex<Offers<Update>>);

impl Updates {
    pub fn new() -> Self {
        Self(Mutex::new(Offers::default()))
    }

    fn lock(&self) -> MutexGuard<'_, Offers<Update>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

pub fn start(app: &AppHandle, activity: Activity) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            check(&app, &activity).await;
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}

async fn check(app: &AppHandle, activity: &Activity) {
    let checked = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    let update = match checked {
        Ok(Some(update)) => update,
        Ok(None) => {
            log::info!("no update available");
            return;
        }
        Err(error) => {
            log::warn!("checking for updates failed: {error}");
            return;
        }
    };
    log::info!("update {} available", update.version);
    let version = update.version.clone();
    let notes = update.body.clone().unwrap_or_default();
    if !app.state::<Updates>().lock().found(update, version, notes) {
        return;
    }
    until_idle(activity).await;
    windows::open_update(app);
    publish(app);
}

async fn until_idle(activity: &Activity) {
    while !activity.is_idle() {
        tokio::time::sleep(IDLE_POLL).await;
    }
}

fn publish(app: &AppHandle) {
    let view = app.state::<Updates>().lock().view();
    if let Some(view) = view
        && let Err(error) = app.emit_to(windows::UPDATE, "update", view)
    {
        log::warn!("updating the update window failed: {error}");
    }
}

async fn install(app: AppHandle, activity: Activity, update: Update) {
    log::info!("downloading update {}", update.version);
    let downloaded = update
        .download(
            |chunk, total| {
                if app.state::<Updates>().lock().downloaded(chunk, total) {
                    publish(&app);
                }
            },
            || {},
        )
        .await;
    let installed = match downloaded {
        Ok(bytes) => {
            until_idle(&activity).await;
            app.state::<Updates>().lock().ready_to_install();
            publish(&app);
            log::info!("installing update {}", update.version);
            update.install(bytes)
        }
        Err(error) => Err(error),
    };
    if let Err(error) = installed {
        log::error!("installing the update failed: {error}");
        app.state::<Updates>().lock().failed();
        publish(&app);
    }
}

pub fn postpone(app: &AppHandle) {
    app.state::<Updates>().lock().postpone();
}

#[tauri::command]
pub fn update_view(updates: State<'_, Updates>) -> Option<UpdateView> {
    updates.lock().view()
}

#[tauri::command]
pub fn install_update(app: AppHandle, updates: State<'_, Updates>, shell: State<'_, Shell>) {
    let Some(update) = updates.lock().start_install() else {
        return;
    };
    publish(&app);
    tauri::async_runtime::spawn(install(app.clone(), shell.activity.clone(), update));
}

#[tauri::command]
pub fn postpone_update(app: AppHandle) {
    postpone(&app);
    if let Some(window) = app.get_webview_window(windows::UPDATE) {
        let _ = window.close();
    }
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use super::*;

    fn merge(base: &mut Value, overlay: Value) {
        match (base, overlay) {
            (Value::Object(base), Value::Object(overlay)) => {
                for (key, value) in overlay {
                    merge(base.entry(key).or_insert(Value::Null), value);
                }
            }
            (base, overlay) => *base = overlay,
        }
    }

    fn build_config(overlay: Option<&str>) -> tauri::Config {
        let mut config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        if let Some(overlay) = overlay {
            merge(&mut config, serde_json::from_str(overlay).unwrap());
        }
        serde_json::from_value(config).unwrap()
    }

    #[test]
    fn only_the_prd_build_carries_the_updater() {
        let debug = build_config(None);
        let dev = build_config(Some(include_str!("../tauri.dev.conf.json")));
        let prd = build_config(Some(include_str!("../tauri.prd.conf.json")));
        assert!(!configured(&debug));
        assert!(!configured(&dev));
        assert!(configured(&prd));
        assert!(!enabled(&debug) && !enabled(&dev));
        assert_eq!(enabled(&prd), !cfg!(debug_assertions));
        assert_eq!(prd.identifier, crate::env::PRD.identifier);
    }

    #[test]
    fn the_prd_build_requires_signed_versions_and_makes_updater_artifacts() {
        let prd = build_config(Some(include_str!("../tauri.prd.conf.json")));
        assert_eq!(
            prd.plugins.0[CONFIG_KEY]["requireSignedVersion"],
            Value::Bool(true)
        );
        assert!(matches!(
            prd.bundle.create_updater_artifacts,
            tauri::utils::config::Updater::Bool(true)
        ));
    }

    fn offers() -> Offers<&'static str> {
        Offers::default()
    }

    fn phase(offers: &Offers<&'static str>) -> Option<Phase> {
        offers.view().map(|view| view.phase)
    }

    #[test]
    fn a_found_update_is_offered_with_its_version_and_notes() {
        let mut offers = offers();
        assert!(offers.found("u1", "0.1.1".into(), "Faster paste.".into()));
        assert_eq!(
            offers.view(),
            Some(UpdateView {
                version: "0.1.1".into(),
                notes: "Faster paste.".into(),
                phase: Phase::Available,
            })
        );
    }

    #[test]
    fn later_drops_the_offer_until_the_next_check_finds_it_again() {
        let mut offers = offers();
        offers.found("u1", "0.1.1".into(), String::new());
        offers.postpone();
        assert_eq!(offers.view(), None);
        assert_eq!(offers.start_install(), None);
        assert!(offers.found("u1", "0.1.1".into(), String::new()));
        assert_eq!(phase(&offers), Some(Phase::Available));
    }

    #[test]
    fn a_check_during_the_install_leaves_it_alone() {
        let mut offers = offers();
        offers.found("u1", "0.1.1".into(), String::new());
        assert_eq!(offers.start_install(), Some("u1"));
        assert!(!offers.found("u2", "0.1.2".into(), String::new()));
        offers.postpone();
        assert_eq!(offers.view().map(|view| view.version), Some("0.1.1".into()));
        offers.ready_to_install();
        assert!(!offers.found("u2", "0.1.2".into(), String::new()));
    }

    #[test]
    fn install_starts_once_and_again_only_after_a_failure() {
        let mut offers = offers();
        offers.found("u1", "0.1.1".into(), String::new());
        assert_eq!(offers.start_install(), Some("u1"));
        assert_eq!(offers.start_install(), None);
        offers.failed();
        assert_eq!(phase(&offers), Some(Phase::Failed));
        assert_eq!(offers.start_install(), Some("u1"));
    }

    #[test]
    fn download_progress_reports_each_new_percent_once() {
        let mut offers = offers();
        offers.found("u1", "0.1.1".into(), String::new());
        assert!(!offers.downloaded(10, Some(100)));
        offers.start_install();
        assert!(!offers.downloaded(10, None));
        assert_eq!(phase(&offers), Some(Phase::Downloading { percent: None }));
        assert!(offers.downloaded(15, Some(100)));
        assert_eq!(
            phase(&offers),
            Some(Phase::Downloading { percent: Some(25) })
        );
        assert!(!offers.downloaded(0, Some(100)));
        assert!(offers.downloaded(500, Some(100)));
        assert_eq!(
            phase(&offers),
            Some(Phase::Downloading { percent: Some(100) })
        );
    }

    #[test]
    fn the_view_serializes_as_the_ui_reads_it() {
        let view = UpdateView {
            version: "0.1.1".into(),
            notes: "Notas".into(),
            phase: Phase::Downloading { percent: Some(40) },
        };
        assert_eq!(
            serde_json::to_value(view).unwrap(),
            serde_json::json!({
                "version": "0.1.1",
                "notes": "Notas",
                "phase": "downloading",
                "percent": 40
            })
        );
    }
}
