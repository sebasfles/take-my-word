use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, mpsc};
use std::thread;
use std::time::{Duration, Instant};

use windows::Win32::Foundation::{
    CloseHandle, GlobalFree, HANDLE, HGLOBAL, HWND, LPARAM, LRESULT, WPARAM,
};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, EnumClipboardFormats, GetClipboardData, GetClipboardOwner,
    GetOpenClipboardWindow, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Diagnostics::Debug::{
    GetThreadWaitChain, OPEN_THREAD_WAIT_CHAIN_SESSION_FLAGS, OpenThreadWaitChainSession,
    WAITCHAIN_NODE_INFO, WCT_MAX_NODE_COUNT, WCT_OUT_OF_PROC_FLAG, WctSendMessageType,
    WctThreadType,
};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, TH32CS_SNAPTHREAD, THREADENTRY32, Thread32First, Thread32Next,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Memory::{
    GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock,
};
use windows::Win32::System::Ole::CF_UNICODETEXT;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GUITHREADINFO, GetGUIThreadInfo,
    GetMessageW, GetWindowThreadProcessId, HWND_MESSAGE, MSG, PostMessageW, RegisterClassW,
    WINDOW_EX_STYLE, WINDOW_STYLE, WM_APP, WM_DESTROYCLIPBOARD, WM_RENDERALLFORMATS,
    WM_RENDERFORMAT, WNDCLASSW,
};
use windows::core::{BOOL, HSTRING, PCWSTR, w};

use super::{
    Clipboard, ClipboardError, Ignored, ReadActivity, ReadOrder, ReadOutcome, Reader, WaitNode,
    depth_below, probe_order, renders_for, sends_to,
};

const WM_COMMANDS: u32 = WM_APP + 1;
const REPLY_TIMEOUT: Duration = Duration::from_secs(5);
const OPEN_PATIENCE: Duration = Duration::from_millis(200);
const RESTORE_PATIENCE: Duration = Duration::from_secs(3);
const OPEN_RETRY: Duration = Duration::from_millis(10);
const PROBE_BUDGET: Duration = Duration::from_millis(200);
const GDI_HANDLE_FORMATS: [u32; 8] = [2, 3, 9, 14, 0x80, 0x82, 0x83, 0x8E];
const PRIVATE_HANDLE_FORMATS: std::ops::RangeInclusive<u32> = 0x200..=0x3FF;

type Reply = mpsc::Sender<Result<(), ClipboardError>>;

enum Command {
    Offer(Vec<u8>, Vec<u32>, Reply),
    Restore(Reply),
    KeepText(Reply),
    PutText(Vec<u8>, Reply),
}

#[derive(Default)]
struct Activity {
    rendering: bool,
    last_read: Option<Instant>,
    order: ReadOrder,
    attempt: u32,
    parents: HashMap<u32, u32>,
    threads: Vec<(u32, u32)>,
}

type TargetSnapshot = (HashMap<u32, u32>, Vec<(u32, u32)>);

type SharedActivity = Arc<Mutex<Activity>>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ReadEvent {
    Counted,
    Contended,
    Failed,
}

pub struct SystemClipboard {
    window: isize,
    commands: mpsc::Sender<Command>,
    reads: mpsc::Receiver<ReadEvent>,
    activity: SharedActivity,
    targets: Option<thread::JoinHandle<TargetSnapshot>>,
}

impl SystemClipboard {
    pub fn spawn() -> Result<Self, ClipboardError> {
        let (commands, inbox) = mpsc::channel();
        let (read_sender, reads) = mpsc::channel();
        let (ready_sender, ready) = mpsc::channel();
        let activity = SharedActivity::default();
        let shared = Arc::clone(&activity);
        let spawner = unsafe { GetCurrentThreadId() };
        thread::Builder::new()
            .name("clipboard".into())
            .spawn(move || serve(inbox, read_sender, shared, spawner, ready_sender))
            .map_err(|error| ClipboardError(error.to_string()))?;
        let window = ready
            .recv()
            .map_err(|error| ClipboardError(error.to_string()))??;
        Ok(Self {
            window,
            commands,
            reads,
            activity,
            targets: None,
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
    fn offer(&mut self, text: &str, readers: &[u32]) -> Result<(), ClipboardError> {
        while self.reads.try_recv().is_ok() {}
        let targets = readers.to_vec();
        self.targets = thread::Builder::new()
            .name("clipboard-targets".into())
            .spawn(move || {
                let parents = crate::foreground::parent_processes();
                let threads = target_threads(&targets, &parents);
                (parents, threads)
            })
            .ok();
        self.call(|reply| Command::Offer(utf16_bytes(text), readers.to_vec(), reply))
    }

    fn activity(&mut self) -> ReadActivity {
        self.activity
            .lock()
            .map(|activity| ReadActivity {
                rendering: activity.rendering,
                last_read: activity.last_read,
            })
            .unwrap_or_default()
    }

    fn arm(&mut self, attempt: u32) {
        let joining = Instant::now();
        let snapshot = self.targets.take().and_then(|targets| {
            let snapshot = targets.join().ok();
            log::info!(
                "target snapshot joined after waiting {} ms",
                joining.elapsed().as_millis()
            );
            snapshot
        });
        if let Ok(mut activity) = self.activity.lock() {
            while self.reads.try_recv().is_ok() {}
            if let Some((parents, threads)) = snapshot {
                activity.parents = parents;
                activity.threads = threads;
            }
            activity.order.arm();
            activity.attempt = attempt;
        }
    }

    fn wait_for_read(&mut self, timeout: Duration) -> bool {
        self.reads
            .recv_timeout(timeout)
            .is_ok_and(|event| event == ReadEvent::Counted)
    }

    fn contended(&mut self) -> bool {
        self.activity
            .lock()
            .is_ok_and(|activity| activity.order.contended())
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
    reads: mpsc::Sender<ReadEvent>,
    activity: SharedActivity,
    formats: Formats,
    pending: Option<Vec<u8>>,
    readers: Vec<u32>,
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
    reads: mpsc::Sender<ReadEvent>,
    activity: SharedActivity,
    spawner: u32,
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
            activity,
            formats,
            pending: None,
            readers: Vec::new(),
            saved: Vec::new(),
        });
    });
    let _ = ready.send(Ok(window.0 as isize));
    warm_up_wait_chains(spawner);

    let mut message = MSG::default();
    while unsafe { GetMessageW(&mut message, None, 0, 0) }.0 > 0 {
        unsafe { DispatchMessageW(&message) };
    }
}

fn create_window() -> Result<HWND, ClipboardError> {
    let error = |error: windows::core::Error| ClipboardError(error.to_string());
    let instance = unsafe { GetModuleHandleW(None) }.map_err(error)?;
    let class_name = w!("TakeMyWordClipboard");
    static REGISTERED: OnceLock<bool> = OnceLock::new();
    let registered = *REGISTERED.get_or_init(|| {
        let class = WNDCLASSW {
            lpfnWndProc: Some(window_proc),
            hInstance: instance.into(),
            lpszClassName: class_name,
            ..WNDCLASSW::default()
        };
        let atom = unsafe { RegisterClassW(&class) };
        atom != 0
    });
    if !registered {
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
            if wparam.0 as u32 == u32::from(CF_UNICODETEXT.0) {
                mark_rendering(true);
                answer_render_request();
                mark_rendering(false);
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

fn mark_rendering(rendering: bool) {
    with_state(|state| {
        if let Ok(mut activity) = state.activity.lock() {
            activity.rendering = rendering;
            if !rendering {
                activity.last_read = Some(Instant::now());
            }
        }
    });
}

fn answer_render_request() {
    let started = Instant::now();
    let Some((targets, pending, activity, reads)) = with_state(|state| {
        (
            state.readers.clone(),
            state.pending.clone(),
            Arc::clone(&state.activity),
            state.reads.clone(),
        )
    }) else {
        return;
    };
    let Ok((mut order, attempt, parents, threads)) = activity.lock().map(|activity| {
        (
            activity.order,
            activity.attempt,
            activity.parents.clone(),
            activity.threads.clone(),
        )
    }) else {
        return;
    };
    let opener = unsafe { GetOpenClipboardWindow() }
        .ok()
        .filter(|window| !window.is_invalid());
    let mut opener_pid = 0;
    if let Some(opener) = opener {
        unsafe { GetWindowThreadProcessId(opener, Some(&mut opener_pid)) };
    }
    let mut reader = if opener_pid != 0 {
        Reader::Window(opener_pid)
    } else {
        Reader::Unproven
    };
    let mut probe = None;
    let outcome = order.read(
        || {
            if opener_pid == 0 {
                let probed = probe_sender(&threads);
                reader = probed.sender.map_or(Reader::Unproven, Reader::Sender);
                probe = Some(probed);
            }
            renders_for(reader, &targets, |child| parents.get(&child).copied())
        },
        || {
            pending.as_deref().is_some_and(|text| {
                set_data(u32::from(CF_UNICODETEXT.0), text)
                    .inspect_err(|error| log::warn!("rendering the dictation failed: {error}"))
                    .is_ok()
            })
        },
    );
    if !matches!(outcome, ReadOutcome::Ignored(_))
        && let Ok(mut activity) = activity.lock()
    {
        activity.order = order;
    }
    let event = match outcome {
        ReadOutcome::Counted => Some(ReadEvent::Counted),
        ReadOutcome::Contended => Some(ReadEvent::Contended),
        ReadOutcome::Failed => Some(ReadEvent::Failed),
        ReadOutcome::Ignored(_) => None,
    };
    if let Some(event) = event {
        let _ = reads.send(event);
    }
    let reader_pid = match reader {
        Reader::Window(pid) | Reader::Sender(pid) => pid,
        Reader::Unproven => 0,
    };
    let proof = probe.map_or_else(String::new, |probe| {
        format!(
            ", wait chains of {} target GUI threads in {} ms, {} failed{}",
            probe.threads,
            probe.took.as_millis(),
            probe.failures,
            if probe.exhausted {
                ", budget spent"
            } else {
                ""
            }
        )
    });
    let decision = match outcome {
        ReadOutcome::Counted => format!("rendered and counted for attempt {attempt}"),
        ReadOutcome::Contended => format!("withheld, contends attempt {attempt}"),
        ReadOutcome::Failed => format!("render failed, attempt {attempt} not delivered"),
        ReadOutcome::Ignored(Ignored::BeforeTheKeystroke) => "withheld before the keystroke".into(),
        ReadOutcome::Ignored(Ignored::AfterTheCount) => {
            format!("answered without rendering again after the counted read of attempt {attempt}")
        }
        ReadOutcome::Ignored(Ignored::AfterAContention) => {
            format!("withheld, attempt {attempt} is contended")
        }
        ReadOutcome::Ignored(Ignored::AfterAFailedRender) => {
            format!("withheld, attempt {attempt} failed to render")
        }
    };
    log::info!(
        "clipboard read by {} ({}{proof}): {decision} in {} ms",
        crate::foreground::executable_of(reader_pid)
            .unwrap_or_else(|| "an unidentified reader".into()),
        if opener.is_some() {
            "with a window"
        } else {
            "without a window"
        },
        started.elapsed().as_millis()
    );
}

struct Probe {
    sender: Option<u32>,
    threads: usize,
    failures: usize,
    exhausted: bool,
    took: Duration,
}

fn probe_sender(threads: &[(u32, u32)]) -> Probe {
    let started = Instant::now();
    let mut probe = Probe {
        sender: None,
        threads: 0,
        failures: 0,
        exhausted: false,
        took: Duration::ZERO,
    };
    let receiver = unsafe { GetCurrentThreadId() };
    match wait_chains() {
        Some(session) => probe_threads(session.0, receiver, threads, started, &mut probe),
        None => probe.failures = 1,
    }
    probe.took = started.elapsed();
    probe
}

fn probe_threads(
    session: *mut std::ffi::c_void,
    receiver: u32,
    threads: &[(u32, u32)],
    started: Instant,
    probe: &mut Probe,
) {
    for &(process, thread) in threads {
        if thread == receiver || !is_gui_thread(thread) {
            continue;
        }
        if started.elapsed() >= PROBE_BUDGET {
            probe.exhausted = true;
            return;
        }
        probe.threads += 1;
        match wait_chain(session, thread) {
            Some(chain) if sends_to(&chain, receiver) => {
                probe.sender = Some(process);
                return;
            }
            Some(_) => {}
            None => probe.failures += 1,
        }
    }
}

fn target_threads(targets: &[u32], parents: &HashMap<u32, u32>) -> Vec<(u32, u32)> {
    let depths = parents
        .keys()
        .filter_map(|pid| {
            depth_below(*pid, targets, |child| parents.get(&child).copied())
                .map(|depth| (*pid, depth))
        })
        .collect::<HashMap<_, _>>();
    let tree = depths.keys().copied().collect::<HashSet<_>>();
    let threads = threads_of(&tree).unwrap_or_default();
    probe_order(&threads, |pid| {
        depths.get(&pid).copied().unwrap_or(usize::MAX)
    })
}

fn threads_of(processes: &HashSet<u32>) -> Option<Vec<(u32, u32)>> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) }.ok()?;
    let mut threads = Vec::new();
    let mut entry = THREADENTRY32 {
        dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
        ..THREADENTRY32::default()
    };
    let mut more = unsafe { Thread32First(snapshot, &mut entry) }.is_ok();
    while more {
        if processes.contains(&entry.th32OwnerProcessID) {
            threads.push((entry.th32OwnerProcessID, entry.th32ThreadID));
        }
        more = unsafe { Thread32Next(snapshot, &mut entry) }.is_ok();
    }
    let _ = unsafe { CloseHandle(snapshot) };
    Some(threads)
}

struct WaitChains(*mut std::ffi::c_void);

unsafe impl Send for WaitChains {}

fn wait_chains() -> Option<MutexGuard<'static, WaitChains>> {
    static SESSION: OnceLock<Option<Mutex<WaitChains>>> = OnceLock::new();
    SESSION
        .get_or_init(|| {
            let session = unsafe {
                OpenThreadWaitChainSession(OPEN_THREAD_WAIT_CHAIN_SESSION_FLAGS(0), None)
            };
            (!session.is_null()).then(|| Mutex::new(WaitChains(session)))
        })
        .as_ref()?
        .lock()
        .ok()
}

fn warm_up_wait_chains(other_thread: u32) {
    if let Some(session) = wait_chains() {
        let _ = wait_chain(session.0, other_thread);
    }
}

fn is_gui_thread(thread: u32) -> bool {
    let mut info = GUITHREADINFO {
        cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
        ..GUITHREADINFO::default()
    };
    unsafe { GetGUIThreadInfo(thread, &mut info) }.is_ok()
}

fn wait_chain(session: *mut std::ffi::c_void, thread: u32) -> Option<Vec<WaitNode>> {
    let mut nodes = [WAITCHAIN_NODE_INFO::default(); WCT_MAX_NODE_COUNT as usize];
    let mut count = WCT_MAX_NODE_COUNT;
    let mut cycle = BOOL(0);
    unsafe {
        GetThreadWaitChain(
            session,
            None,
            WCT_OUT_OF_PROC_FLAG,
            thread,
            &mut count,
            nodes.as_mut_ptr(),
            &mut cycle,
        )
    }
    .ok()?;
    let count = (count as usize).min(nodes.len());
    Some(
        nodes[..count]
            .iter()
            .map(|node| {
                if node.ObjectType == WctThreadType {
                    let thread = unsafe { node.Anonymous.ThreadObject };
                    WaitNode::Thread {
                        process: thread.ProcessId,
                        thread: thread.ThreadId,
                    }
                } else if node.ObjectType == WctSendMessageType {
                    WaitNode::SendMessage
                } else {
                    WaitNode::Other
                }
            })
            .collect(),
    )
}

fn execute(command: Command) {
    let Some(window) = with_state(|state| state.window) else {
        return;
    };
    let (result, reply) = match command {
        Command::Offer(text, readers, reply) => (offer(window, text, readers), reply),
        Command::Restore(reply) => (restore(window), reply),
        Command::KeepText(reply) => (keep_text(window), reply),
        Command::PutText(text, reply) => (put_text(window, &text), reply),
    };
    let _ = reply.send(result);
}

fn offer(window: HWND, text: Vec<u8>, readers: Vec<u32>) -> Result<(), ClipboardError> {
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
        state.readers = readers;
        if let Ok(mut activity) = state.activity.lock() {
            *activity = Activity::default();
        }
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
        read_text_as(None)
    }

    fn read_text_as(window: Option<HWND>) -> Option<String> {
        let mut attempt = 0;
        while unsafe { OpenClipboard(window) }.is_err() {
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
    fn the_paste_and_the_history_copy_each_get_their_own_clipboard_window() {
        let paste = SystemClipboard::spawn();
        let copy = SystemClipboard::spawn();
        assert!(paste.is_ok() && copy.is_ok());
    }

    #[test]
    fn two_threads_probing_at_once_neither_crash_nor_block_each_other() {
        let _paste = SystemClipboard::spawn().unwrap();
        let _copy = SystemClipboard::spawn().unwrap();
        let own = HashSet::from([std::process::id()]);
        let threads = threads_of(&own).unwrap();
        let (done, finished) = mpsc::channel();
        for _ in 0..2 {
            let threads = threads.clone();
            let done = done.clone();
            thread::spawn(move || {
                let probed = (0..20)
                    .map(|_| probe_sender(&threads))
                    .filter(|probe| probe.sender.is_none())
                    .map(|probe| probe.threads)
                    .sum::<usize>();
                done.send(probed).unwrap();
            });
        }
        for _ in 0..2 {
            let probed = finished
                .recv_timeout(Duration::from_secs(60))
                .expect("a probe never finished");
            assert!(probed > 0, "no GUI thread was probed");
        }
    }

    #[test]
    #[ignore = "drives the real system clipboard; runs in desktop-ci and in announced smoke runs"]
    fn offered_text_renders_on_first_read_and_the_previous_clipboard_comes_back() {
        let mut clipboard = SystemClipboard::spawn().unwrap();
        let before = read_text();
        clipboard
            .offer("dictado de prueba", &[std::process::id()])
            .unwrap();
        clipboard.arm(1);
        assert!(!clipboard.wait_for_read(Duration::ZERO));
        assert_eq!(read_text().as_deref(), Some("dictado de prueba [private]"));
        assert!(clipboard.wait_for_read(Duration::from_secs(2)));
        clipboard.restore().unwrap();
        assert_eq!(
            read_text().map(|text| text.trim_end_matches(" [private]").to_owned()),
            before.map(|text| text.trim_end_matches(" [private]").to_owned())
        );
    }

    #[test]
    #[ignore = "drives the real system clipboard; runs in desktop-ci and in announced smoke runs"]
    fn a_reader_outside_the_target_app_gets_nothing_and_does_not_count_as_the_paste() {
        let mut clipboard = SystemClipboard::spawn().unwrap();
        let elsewhere = std::process::id().wrapping_add(4);
        clipboard.offer("dictado privado", &[elsewhere]).unwrap();
        clipboard.arm(1);
        let reader = create_window().unwrap();
        assert_eq!(read_text_as(Some(reader)), None);
        assert!(!clipboard.wait_for_read(Duration::from_millis(300)));
        assert!(clipboard.contended());
        clipboard.restore().unwrap();
    }

    #[test]
    #[ignore = "drives the real system clipboard; runs in desktop-ci and in announced smoke runs"]
    fn even_the_target_gets_nothing_before_the_keystroke() {
        let mut clipboard = SystemClipboard::spawn().unwrap();
        clipboard
            .offer("dictado temprano", &[std::process::id()])
            .unwrap();
        assert_eq!(read_text(), None);
        assert!(!clipboard.wait_for_read(Duration::from_millis(300)));
        assert!(!clipboard.contended());
        clipboard.restore().unwrap();
    }

    #[test]
    #[ignore = "drives the real system clipboard; runs in desktop-ci and in announced smoke runs"]
    fn after_an_unproven_reader_even_the_target_gets_nothing_until_the_retry() {
        let mut clipboard = SystemClipboard::spawn().unwrap();
        let target = create_window().unwrap();
        clipboard
            .offer("dictado disputado", &[std::process::id()])
            .unwrap();
        clipboard.arm(1);
        let unproven = thread::spawn(|| read_text_as(None));
        assert_eq!(unproven.join().unwrap(), None);
        assert_eq!(read_text_as(Some(target)), None);
        assert!(!clipboard.wait_for_read(Duration::from_millis(300)));
        assert!(clipboard.contended());
        clipboard.arm(2);
        assert_eq!(
            read_text_as(Some(target)).as_deref(),
            Some("dictado disputado [private]")
        );
        assert!(clipboard.wait_for_read(Duration::from_secs(2)));
        clipboard.restore().unwrap();
    }

    #[test]
    #[ignore = "drives the real system clipboard; runs in desktop-ci and in announced smoke runs"]
    fn a_windowless_read_by_the_target_is_proven_and_counted() {
        let mut clipboard = SystemClipboard::spawn().unwrap();
        let (go, wait) = mpsc::channel::<()>();
        let reader = thread::spawn(move || {
            wait.recv().unwrap();
            read_text_as(None)
        });
        clipboard
            .offer("dictado sin ventana", &[std::process::id()])
            .unwrap();
        clipboard.arm(1);
        go.send(()).unwrap();
        assert_eq!(
            reader.join().unwrap().as_deref(),
            Some("dictado sin ventana [private]")
        );
        assert!(clipboard.wait_for_read(Duration::from_secs(2)));
        clipboard.restore().unwrap();
    }
}
