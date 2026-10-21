use std::sync::{OnceLock, mpsc};
use std::thread;

use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT,
    KEYEVENTF_KEYUP, SendInput, VIRTUAL_KEY, VK_CONTROL, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN,
    VK_MENU, VK_RCONTROL, VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT,
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

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32
        && let Some(sender) = RAW_KEYS.get()
    {
        let info = unsafe { *(lparam.0 as *const KBDLLHOOKSTRUCT) };
        let message = wparam.0 as u32;
        let _ = sender.send(RawKey {
            vk: info.vkCode,
            scan: info.scanCode,
            flags: info.flags.0,
            extra: info.dwExtraInfo,
            up: message == WM_KEYUP || message == WM_SYSKEYUP,
        });
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

pub fn install(mut sink: KeySink) -> Result<(), HookError> {
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

    Ok(())
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
