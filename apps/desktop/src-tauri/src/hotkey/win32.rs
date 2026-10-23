use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock, mpsc};
use std::thread;

use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, GetKeyNameTextW, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS,
    KEYBDINPUT, KEYEVENTF_KEYUP, MAPVK_VK_TO_VSC, MapVirtualKeyW, SendInput, VIRTUAL_KEY,
    VK_CONTROL, VK_ESCAPE, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_MENU, VK_RCONTROL,
    VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, HC_ACTION, KBDLLHOOKSTRUCT, LLKHF_EXTENDED,
    LLKHF_INJECTED, MSG, SetWindowsHookExW, TranslateMessage, WH_KEYBOARD_LL, WM_KEYUP,
    WM_SYSKEYUP,
};

use super::hook::{HookError, KeyEvent, KeyHook, KeySink, OWN_INJECTION_TAG};
use super::{Key, Side};

const MASK_KEY: VIRTUAL_KEY = VIRTUAL_KEY(0xE8);
const ALTGR_FAKE_CTRL_SCAN: u32 = 0x21D;
const RIGHT_SHIFT_SCAN: u32 = 0x36;

#[derive(Clone, Copy, Debug)]
struct RawKey {
    vk: u32,
    scan: u32,
    flags: u32,
    extra: usize,
    up: bool,
}

static RAW_KEYS: OnceLock<mpsc::Sender<RawKey>> = OnceLock::new();
static SWALLOW_ESCAPE: AtomicBool = AtomicBool::new(false);
static ESCAPE_HELD_BACK: AtomicBool = AtomicBool::new(false);

pub fn swallow_escape(on: bool) {
    SWALLOW_ESCAPE.store(on, Ordering::SeqCst);
}

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32
        && let Some(sender) = RAW_KEYS.get()
    {
        let info = unsafe { *(lparam.0 as *const KBDLLHOOKSTRUCT) };
        let message = wparam.0 as u32;
        let raw = RawKey {
            vk: info.vkCode,
            scan: info.scanCode,
            flags: info.flags.0,
            extra: info.dwExtraInfo,
            up: message == WM_KEYUP || message == WM_SYSKEYUP,
        };
        let _ = sender.send(raw);
        if holds_back(raw, &SWALLOW_ESCAPE, &ESCAPE_HELD_BACK) {
            return LRESULT(1);
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

fn holds_back(raw: RawKey, swallow: &AtomicBool, held_back: &AtomicBool) -> bool {
    let own = raw.flags & LLKHF_INJECTED.0 != 0 && raw.extra == OWN_INJECTION_TAG;
    if raw.vk != u32::from(VK_ESCAPE.0) || own {
        return false;
    }
    if raw.up {
        return held_back.swap(false, Ordering::SeqCst);
    }
    let swallowed = swallow.load(Ordering::SeqCst);
    held_back.store(swallowed, Ordering::SeqCst);
    swallowed
}

pub fn install(mut sink: KeySink) -> Result<Arc<dyn KeyHook + Send + Sync>, HookError> {
    let (raw_sender, raw_keys) = mpsc::channel();
    RAW_KEYS
        .set(raw_sender)
        .map_err(|_| HookError("the hook is already installed".into()))?;

    let (ready_sender, ready) = mpsc::channel();
    thread::Builder::new()
        .name("key-hook".into())
        .spawn(move || pump_messages(ready_sender))
        .map_err(|error| HookError(error.to_string()))?;
    ready
        .recv()
        .map_err(|error| HookError(error.to_string()))??;

    thread::Builder::new()
        .name("key-events".into())
        .spawn(move || {
            for raw in raw_keys {
                if let Some(event) = translate(raw) {
                    sink(event, &WindowsHook);
                }
            }
        })
        .map_err(|error| HookError(error.to_string()))?;

    Ok(Arc::new(WindowsHook))
}

pub fn key_code_from_dom(code: &str) -> Option<u32> {
    let indexed = |prefix: &str, first: u32, count: u32| {
        code.strip_prefix(prefix)
            .and_then(|rest| match prefix {
                "Key" => rest
                    .chars()
                    .next()
                    .filter(|c| rest.len() == 1 && c.is_ascii_uppercase())
                    .map(|c| c as u32 - 'A' as u32),
                _ => rest.parse::<u32>().ok(),
            })
            .filter(|index| *index < count)
            .map(|index| first + index)
    };
    let fixed = match code {
        "Space" => 0x20,
        "Enter" | "NumpadEnter" => 0x0D,
        "Tab" => 0x09,
        "Escape" => 0x1B,
        "Backspace" => 0x08,
        "Insert" => 0x2D,
        "Delete" => 0x2E,
        "Home" => 0x24,
        "End" => 0x23,
        "PageUp" => 0x21,
        "PageDown" => 0x22,
        "ArrowLeft" => 0x25,
        "ArrowUp" => 0x26,
        "ArrowRight" => 0x27,
        "ArrowDown" => 0x28,
        "CapsLock" => 0x14,
        "Pause" => 0x13,
        "ScrollLock" => 0x91,
        "PrintScreen" => 0x2C,
        "ContextMenu" => 0x5D,
        "NumpadMultiply" => 0x6A,
        "NumpadAdd" => 0x6B,
        "NumpadSubtract" => 0x6D,
        "NumpadDecimal" => 0x6E,
        "NumpadDivide" => 0x6F,
        "Backquote" => 0xC0,
        "Minus" => 0xBD,
        "Equal" => 0xBB,
        "BracketLeft" => 0xDB,
        "BracketRight" => 0xDD,
        "Backslash" => 0xDC,
        "Semicolon" => 0xBA,
        "Quote" => 0xDE,
        "Comma" => 0xBC,
        "Period" => 0xBE,
        "Slash" => 0xBF,
        "IntlBackslash" => 0xE2,
        _ => 0,
    };
    if fixed != 0 {
        return Some(fixed);
    }
    indexed("Key", 0x41, 26)
        .or_else(|| indexed("Digit", 0x30, 10))
        .or_else(|| indexed("Numpad", 0x60, 10))
        .or_else(|| indexed("F", 0x6F, 25).filter(|key| *key > 0x6F))
}

pub fn key_name(code: u32) -> String {
    let scan = unsafe { MapVirtualKeyW(code, MAPVK_VK_TO_VSC) };
    let mut buffer = [0u16; 64];
    let length = unsafe { GetKeyNameTextW((scan << 16) as i32, &mut buffer) };
    match length {
        1.. => String::from_utf16_lossy(&buffer[..length as usize]),
        _ => format!("Key {code:#04X}"),
    }
}

fn pump_messages(ready: mpsc::Sender<Result<(), HookError>>) {
    let installed = unsafe { GetModuleHandleW(None) }.and_then(|module| unsafe {
        SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(keyboard_proc),
            Some(HINSTANCE(module.0)),
            0,
        )
    });
    if let Err(error) = installed {
        let _ = ready.send(Err(HookError(error.to_string())));
        return;
    }
    let _ = ready.send(Ok(()));

    let mut message = MSG::default();
    while unsafe { GetMessageW(&mut message, None, 0, 0) }.0 > 0 {
        unsafe {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
}

fn translate(raw: RawKey) -> Option<KeyEvent> {
    let injected = raw.flags & LLKHF_INJECTED.0 != 0;
    if injected && raw.extra == OWN_INJECTION_TAG {
        return None;
    }
    let extended = raw.flags & LLKHF_EXTENDED.0 != 0;
    let side = |right: bool| if right { Side::Right } else { Side::Left };
    let vk = VIRTUAL_KEY(raw.vk as u16);
    let key = match vk {
        VK_LCONTROL if raw.scan == ALTGR_FAKE_CTRL_SCAN => return None,
        VK_LCONTROL => Key::Ctrl(Side::Left),
        VK_RCONTROL => Key::Ctrl(Side::Right),
        VK_CONTROL => Key::Ctrl(side(extended)),
        VK_LSHIFT => Key::Shift(Side::Left),
        VK_RSHIFT => Key::Shift(Side::Right),
        VK_SHIFT => Key::Shift(side(raw.scan == RIGHT_SHIFT_SCAN)),
        VK_LMENU => Key::Alt(Side::Left),
        VK_RMENU => Key::Alt(Side::Right),
        VK_MENU => Key::Alt(side(extended)),
        VK_LWIN => Key::Meta(Side::Left),
        VK_RWIN => Key::Meta(Side::Right),
        _ => Key::Other(raw.vk),
    };
    Some(KeyEvent { key, down: !raw.up })
}

struct WindowsHook;

impl KeyHook for WindowsHook {
    fn guard_start_menu(&self) {
        let inputs = [mask_key_input(false), mask_key_input(true)];
        let sent = unsafe { SendInput(&inputs, size_of::<INPUT>() as i32) };
        if sent as usize != inputs.len() {
            log::warn!(
                "start menu guard injected {sent} of {} events",
                inputs.len()
            );
        }
    }

    fn is_held(&self, key: Key) -> bool {
        let state = unsafe { GetAsyncKeyState(i32::from(virtual_key(key).0)) };
        state < 0
    }
}

fn virtual_key(key: Key) -> VIRTUAL_KEY {
    match key {
        Key::Ctrl(Side::Left) => VK_LCONTROL,
        Key::Ctrl(Side::Right) => VK_RCONTROL,
        Key::Shift(Side::Left) => VK_LSHIFT,
        Key::Shift(Side::Right) => VK_RSHIFT,
        Key::Alt(Side::Left) => VK_LMENU,
        Key::Alt(Side::Right) => VK_RMENU,
        Key::Meta(Side::Left) => VK_LWIN,
        Key::Meta(Side::Right) => VK_RWIN,
        Key::Other(code) => VIRTUAL_KEY(code as u16),
    }
}

fn mask_key_input(up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: MASK_KEY,
                wScan: 0,
                dwFlags: if up {
                    KEYEVENTF_KEYUP
                } else {
                    KEYBD_EVENT_FLAGS(0)
                },
                time: 0,
                dwExtraInfo: OWN_INJECTION_TAG,
            },
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(vk: VIRTUAL_KEY, scan: u32, flags: u32, extra: usize) -> RawKey {
        RawKey {
            vk: vk.0 as u32,
            scan,
            flags,
            extra,
            up: false,
        }
    }

    #[test]
    fn own_injections_are_ignored_but_other_injections_drive_the_hook() {
        assert_eq!(
            translate(raw(MASK_KEY, 0, LLKHF_INJECTED.0, OWN_INJECTION_TAG)),
            None
        );
        assert_eq!(
            translate(raw(VK_LWIN, 0, LLKHF_INJECTED.0, 0)),
            Some(KeyEvent {
                key: Key::Meta(Side::Left),
                down: true
            })
        );
    }

    #[test]
    fn esc_is_held_back_from_other_apps_only_while_hands_free_listens() {
        let swallow = AtomicBool::new(false);
        let held_back = AtomicBool::new(false);
        let escape = |up: bool| RawKey {
            up,
            ..raw(VK_ESCAPE, 0x01, 0, 0)
        };
        assert!(!holds_back(escape(false), &swallow, &held_back));
        assert!(!holds_back(escape(true), &swallow, &held_back));
        swallow.store(true, Ordering::SeqCst);
        assert!(holds_back(escape(false), &swallow, &held_back));
        assert!(!holds_back(
            raw(VK_LCONTROL, 0x1D, 0, 0),
            &swallow,
            &held_back
        ));
        let own = raw(VK_ESCAPE, 0x01, LLKHF_INJECTED.0, OWN_INJECTION_TAG);
        assert!(!holds_back(own, &swallow, &held_back));
        swallow.store(false, Ordering::SeqCst);
        assert!(holds_back(escape(true), &swallow, &held_back));
        assert!(!holds_back(escape(false), &swallow, &held_back));
        assert!(!holds_back(escape(true), &swallow, &held_back));
    }

    #[test]
    fn altgr_fake_left_ctrl_is_dropped_and_right_alt_stays_right() {
        assert_eq!(
            translate(raw(VK_LCONTROL, ALTGR_FAKE_CTRL_SCAN, 0, 0)),
            None
        );
        assert_eq!(
            translate(raw(VK_RMENU, 0x38, LLKHF_EXTENDED.0, 0)).map(|event| event.key),
            Some(Key::Alt(Side::Right))
        );
        assert_eq!(
            translate(raw(VK_LCONTROL, 0x1D, 0, 0)).map(|event| event.key),
            Some(Key::Ctrl(Side::Left))
        );
    }

    #[test]
    fn dom_codes_map_to_windows_virtual_keys() {
        assert_eq!(key_code_from_dom("KeyA"), Some(0x41));
        assert_eq!(key_code_from_dom("KeyZ"), Some(0x5A));
        assert_eq!(key_code_from_dom("Digit7"), Some(0x37));
        assert_eq!(key_code_from_dom("F1"), Some(0x70));
        assert_eq!(key_code_from_dom("F13"), Some(0x7C));
        assert_eq!(key_code_from_dom("F24"), Some(0x87));
        assert_eq!(key_code_from_dom("Space"), Some(0x20));
        for unknown in ["F0", "F25", "Keya", "KeyAB", "Lang1", ""] {
            assert_eq!(key_code_from_dom(unknown), None, "{unknown}");
        }
    }

    #[test]
    fn generic_modifier_codes_resolve_their_side() {
        assert_eq!(
            translate(raw(VK_CONTROL, 0x1D, LLKHF_EXTENDED.0, 0)).map(|event| event.key),
            Some(Key::Ctrl(Side::Right))
        );
        assert_eq!(
            translate(raw(VK_SHIFT, RIGHT_SHIFT_SCAN, 0, 0)).map(|event| event.key),
            Some(Key::Shift(Side::Right))
        );
    }
}
