use super::ForegroundApp;

pub fn foreground() -> ForegroundApp {
    ForegroundApp::default()
}

pub fn handle_of(_window: &tauri::WebviewWindow) -> Option<isize> {
    None
}

pub fn foreground_is_this_process() -> bool {
    true
}

pub fn running_apps() -> Vec<String> {
    Vec::new()
}

pub fn reader_processes(_window: isize) -> Vec<u32> {
    Vec::new()
}
