#[cfg(not(windows))]
mod unsupported;
#[cfg(windows)]
mod win32;

#[cfg(not(windows))]
use unsupported as platform;
#[cfg(windows)]
use win32 as platform;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ForegroundApp {
    pub window: Option<isize>,
    pub app_id: Option<String>,
    pub elevated: bool,
}

pub fn running_apps() -> Vec<String> {
    let mut apps = platform::running_apps();
    apps.sort();
    apps.dedup();
    apps
}

pub fn foreground_is_this_process() -> bool {
    platform::foreground_is_this_process()
}

pub trait ActiveWindow {
    fn foreground(&self) -> ForegroundApp;
    fn reader_processes(&self, window: isize) -> Vec<u32>;
}

pub struct SystemWindow;

impl ActiveWindow for SystemWindow {
    fn foreground(&self) -> ForegroundApp {
        platform::foreground()
    }

    fn reader_processes(&self, window: isize) -> Vec<u32> {
        platform::reader_processes(window)
    }
}
