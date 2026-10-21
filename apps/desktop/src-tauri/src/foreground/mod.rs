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

pub fn foreground_is_this_process() -> bool {
    platform::foreground_is_this_process()
}

pub trait ActiveWindow {
    fn foreground(&self) -> ForegroundApp;
}

pub struct SystemWindow;

impl ActiveWindow for SystemWindow {
    fn foreground(&self) -> ForegroundApp {
        platform::foreground()
    }
}
