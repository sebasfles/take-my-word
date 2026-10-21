use std::path::Path;

use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, LPARAM};
use windows::Win32::Security::{
    GetSidSubAuthority, GetSidSubAuthorityCount, GetTokenInformation, TOKEN_MANDATORY_LABEL,
    TOKEN_QUERY, TokenIntegrityLevel,
};
use windows::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, EnumWindows, GetForegroundWindow, GetWindowTextLengthW,
    GetWindowThreadProcessId, IsWindowVisible,
};
use windows::core::{BOOL, PWSTR};

use super::ForegroundApp;

const FRAME_HOST: &str = "applicationframehost.exe";

pub fn foreground() -> ForegroundApp {
    let window = unsafe { GetForegroundWindow() };
    if window.is_invalid() {
        return ForegroundApp::default();
    }
    let pid = process_of(window);
    let Some(process) = Handle::process(pid) else {
        return ForegroundApp {
            window: Some(window.0 as isize),
            app_id: None,
            elevated: true,
        };
    };
    let app_id = app_id_of(window, pid, &process);
    let elevated = match (process.integrity(), own_integrity()) {
        (Some(theirs), Some(ours)) => theirs > ours,
        _ => true,
    };
    ForegroundApp {
        window: Some(window.0 as isize),
        app_id,
        elevated,
    }
}

fn app_id_of(window: HWND, pid: u32, process: &Handle) -> Option<String> {
    let app_id = process.executable_name();
    if app_id.as_deref() == Some(FRAME_HOST) {
        return hosted_app(window, pid).or(app_id);
    }
    app_id
}

pub fn running_apps() -> Vec<String> {
    unsafe extern "system" fn visit(window: HWND, found: LPARAM) -> BOOL {
        let found = unsafe { &mut *(found.0 as *mut Vec<HWND>) };
        let shown = unsafe { IsWindowVisible(window) }.as_bool()
            && unsafe { GetWindowTextLengthW(window) } > 0;
        if shown {
            found.push(window);
        }
        BOOL(1)
    }
    let mut windows = Vec::<HWND>::new();
    let _ = unsafe { EnumWindows(Some(visit), LPARAM(&mut windows as *mut Vec<HWND> as isize)) };
    windows
        .into_iter()
        .filter_map(|window| {
            let pid = process_of(window);
            if pid == std::process::id() {
                return None;
            }
            app_id_of(window, pid, &Handle::process(pid)?)
        })
        .collect()
}

pub fn foreground_is_this_process() -> bool {
    let window = unsafe { GetForegroundWindow() };
    !window.is_invalid() && process_of(window) == std::process::id()
}

fn process_of(window: HWND) -> u32 {
    let mut pid = 0;
    unsafe { GetWindowThreadProcessId(window, Some(&mut pid)) };
    pid
}

fn hosted_app(frame: HWND, frame_pid: u32) -> Option<String> {
    struct Search {
        frame_pid: u32,
        found: Option<u32>,
    }
    unsafe extern "system" fn visit(child: HWND, search: LPARAM) -> BOOL {
        let search = unsafe { &mut *(search.0 as *mut Search) };
        let pid = process_of(child);
        if pid != search.frame_pid {
            search.found = Some(pid);
            return BOOL(0);
        }
        BOOL(1)
    }
    let mut search = Search {
        frame_pid,
        found: None,
    };
    let _ = unsafe {
        EnumChildWindows(
            Some(frame),
            Some(visit),
            LPARAM(&mut search as *mut Search as isize),
        )
    };
    Handle::process(search.found?)?.executable_name()
}

fn own_integrity() -> Option<u32> {
    token_integrity(unsafe { GetCurrentProcess() })
}

struct Handle(HANDLE);

impl Handle {
    fn process(pid: u32) -> Option<Self> {
        unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }
            .ok()
            .map(Self)
    }

    fn executable_name(&self) -> Option<String> {
        let mut buffer = [0u16; 1024];
        let mut length = buffer.len() as u32;
        unsafe {
            QueryFullProcessImageNameW(
                self.0,
                PROCESS_NAME_WIN32,
                PWSTR(buffer.as_mut_ptr()),
                &mut length,
            )
        }
        .ok()?;
        let path = String::from_utf16_lossy(&buffer[..length as usize]);
        Path::new(&path)
            .file_name()
            .map(|name| name.to_string_lossy().to_lowercase())
    }

    fn integrity(&self) -> Option<u32> {
        token_integrity(self.0)
    }
}

impl Drop for Handle {
    fn drop(&mut self) {
        let _ = unsafe { CloseHandle(self.0) };
    }
}

fn token_integrity(process: HANDLE) -> Option<u32> {
    let mut token = HANDLE::default();
    unsafe { OpenProcessToken(process, TOKEN_QUERY, &mut token) }.ok()?;
    let token = Handle(token);
    let mut needed = 0;
    let _ = unsafe { GetTokenInformation(token.0, TokenIntegrityLevel, None, 0, &mut needed) };
    let mut buffer = vec![0u8; needed as usize];
    unsafe {
        GetTokenInformation(
            token.0,
            TokenIntegrityLevel,
            Some(buffer.as_mut_ptr().cast()),
            needed,
            &mut needed,
        )
    }
    .ok()?;
    let label = unsafe { &*(buffer.as_ptr() as *const TOKEN_MANDATORY_LABEL) };
    let sid = label.Label.Sid;
    let count = unsafe { *GetSidSubAuthorityCount(sid) };
    Some(unsafe { *GetSidSubAuthority(sid, u32::from(count).saturating_sub(1)) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn running_apps_never_list_this_app_and_are_lowercase_executables() {
        let own = Handle::process(std::process::id())
            .and_then(|process| process.executable_name())
            .unwrap();
        for app in running_apps() {
            assert_ne!(app, own);
            assert_eq!(app, app.to_lowercase());
        }
    }

    #[test]
    fn this_process_reports_at_least_medium_integrity() {
        let ours = own_integrity().unwrap();
        assert!(ours >= 0x2000, "integrity {ours:#x}");
    }
}
