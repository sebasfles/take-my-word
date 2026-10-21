use std::cell::RefCell;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, EnumClipboardFormats, GetClipboardData, GetClipboardOwner,
    OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Memory::{
    GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock,
};
use windows::Win32::System::Ole::CF_UNICODETEXT;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, HWND_MESSAGE, MSG,
    PostMessageW, RegisterClassW, WINDOW_EX_STYLE, WINDOW_STYLE, WM_APP, WM_DESTROYCLIPBOARD,
    WM_RENDERALLFORMATS, WM_RENDERFORMAT, WNDCLASSW,
};
use windows::core::{HSTRING, PCWSTR, w};

use super::{Clipboard, ClipboardError};

const WM_COMMANDS: u32 = WM_APP + 1;
const REPLY_TIMEOUT: Duration = Duration::from_secs(5);
const OPEN_PATIENCE: Duration = Duration::from_millis(200);
const RESTORE_PATIENCE: Duration = Duration::from_secs(3);
const OPEN_RETRY: Duration = Duration::from_millis(10);
const GDI_HANDLE_FORMATS: [u32; 8] = [2, 3, 9, 14, 0x80, 0x82, 0x83, 0x8E];
const PRIVATE_HANDLE_FORMATS: std::ops::RangeInclusive<u32> = 0x200..=0x3FF;

type Reply = mpsc::Sender<Result<(), ClipboardError>>;

enum Command {
    Offer(Vec<u8>, Reply),
    Restore(Reply),
    KeepText(Reply),
    PutText(Vec<u8>, Reply),
}

pub struct SystemClipboard {
    window: isize,
    commands: mpsc::Sender<Command>,
    reads: mpsc::Receiver<Instant>,
}

impl SystemClipboard {
    pub fn spawn() -> Result<Self, ClipboardError> {
        let (commands, inbox) = mpsc::channel();
        let (read_sender, reads) = mpsc::channel();
        let (ready_sender, ready) = mpsc::channel();
        thread::Builder::new()
            .name("clipboard".into())
            .spawn(move || serve(inbox, read_sender, ready_sender))
            .map_err(|error| ClipboardError(error.to_string()))?;
        let window = ready
            .recv()
            .map_err(|error| ClipboardError(error.to_string()))??;
        Ok(Self {
            window,
            commands,
            reads,
        })
    }

    fn call(&self, command: impl FnOnce(Reply) -> Command) -> Result<(), ClipboardError> {
        let (reply, answer) = mpsc::channel();
        self.commands
            .send(command(reply))
            .map_err(|_| ClipboardError("the clipboard thread stopped".into()))?;
        unsafe {
            PostMessageW(
                Some(HWND(self.window as *mut _)),
                WM_COMMANDS,
                WPARAM(0),
                LPARAM(0),
            )
        }
        .map_err(|error| ClipboardError(error.to_string()))?;
        answer
            .recv_timeout(REPLY_TIMEOUT)
            .map_err(|_| ClipboardError("the clipboard thread did not answer".into()))?
    }
}

impl Clipboard for SystemClipboard {
    fn offer(&mut self, text: &str) -> Result<(), ClipboardError> {
        while self.reads.try_recv().is_ok() {}
        self.call(|reply| Command::Offer(utf16_bytes(text), reply))
    }

    fn wait_for_read(&mut self, timeout: Duration) -> Option<Instant> {
        self.reads.recv_timeout(timeout).ok()
    }

    fn restore(&mut self) -> Result<(), ClipboardError> {
        self.call(Command::Restore)
    }

    fn keep_text(&mut self) -> Result<(), ClipboardError> {
        self.call(Command::KeepText)
    }

    fn put_text(&mut self, text: &str) -> Result<(), ClipboardError> {
        self.call(|reply| Command::PutText(utf16_bytes(text), reply))
    }
}

fn utf16_bytes(text: &str) -> Vec<u8> {
    text.encode_utf16()
        .chain(std::iter::once(0))
        .flat_map(u16::to_le_bytes)
        .collect()
}

struct Formats {
    exclude_from_monitors: u32,
    history: u32,
    cloud: u32,
}

struct State {
    window: HWND,
    inbox: mpsc::Receiver<Command>,
    reads: mpsc::Sender<Instant>,
    formats: Formats,
    pending: Option<Vec<u8>>,
    saved: Vec<(u32, Vec<u8>)>,
}

thread_local! {
    static STATE: RefCell<Option<State>> = const { RefCell::new(None) };
}

fn with_state<T>(f: impl FnOnce(&mut State) -> T) -> Option<T> {
    STATE.with(|state| state.borrow_mut().as_mut().map(f))
}

fn serve(
    inbox: mpsc::Receiver<Command>,
    reads: mpsc::Sender<Instant>,
    ready: mpsc::Sender<Result<isize, ClipboardError>>,
) {
    let window = match create_window() {
        Ok(window) => window,
        Err(error) => {
            let _ = ready.send(Err(error));
            return;
        }
    };
    let register = |name: &str| unsafe { RegisterClipboardFormatW(&HSTRING::from(name)) };
    let formats = Formats {
        exclude_from_monitors: register("ExcludeClipboardContentFromMonitorProcessing"),
        history: register("CanIncludeInClipboardHistory"),
        cloud: register("CanUploadToCloudClipboard"),
    };
    STATE.with(|state| {
        *state.borrow_mut() = Some(State {
            window,
            inbox,
            reads,
            formats,
            pending: None,
            saved: Vec::new(),
        });
    });
    let _ = ready.send(Ok(window.0 as isize));

    let mut message = MSG::default();
    while unsafe { GetMessageW(&mut message, None, 0, 0) }.0 > 0 {
        unsafe { DispatchMessageW(&message) };
    }
}

fn create_window() -> Result<HWND, ClipboardError> {
    let error = |error: windows::core::Error| ClipboardError(error.to_string());
    let instance = unsafe { GetModuleHandleW(None) }.map_err(error)?;
    let class_name = w!("TakeMyWordClipboard");
    let class = WNDCLASSW {
        lpfnWndProc: Some(window_proc),
        hInstance: instance.into(),
        lpszClassName: class_name,
        ..WNDCLASSW::default()
    };
    if unsafe { RegisterClassW(&class) } == 0 {
        return Err(ClipboardError(
            "registering the clipboard window failed".into(),
        ));
    }
    unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE(0),
            class_name,
            PCWSTR::null(),
            WINDOW_STYLE(0),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            Some(instance.into()),
            None,
        )
    }
    .map_err(error)
}

unsafe extern "system" fn window_proc(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        WM_COMMANDS => {
            while let Some(command) = with_state(|state| state.inbox.try_recv().ok()).flatten() {
                execute(command);
            }
            LRESULT(0)
        }
        WM_RENDERFORMAT => {
            if wparam.0 as u32 == u32::from(CF_UNICODETEXT.0)
                && let Some(text) = with_state(|state| state.pending.clone()).flatten()
            {
                if let Err(error) = set_data(u32::from(CF_UNICODETEXT.0), &text) {
                    log::warn!("rendering the dictation for the target failed: {error}");
                }
                with_state(|state| state.reads.send(Instant::now()));
            }
            LRESULT(0)
        }
        WM_RENDERALLFORMATS => {
            if let Err(error) = keep_text(window) {
                log::warn!("rendering the clipboard on exit failed: {error}");
            }
            LRESULT(0)
        }
        WM_DESTROYCLIPBOARD => {
            with_state(|state| state.pending = None);
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(window, message, wparam, lparam) },
    }
}

fn execute(command: Command) {
    let Some(window) = with_state(|state| state.window) else {
        return;
    };
    let (result, reply) = match command {
        Command::Offer(text, reply) => (offer(window, text), reply),
        Command::Restore(reply) => (restore(window), reply),
        Command::KeepText(reply) => (keep_text(window), reply),
        Command::PutText(text, reply) => (put_text(window, &text), reply),
    };
    let _ = reply.send(result);
}

fn offer(window: HWND, text: Vec<u8>) -> Result<(), ClipboardError> {
    let saved = with_open_clipboard(window, OPEN_PATIENCE, || {
        let saved = snapshot();
        unsafe { EmptyClipboard() }.map_err(win_error)?;
        delay_rendering(u32::from(CF_UNICODETEXT.0))?;
        mark_private()?;
        Ok(saved)
    })?;
    with_state(|state| {
        state.saved = saved;
        state.pending = Some(text);
    });
    Ok(())
}

fn restore(window: HWND) -> Result<(), ClipboardError> {
    let saved = with_state(|state| std::mem::take(&mut state.saved)).unwrap_or_default();
    let restored = with_open_clipboard(window, RESTORE_PATIENCE, || {
        unsafe { EmptyClipboard() }.map_err(win_error)?;
        for (format, bytes) in &saved {
            if let Err(error) = set_data(*format, bytes) {
                log::warn!("restoring clipboard format {format} failed: {error}");
            }
        }
        if !saved.is_empty()
            && let Some(format) = with_state(|state| state.formats.exclude_from_monitors)
        {
            set_data(format, &[0])?;
        }
        Ok(())
    });
    with_state(|state| match &restored {
        Ok(()) => state.pending = None,
        Err(_) => state.saved = saved,
    });
    restored
}

fn keep_text(window: HWND) -> Result<(), ClipboardError> {
    let Some(text) = with_state(|state| {
        state.saved.clear();
        state.pending.take()
    })
    .flatten() else {
        return Ok(());
    };
    with_open_clipboard(window, OPEN_PATIENCE, || {
        if unsafe { GetClipboardOwner() }.is_ok_and(|owner| owner == window) {
            set_data(u32::from(CF_UNICODETEXT.0), &text)?;
        }
        Ok(())
    })
}

fn put_text(window: HWND, text: &[u8]) -> Result<(), ClipboardError> {
    with_state(|state| {
        state.saved.clear();
        state.pending = None;
    });
    with_open_clipboard(window, OPEN_PATIENCE, || {
        unsafe { EmptyClipboard() }.map_err(win_error)?;
        set_data(u32::from(CF_UNICODETEXT.0), text)?;
        mark_private()
    })
}

fn with_open_clipboard<T>(
    window: HWND,
    patience: Duration,
    work: impl FnOnce() -> Result<T, ClipboardError>,
) -> Result<T, ClipboardError> {
    let deadline = Instant::now() + patience;
    while let Err(error) = unsafe { OpenClipboard(Some(window)) } {
        if Instant::now() >= deadline {
            return Err(win_error(error));
        }
        thread::sleep(OPEN_RETRY);
    }
    let result = work();
    let _ = unsafe { CloseClipboard() };
    result
}

fn snapshot() -> Vec<(u32, Vec<u8>)> {
    let mut saved = Vec::new();
    let mut format = 0;
    loop {
        format = unsafe { EnumClipboardFormats(format) };
        if format == 0 {
            break;
        }
        if GDI_HANDLE_FORMATS.contains(&format) || PRIVATE_HANDLE_FORMATS.contains(&format) {
            continue;
        }
        if let Ok(handle) = unsafe { GetClipboardData(format) }
            && let Some(bytes) = global_bytes(HGLOBAL(handle.0))
        {
            saved.push((format, bytes));
        }
    }
    saved
}

fn global_bytes(memory: HGLOBAL) -> Option<Vec<u8>> {
    let size = unsafe { GlobalSize(memory) };
    if size == 0 {
        return None;
    }
    let pointer = unsafe { GlobalLock(memory) };
    if pointer.is_null() {
        return None;
    }
    let bytes = unsafe { std::slice::from_raw_parts(pointer.cast::<u8>(), size) }.to_vec();
    let _ = unsafe { GlobalUnlock(memory) };
    Some(bytes)
}

fn set_data(format: u32, bytes: &[u8]) -> Result<(), ClipboardError> {
    let memory = unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes.len().max(1)) }.map_err(win_error)?;
    let pointer = unsafe { GlobalLock(memory) };
    if pointer.is_null() {
        let _ = unsafe { GlobalFree(Some(memory)) };
        return Err(ClipboardError("locking clipboard memory failed".into()));
    }
    unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), pointer.cast::<u8>(), bytes.len()) };
    let _ = unsafe { GlobalUnlock(memory) };
    if let Err(error) = unsafe { SetClipboardData(format, Some(HANDLE(memory.0))) } {
        let _ = unsafe { GlobalFree(Some(memory)) };
        return Err(win_error(error));
    }
    Ok(())
}

fn delay_rendering(format: u32) -> Result<(), ClipboardError> {
    match unsafe { SetClipboardData(format, None) } {
        Err(error) if error.code().is_err() => Err(win_error(error)),
        _ => Ok(()),
    }
}

fn mark_private() -> Result<(), ClipboardError> {
    let Some((exclude, history, cloud)) = with_state(|state| {
        (
            state.formats.exclude_from_monitors,
            state.formats.history,
            state.formats.cloud,
        )
    }) else {
        return Ok(());
    };
    set_data(exclude, &[0])?;
    set_data(history, &0u32.to_le_bytes())?;
    set_data(cloud, &0u32.to_le_bytes())
}

fn win_error(error: windows::core::Error) -> ClipboardError {
    ClipboardError(error.to_string())
}

#[cfg(test)]
mod tests {
    use windows::Win32::System::DataExchange::IsClipboardFormatAvailable;

    use super::*;

    fn read_text() -> Option<String> {
        let mut attempt = 0;
        while unsafe { OpenClipboard(None) }.is_err() {
            attempt += 1;
            assert!(attempt < 50, "the clipboard stayed busy");
            thread::sleep(OPEN_RETRY);
        }
        let text = unsafe { GetClipboardData(u32::from(CF_UNICODETEXT.0)) }
            .ok()
            .and_then(|handle| global_bytes(HGLOBAL(handle.0)))
            .map(|bytes| {
                let units = bytes
                    .as_chunks::<2>()
                    .0
                    .iter()
                    .map(|pair| u16::from_le_bytes(*pair))
                    .take_while(|unit| *unit != 0)
                    .collect::<Vec<_>>();
                String::from_utf16_lossy(&units)
            });
        let private = unsafe {
            IsClipboardFormatAvailable(RegisterClipboardFormatW(w!(
                "ExcludeClipboardContentFromMonitorProcessing"
            )))
        }
        .is_ok();
        let _ = unsafe { CloseClipboard() };
        text.map(|text| {
            if private {
                format!("{text} [private]")
            } else {
                text
            }
        })
    }

    #[test]
    #[ignore = "drives the real system clipboard; runs in desktop-ci and in announced smoke runs"]
    fn offered_text_renders_on_first_read_and_the_previous_clipboard_comes_back() {
        let mut clipboard = SystemClipboard::spawn().unwrap();
        let before = read_text();
        clipboard.offer("dictado de prueba").unwrap();
        assert_eq!(clipboard.wait_for_read(Duration::ZERO), None);
        let reading = Instant::now();
        assert_eq!(read_text().as_deref(), Some("dictado de prueba [private]"));
        let read = clipboard.wait_for_read(Duration::from_secs(2));
        assert!(read.is_some_and(|read| read >= reading));
        clipboard.restore().unwrap();
        assert_eq!(
            read_text().map(|text| text.trim_end_matches(" [private]").to_owned()),
            before.map(|text| text.trim_end_matches(" [private]").to_owned())
        );
    }
}
