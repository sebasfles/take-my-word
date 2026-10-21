use super::ForegroundApp;

pub fn foreground() -> ForegroundApp {
    ForegroundApp::default()
}

pub fn foreground_is_this_process() -> bool {
    true
}

pub fn running_apps() -> Vec<String> {
    Vec::new()
}
