param(
    [Parameter(Mandatory = $true, Position = 0)] [string] $Command,
    [Parameter(ValueFromRemainingArguments = $true)] [string[]] $Rest
)

$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;

public static class TmwSmoke
{
    delegate bool EnumProc(IntPtr window, IntPtr parameter);
    delegate IntPtr HookProc(int code, IntPtr wparam, IntPtr lparam);

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr parameter);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder text, int length);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr window);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint attach, uint to, bool doAttach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern bool OpenClipboard(IntPtr owner);
    [DllImport("user32.dll")] static extern bool CloseClipboard();
    [DllImport("user32.dll")] static extern bool EmptyClipboard();
    [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint format);
    [DllImport("user32.dll")] static extern IntPtr SetClipboardData(uint format, IntPtr memory);
    [DllImport("user32.dll")] static extern uint EnumClipboardFormats(uint format);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern uint RegisterClipboardFormat(string name);
    [DllImport("kernel32.dll")] static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);
    [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr memory);
    [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr memory);
    [DllImport("user32.dll")] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint thread);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wparam, IntPtr lparam);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] static extern bool GetMessage(out MSG message, IntPtr window, uint min, uint max);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG message);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG message);

    [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION u; }
    [StructLayout(LayoutKind.Sequential)] struct KBDLLHOOKSTRUCT { public uint vkCode; public uint scanCode; public uint flags; public uint time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct MSLLHOOKSTRUCT { public int x; public int y; public uint mouseData; public uint flags; public uint time; public IntPtr extra; }

    const uint CF_UNICODETEXT = 13;
    const uint KEYEVENTF_KEYUP = 2;
    const uint KEYEVENTF_UNICODE = 4;

    public static string Describe(IntPtr window)
    {
        uint pid;
        GetWindowThreadProcessId(window, out pid);
        var title = new StringBuilder(512);
        GetWindowText(window, title, title.Capacity);
        var cls = new StringBuilder(256);
        GetClassName(window, cls, cls.Capacity);
        string exe = "?";
        try { exe = Process.GetProcessById((int)pid).ProcessName; } catch { }
        return string.Format("hwnd={0:x} pid={1} exe={2} class={3} title={4}", window.ToInt64(), pid, exe, cls, title);
    }

    [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint size; public uint time; }
    [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO info);

    public static uint IdleSeconds()
    {
        var info = new LASTINPUTINFO { size = 8 };
        GetLastInputInfo(ref info);
        return ((uint)Environment.TickCount - info.time) / 1000;
    }

    public static string Foreground() { return Describe(GetForegroundWindow()); }

    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);

    public static bool Close(long window) { return PostMessage(new IntPtr(window), 0x0010, IntPtr.Zero, IntPtr.Zero); }

    public static bool IsForeground(long window) { return GetForegroundWindow().ToInt64() == window; }

    public static long Find(string cls, string title)
    {
        long found = 0;
        EnumWindows((window, parameter) =>
        {
            if (!IsWindowVisible(window)) return true;
            var text = new StringBuilder(512);
            GetWindowText(window, text, text.Capacity);
            var name = new StringBuilder(256);
            GetClassName(window, name, name.Capacity);
            if ((cls == "*" || name.ToString() == cls) && text.ToString() == title) { found = window.ToInt64(); return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static long FindOfProcess(int pid)
    {
        long found = 0;
        EnumWindows((window, parameter) =>
        {
            uint owner;
            GetWindowThreadProcessId(window, out owner);
            if (owner == pid && IsWindowVisible(window)) { found = window.ToInt64(); return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static bool Focus(long handle)
    {
        var window = new IntPtr(handle);
        if (GetForegroundWindow() == window) return true;
        try { AutomationElement.FromHandle(window).SetFocus(); } catch { }
        for (int i = 0; i < 20 && GetForegroundWindow() != window; i++) Thread.Sleep(25);
        if (GetForegroundWindow() == window) return true;
        uint ignored;
        uint foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out ignored);
        uint own = GetCurrentThreadId();
        AttachThreadInput(own, foregroundThread, true);
        BringWindowToTop(window);
        SetForegroundWindow(window);
        AttachThreadInput(own, foregroundThread, false);
        for (int i = 0; i < 20 && GetForegroundWindow() != window; i++) Thread.Sleep(25);
        return GetForegroundWindow() == window;
    }

    static INPUT Key(ushort vk, bool up)
    {
        var input = new INPUT { type = 1 };
        input.u.ki = new KEYBDINPUT { wVk = vk, dwFlags = up ? KEYEVENTF_KEYUP : 0 };
        return input;
    }

    public static void Chord(params ushort[] keys)
    {
        var inputs = new List<INPUT>();
        foreach (var key in keys) inputs.Add(Key(key, false));
        for (int i = keys.Length - 1; i >= 0; i--) inputs.Add(Key(keys[i], true));
        SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(INPUT)));
    }

    public static void Hold(ushort[] keys, int milliseconds)
    {
        var down = new List<INPUT>();
        foreach (var key in keys) { down.Add(Key(key, false)); }
        foreach (var input in down) { SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT))); Thread.Sleep(30); }
        Thread.Sleep(milliseconds);
        for (int i = keys.Length - 1; i >= 0; i--) { SendInput(1, new[] { Key(keys[i], true) }, Marshal.SizeOf(typeof(INPUT))); Thread.Sleep(30); }
    }

    public static void Type(string text)
    {
        foreach (char c in text)
        {
            var down = new INPUT { type = 1 };
            down.u.ki = new KEYBDINPUT { wScan = c, dwFlags = KEYEVENTF_UNICODE };
            var up = new INPUT { type = 1 };
            up.u.ki = new KEYBDINPUT { wScan = c, dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP };
            SendInput(2, new[] { down, up }, Marshal.SizeOf(typeof(INPUT)));
            Thread.Sleep(5);
        }
    }

    static bool Open()
    {
        for (int i = 0; i < 100; i++) { if (OpenClipboard(IntPtr.Zero)) return true; Thread.Sleep(10); }
        return false;
    }

    public static string ClipboardText()
    {
        if (!Open()) throw new Exception("the clipboard stayed busy");
        try
        {
            var handle = GetClipboardData(CF_UNICODETEXT);
            if (handle == IntPtr.Zero) return null;
            var pointer = GlobalLock(handle);
            try { return Marshal.PtrToStringUni(pointer); } finally { GlobalUnlock(handle); }
        }
        finally { CloseClipboard(); }
    }

    static void Put(uint format, byte[] bytes)
    {
        var memory = GlobalAlloc(2, new UIntPtr((uint)Math.Max(bytes.Length, 1)));
        var pointer = GlobalLock(memory);
        Marshal.Copy(bytes, 0, pointer, bytes.Length);
        GlobalUnlock(memory);
        SetClipboardData(format, memory);
    }

    public static void SetClipboardText(string text)
    {
        if (!Open()) throw new Exception("the clipboard stayed busy");
        try
        {
            EmptyClipboard();
            if (text == null) return;
            Put(CF_UNICODETEXT, Encoding.Unicode.GetBytes(text + "\0"));
            Put(RegisterClipboardFormat("ExcludeClipboardContentFromMonitorProcessing"), new byte[] { 0 });
            Put(RegisterClipboardFormat("CanIncludeInClipboardHistory"), new byte[4]);
            Put(RegisterClipboardFormat("CanUploadToCloudClipboard"), new byte[4]);
        }
        finally { CloseClipboard(); }
    }

    public static string Dialog(long handle, string press)
    {
        var root = AutomationElement.FromHandle(new IntPtr(handle));
        var texts = root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Text));
        string found = null;
        foreach (AutomationElement text in texts)
        {
            var name = text.Current.Name ?? "";
            if (name.IndexOf("multiple lines", StringComparison.OrdinalIgnoreCase) >= 0 || name.IndexOf("varias l", StringComparison.OrdinalIgnoreCase) >= 0) { found = name; break; }
        }
        if (found == null) return null;
        var names = new List<string>();
        var buttons = root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button));
        string pressed = "none";
        foreach (AutomationElement button in buttons)
        {
            var name = button.Current.Name ?? "";
            names.Add(name);
            if (pressed == "none" && Array.IndexOf(press.Split('|'), name) >= 0)
            {
                ((InvokePattern)button.GetCurrentPattern(InvokePattern.Pattern)).Invoke();
                pressed = name;
            }
        }
        return found + " [buttons: " + string.Join(", ", names) + "; pressed " + pressed + "]";
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct STARTUPINFO
    {
        public int cb; public string reserved; public string desktop; public string title;
        public int x; public int y; public int width; public int height; public int xChars; public int yChars;
        public int fill; public int flags; public short show; public short reserved2; public IntPtr reserved3;
        public IntPtr input; public IntPtr output; public IntPtr error;
    }
    [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process; public IntPtr thread; public int pid; public int tid; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CreateProcess(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes,
        bool inherit, uint flags, IntPtr environment, string directory, ref STARTUPINFO startup, out PROCESS_INFORMATION information);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    public static int Start(string path, string arguments, bool console)
    {
        var startup = new STARTUPINFO { cb = Marshal.SizeOf(typeof(STARTUPINFO)) };
        PROCESS_INFORMATION information;
        uint flags = console ? 0x00000010u : 0x08000000u;
        if (!CreateProcess(null, new StringBuilder("\"" + path + "\" " + arguments), IntPtr.Zero, IntPtr.Zero, false, flags,
            IntPtr.Zero, null, ref startup, out information))
            throw new System.ComponentModel.Win32Exception();
        CloseHandle(information.thread);
        CloseHandle(information.process);
        return information.pid;
    }

    public static string EditText(long handle)
    {
        var root = AutomationElement.FromHandle(new IntPtr(handle));
        AutomationElement area = null;
        for (int i = 0; i < 25 && area == null; i++)
        {
            area = root.FindFirst(TreeScope.Descendants, new PropertyCondition(AutomationElement.AutomationIdProperty, "t"));
            if (area == null) Thread.Sleep(200);
        }
        object found;
        if (area != null && area.TryGetCurrentPattern(ValuePattern.Pattern, out found)) return ((ValuePattern)found).Current.Value;
        var edits = root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit));
        foreach (AutomationElement edit in edits)
        {
            object pattern;
            if (edit.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) return ((ValuePattern)pattern).Current.Value;
        }
        return null;
    }

    public static string Tree(long handle)
    {
        var lines = new List<string>();
        var walker = TreeWalker.RawViewWalker;
        Action<AutomationElement, int> visit = null;
        visit = (element, depth) =>
        {
            if (depth > 25 || lines.Count > 400) return;
            var current = element.Current;
            var name = current.Name ?? "";
            if (name.Length > 40) name = name.Substring(0, 40);
            lines.Add(new string(' ', depth) + current.ControlType.ProgrammaticName + " '" + name + "' " + current.ClassName);
            for (var child = walker.GetFirstChild(element); child != null; child = walker.GetNextSibling(child)) visit(child, depth + 1);
        };
        visit(AutomationElement.FromHandle(new IntPtr(handle)), 0);
        return string.Join("\n", lines);
    }

    public static bool Fill(long handle, int index, string value)
    {
        var root = AutomationElement.FromHandle(new IntPtr(handle));
        var edits = root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit));
        if (edits.Count <= index) return false;
        ((ValuePattern)edits[index].GetCurrentPattern(ValuePattern.Pattern)).SetValue(value);
        return true;
    }

    public static string Invoke(long handle, string names)
    {
        var root = AutomationElement.FromHandle(new IntPtr(handle));
        foreach (var name in names.Split('|'))
        {
            foreach (AutomationElement element in root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.NameProperty, name)))
            {
                object pattern;
                if (element.TryGetCurrentPattern(InvokePattern.Pattern, out pattern)) { ((InvokePattern)pattern).Invoke(); return name; }
                if (element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pattern)) { ((SelectionItemPattern)pattern).Select(); return name; }
                if (element.TryGetCurrentPattern(TogglePattern.Pattern, out pattern)) { ((TogglePattern)pattern).Toggle(); return name; }
            }
        }
        return null;
    }

    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    static AutoResetEvent raceSignal = new AutoResetEvent(false);
    static HookProc raceHook;

    [DllImport("user32.dll")] static extern bool AddClipboardFormatListener(IntPtr window);

    class UpdateWatcher : System.Windows.Forms.NativeWindow
    {
        public UpdateWatcher()
        {
            CreateHandle(new System.Windows.Forms.CreateParams { Parent = new IntPtr(-3) });
            AddClipboardFormatListener(Handle);
        }

        protected override void WndProc(ref System.Windows.Forms.Message message)
        {
            if (message.Msg == 0x031D) raceSignal.Set();
            base.WndProc(ref message);
        }
    }

    public static void Race(string file, string mode)
    {
        var reader = new Thread(() =>
        {
            while (true)
            {
                raceSignal.WaitOne();
                string result = "busy";
                for (int i = 0; i < 50; i++)
                {
                    if (OpenClipboard(IntPtr.Zero))
                    {
                        var handle = GetClipboardData(CF_UNICODETEXT);
                        if (handle == IntPtr.Zero) result = "empty";
                        else
                        {
                            var pointer = GlobalLock(handle);
                            var text = Marshal.PtrToStringUni(pointer) ?? "";
                            GlobalUnlock(handle);
                            result = text.Contains("Take My Word") ? "read a dictation" : "read other text";
                        }
                        CloseClipboard();
                        break;
                    }
                    Thread.Sleep(1);
                }
                File.AppendAllText(file, DateTime.UtcNow.ToString("o") + " " + result + "\n");
            }
        });
        reader.IsBackground = true;
        reader.Start();
        raceHook = (code, wparam, lparam) =>
        {
            if (code >= 0 && (wparam.ToInt64() == 0x100 || wparam.ToInt64() == 0x104))
            {
                var data = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lparam, typeof(KBDLLHOOKSTRUCT));
                if (data.vkCode == 0x56 && (GetAsyncKeyState(0x11) & 0x8000) != 0) raceSignal.Set();
            }
            return CallNextHookEx(IntPtr.Zero, code, wparam, lparam);
        };
        UpdateWatcher watcher = null;
        if (mode == "update") watcher = new UpdateWatcher();
        else SetWindowsHookEx(13, raceHook, GetModuleHandle(null), 0);
        File.WriteAllText(file + ".ready", mode);
        MSG message;
        while (GetMessage(out message, IntPtr.Zero, 0, 0)) { TranslateMessage(ref message); DispatchMessage(ref message); }
    }

    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern void PostQuitMessage(int code);
    [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr memory);

    static string guardFile;
    static HookProc keyboard;
    static HookProc mouse;
    static IntPtr keyboardHook;
    static IntPtr mouseHook;
    static bool tripped;

    static void Trip(string kind)
    {
        if (tripped) return;
        tripped = true;
        UnhookWindowsHookEx(keyboardHook);
        UnhookWindowsHookEx(mouseHook);
        File.WriteAllText(guardFile, DateTime.UtcNow.ToString("o") + " real " + kind + " input\n");
        PostQuitMessage(0);
    }

    public static void Guard(string file)
    {
        guardFile = file;
        keyboard = (code, wparam, lparam) =>
        {
            if (code >= 0 && (((KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lparam, typeof(KBDLLHOOKSTRUCT))).flags & 0x10) == 0) Trip("keyboard");
            return CallNextHookEx(IntPtr.Zero, code, wparam, lparam);
        };
        mouse = (code, wparam, lparam) =>
        {
            if (code >= 0 && (((MSLLHOOKSTRUCT)Marshal.PtrToStructure(lparam, typeof(MSLLHOOKSTRUCT))).flags & 0x1) == 0) Trip("mouse");
            return CallNextHookEx(IntPtr.Zero, code, wparam, lparam);
        };
        var module = GetModuleHandle(null);
        keyboardHook = SetWindowsHookEx(13, keyboard, module, 0);
        mouseHook = SetWindowsHookEx(14, mouse, module, 0);
        File.WriteAllText(guardFile + ".ready", "ready");
        MSG message;
        while (GetMessage(out message, IntPtr.Zero, 0, 0)) { TranslateMessage(ref message); DispatchMessage(ref message); }
    }

    static readonly HashSet<uint> GdiFormats = new HashSet<uint> { 2, 3, 9, 14, 0x80, 0x82, 0x83, 0x8E };

    static byte[] SerializeClipboard(out string formats)
    {
        var list = new List<string>();
        var stream = new MemoryStream();
        var writer = new BinaryWriter(stream);
        if (!Open()) throw new Exception("the clipboard stayed busy");
        try
        {
            uint format = 0;
            while ((format = EnumClipboardFormats(format)) != 0)
            {
                if (GdiFormats.Contains(format) || (format >= 0x200 && format <= 0x3FF)) { list.Add(format + "(not saved)"); continue; }
                var handle = GetClipboardData(format);
                if (handle == IntPtr.Zero) { list.Add(format + "(empty)"); continue; }
                var size = (int)GlobalSize(handle).ToUInt64();
                var pointer = GlobalLock(handle);
                if (pointer == IntPtr.Zero) { list.Add(format + "(not saved)"); continue; }
                var bytes = new byte[size];
                Marshal.Copy(pointer, bytes, 0, size);
                GlobalUnlock(handle);
                writer.Write(format);
                writer.Write(size);
                writer.Write(bytes);
                list.Add(format + ":" + size);
            }
        }
        finally { CloseClipboard(); }
        formats = string.Join(",", list);
        return stream.ToArray();
    }

    static string Sha256(byte[] data)
    {
        return BitConverter.ToString(System.Security.Cryptography.SHA256.Create().ComputeHash(data)).Replace("-", "").ToLowerInvariant();
    }

    public static string ClipboardHash()
    {
        string formats;
        var data = SerializeClipboard(out formats);
        return "formats=" + formats + " sha256=" + Sha256(data);
    }

    public static string SealClipboard(string file)
    {
        string formats;
        var data = SerializeClipboard(out formats);
        File.WriteAllBytes(file, System.Security.Cryptography.ProtectedData.Protect(data, null, System.Security.Cryptography.DataProtectionScope.CurrentUser));
        return "sealed formats=" + formats + " sha256=" + Sha256(data);
    }

    public static string RestoreSealed(string file)
    {
        var data = System.Security.Cryptography.ProtectedData.Unprotect(File.ReadAllBytes(file), null, System.Security.Cryptography.DataProtectionScope.CurrentUser);
        var reader = new BinaryReader(new MemoryStream(data));
        if (!Open()) throw new Exception("the clipboard stayed busy");
        try
        {
            EmptyClipboard();
            while (reader.BaseStream.Position < reader.BaseStream.Length)
            {
                var format = reader.ReadUInt32();
                var bytes = reader.ReadBytes(reader.ReadInt32());
                Put(format, bytes);
            }
        }
        finally { CloseClipboard(); }
        string formats;
        var now = Sha256(SerializeClipboard(out formats));
        var saved = Sha256(data);
        if (now != saved) return "MISMATCH sealed sha256=" + saved + " now sha256=" + now + " formats=" + formats;
        File.Delete(file);
        return "restored and verified sha256=" + now;
    }

    [StructLayout(LayoutKind.Sequential)] struct RECT { public int left, top, right, bottom; }
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out RECT rect);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window, out RECT rect);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window, IntPtr dc);
    [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dest, int x, int y, int width, int height, IntPtr source, int sx, int sy, uint op);

    const long WS_EX_NOACTIVATE = 0x08000000;

    public static void PhysicalPixels() { SetProcessDpiAwarenessContext(new IntPtr(-4)); }

    public static long OverlayOf(int pid)
    {
        long found = 0;
        EnumWindows((window, parameter) =>
        {
            uint owner;
            GetWindowThreadProcessId(window, out owner);
            var cls = new StringBuilder(256);
            GetClassName(window, cls, cls.Capacity);
            if (owner == pid && cls.ToString() == "Tauri Window" && (GetWindowLongPtr(window, -20).ToInt64() & WS_EX_NOACTIVATE) != 0) { found = window.ToInt64(); return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static long MainOf(int pid)
    {
        long found = 0;
        EnumWindows((window, parameter) =>
        {
            uint owner;
            GetWindowThreadProcessId(window, out owner);
            var cls = new StringBuilder(256);
            GetClassName(window, cls, cls.Capacity);
            if (owner == pid && IsWindowVisible(window) && cls.ToString() == "Tauri Window" && (GetWindowLongPtr(window, -20).ToInt64() & WS_EX_NOACTIVATE) == 0) { found = window.ToInt64(); return false; }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static string Frame(long handle)
    {
        var window = new IntPtr(handle);
        RECT outer, inner;
        GetWindowRect(window, out outer);
        GetClientRect(window, out inner);
        int width = outer.right - outer.left, height = outer.bottom - outer.top;
        bool frameless = inner.right == width && inner.bottom == height;
        bool noActivate = (GetWindowLongPtr(window, -20).ToInt64() & WS_EX_NOACTIVATE) != 0;
        return string.Format("{0} window={1}x{2} client={3}x{4} visible={5} noactivate={6}",
            frameless ? "frameless" : "framed", width, height, inner.right, inner.bottom, IsWindowVisible(window), noActivate);
    }

    public static int[] RectOf(long handle)
    {
        RECT outer;
        GetWindowRect(new IntPtr(handle), out outer);
        return new[] { outer.left, outer.top, outer.right - outer.left, outer.bottom - outer.top };
    }

    public static System.Drawing.Bitmap Grab(int[] rect)
    {
        var bitmap = new System.Drawing.Bitmap(rect[2], rect[3]);
        using (var g = System.Drawing.Graphics.FromImage(bitmap))
        {
            var dest = g.GetHdc();
            var screen = GetDC(IntPtr.Zero);
            BitBlt(dest, 0, 0, rect[2], rect[3], screen, rect[0], rect[1], 0x00CC0020 | 0x40000000);
            ReleaseDC(IntPtr.Zero, screen);
            g.ReleaseHdc(dest);
        }
        return bitmap;
    }

    public static int Accent(System.Drawing.Bitmap shot)
    {
        int count = 0;
        for (int x = 0; x < shot.Width; x++)
            for (int y = 0; y < shot.Height; y++)
            {
                var p = shot.GetPixel(x, y);
                if (p.R > 170 && p.R - p.G > 60 && p.R - p.B > 90) count++;
            }
        return count;
    }

    public static int TopBandChanges(System.Drawing.Bitmap shot, System.Drawing.Bitmap baseline)
    {
        int changed = 0, rows = shot.Height / 3;
        for (int x = 0; x < shot.Width; x++)
            for (int y = 0; y < rows; y++)
            {
                var p = shot.GetPixel(x, y); var q = baseline.GetPixel(x, y);
                if (Math.Abs(p.R - q.R) + Math.Abs(p.G - q.G) + Math.Abs(p.B - q.B) > 48) changed++;
            }
        return changed;
    }

    static bool IsAccent(System.Drawing.Color p) { return p.R > 170 && p.R - p.G > 60 && p.R - p.B > 90; }

    public static int NewAccent(System.Drawing.Bitmap shot, System.Drawing.Bitmap baseline)
    {
        int count = 0;
        for (int x = 0; x < shot.Width; x++)
            for (int y = 0; y < shot.Height; y++)
                if (IsAccent(shot.GetPixel(x, y)) && !IsAccent(baseline.GetPixel(x, y))) count++;
        return count;
    }

    public static int NewAccentWidth(System.Drawing.Bitmap shot, System.Drawing.Bitmap baseline)
    {
        int left = int.MaxValue, right = -1;
        for (int x = 0; x < shot.Width; x++)
            for (int y = 0; y < shot.Height; y++)
                if (IsAccent(shot.GetPixel(x, y)) && !IsAccent(baseline.GetPixel(x, y))) { if (x < left) left = x; if (x > right) right = x; }
        return right < 0 ? 0 : right - left + 1;
    }

    [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int size; public RECT monitor; public RECT work; public uint flags; }
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);

    public static string Centred(long handle, double width, double height, double margin)
    {
        var window = new IntPtr(handle);
        var info = new MONITORINFO { size = Marshal.SizeOf(typeof(MONITORINFO)) };
        GetMonitorInfo(MonitorFromWindow(window, 2), ref info);
        double scale = GetDpiForWindow(window) / 96.0;
        int w = (int)Math.Round(width * scale), h = (int)Math.Round(height * scale);
        int x = info.work.left + (info.work.right - info.work.left - w) / 2;
        int y = info.work.bottom - h - (int)Math.Round(margin * scale);
        RECT outer;
        GetWindowRect(window, out outer);
        bool centred = Math.Abs(outer.left - x) <= 1 && Math.Abs(outer.top - y) <= 1
            && Math.Abs(outer.right - outer.left - w) <= 1 && Math.Abs(outer.bottom - outer.top - h) <= 1;
        return string.Format("{0}({1},{2} {3}x{4} at {5}%, expected {6},{7} {8}x{9})", centred ? "centred" : "off-centre",
            outer.left, outer.top, outer.right - outer.left, outer.bottom - outer.top, Math.Round(scale * 100), x, y, w, h);
    }

    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT point);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }

    public static string Cursor() { POINT p; GetCursorPos(out p); return p.x + "," + p.y; }

    public static void MoveCursor(int x, int y)
    {
        int left = GetSystemMetrics(76), top = GetSystemMetrics(77), width = GetSystemMetrics(78), height = GetSystemMetrics(79);
        var input = new INPUT { type = 0 };
        input.u.mi = new MOUSEINPUT
        {
            dx = (int)Math.Round((x - left) * 65535.0 / (width - 1)),
            dy = (int)Math.Round((y - top) * 65535.0 / (height - 1)),
            dwFlags = 0x0001 | 0x8000 | 0x4000
        };
        SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT)));
    }

    [StructLayout(LayoutKind.Sequential)] struct DC_SOURCE { public uint adapterLow; public int adapterHigh; public uint id; public uint mode; public uint flags; }
    [StructLayout(LayoutKind.Sequential)] struct DC_TARGET { public uint adapterLow; public int adapterHigh; public uint id; public uint mode; public int tech; public int rotation; public int scaling; public uint num; public uint den; public int order; public int available; public uint flags; }
    [StructLayout(LayoutKind.Sequential)] struct DC_PATH { public DC_SOURCE source; public DC_TARGET target; public uint flags; }
    [StructLayout(LayoutKind.Sequential)] struct DC_HEADER { public int type; public uint size; public uint adapterLow; public int adapterHigh; public uint id; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct DC_SOURCE_NAME { public DC_HEADER header; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string name; }
    [StructLayout(LayoutKind.Sequential)] struct DC_DPI_GET { public DC_HEADER header; public int min; public int cur; public int max; }
    [StructLayout(LayoutKind.Sequential)] struct DC_DPI_SET { public DC_HEADER header; public int scale; }
    [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint flags, out uint paths, out uint modes);
    [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint flags, ref uint paths, [Out] DC_PATH[] pathArray, ref uint modes, [Out] byte[] modeArray, IntPtr topology);
    [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(ref DC_SOURCE_NAME info);
    [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(ref DC_DPI_GET info);
    [DllImport("user32.dll")] static extern int DisplayConfigSetDeviceInfo(ref DC_DPI_SET info);
    static readonly int[] ScaleSteps = { 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500 };

    static DC_PATH Path(string display)
    {
        uint paths, modes;
        if (GetDisplayConfigBufferSizes(2, out paths, out modes) != 0) throw new Exception("GetDisplayConfigBufferSizes failed");
        var pathArray = new DC_PATH[paths];
        var modeArray = new byte[modes * 64];
        if (QueryDisplayConfig(2, ref paths, pathArray, ref modes, modeArray, IntPtr.Zero) != 0) throw new Exception("QueryDisplayConfig failed");
        for (int i = 0; i < paths; i++)
        {
            var name = new DC_SOURCE_NAME();
            name.header = new DC_HEADER { type = 1, size = (uint)Marshal.SizeOf(typeof(DC_SOURCE_NAME)), adapterLow = pathArray[i].source.adapterLow, adapterHigh = pathArray[i].source.adapterHigh, id = pathArray[i].source.id };
            if (DisplayConfigGetDeviceInfo(ref name) == 0 && name.name == display) return pathArray[i];
        }
        throw new Exception("no display " + display);
    }

    static DC_HEADER Header(DC_PATH path, int type, Type kind)
    {
        return new DC_HEADER { type = type, size = (uint)Marshal.SizeOf(kind), adapterLow = path.source.adapterLow, adapterHigh = path.source.adapterHigh, id = path.source.id };
    }

    public static int ScaleOf(string display)
    {
        var path = Path(display);
        var dpi = new DC_DPI_GET { header = Header(path, -3, typeof(DC_DPI_GET)) };
        if (DisplayConfigGetDeviceInfo(ref dpi) != 0) throw new Exception("reading the scale failed");
        return ScaleSteps[Math.Max(0, Math.Min(ScaleSteps.Length - 1, Math.Abs(dpi.min) + dpi.cur))];
    }

    public static void SetScale(string display, int percent)
    {
        var path = Path(display);
        var dpi = new DC_DPI_GET { header = Header(path, -3, typeof(DC_DPI_GET)) };
        if (DisplayConfigGetDeviceInfo(ref dpi) != 0) throw new Exception("reading the scale failed");
        int step = Array.IndexOf(ScaleSteps, percent);
        if (step < 0) throw new Exception("unsupported scale " + percent);
        var set = new DC_DPI_SET { header = Header(path, -4, typeof(DC_DPI_SET)), scale = step - Math.Abs(dpi.min) };
        if (DisplayConfigSetDeviceInfo(ref set) != 0) throw new Exception("setting the scale failed");
    }

    public static void Send(ushort vk, bool up)
    {
        SendInput(1, new[] { Key(vk, up) }, Marshal.SizeOf(typeof(INPUT)));
    }
}
'@

$cache = $PSScriptRoot
$hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($source))).Replace('-', '').Substring(0, 16)
$assembly = Join-Path $cache "TmwSmoke-$hash.dll"
if (-not (Test-Path $assembly)) {
    Add-Type -TypeDefinition $source -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, WindowsBase, System.Windows.Forms, System.Security, System.Drawing -OutputAssembly $assembly -OutputType Library
}
Add-Type -Path $assembly
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

$keys = @{ ctrl = 0xA2; shift = 0xA0; alt = 0xA4; win = 0x5B; v = 0x56; a = 0x41; delete = 0x2E; insert = 0x2D; f11 = 0x7A; f12 = 0x7B; escape = 0x1B; enter = 0x0D; tab = 0x09 }

switch ($Command) {
    'idle' { [TmwSmoke]::IdleSeconds() }
    'foreground' { [TmwSmoke]::Foreground() }
    'is-foreground' { if ([TmwSmoke]::IsForeground([long]$Rest[0])) { 'yes' } else { 'no' } }
    'find' { [TmwSmoke]::Find($Rest[0], $Rest[1]) }
    'find-process' { [TmwSmoke]::FindOfProcess([int]$Rest[0]) }
    'describe' { [TmwSmoke]::Describe([IntPtr][long]$Rest[0]) }
    'close-window' { if ([TmwSmoke]::Close([long]$Rest[0])) { 'closed' } else { 'not closed'; exit 4 } }
    'focus' { if ([TmwSmoke]::Focus([long]$Rest[0])) { 'focused' } else { 'not focused'; exit 4 } }
    'chord' { [TmwSmoke]::Chord([uint16[]]($Rest | ForEach-Object { $keys[$_] })) }
    'hold' { [TmwSmoke]::Hold([uint16[]]($Rest | Select-Object -Skip 1 | ForEach-Object { $keys[$_] }), [int]$Rest[0]) }
    'type-env' { [TmwSmoke]::Type([Environment]::GetEnvironmentVariable($Rest[0])) }
    'clipboard' { $text = [TmwSmoke]::ClipboardText(); if ($null -eq $text) { '<none>' } else { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text)) } }
    'clipboard-hash' { [TmwSmoke]::ClipboardHash() }
    'seal-clipboard' { [TmwSmoke]::SealClipboard($Rest[0]) }
    'restore-sealed' { $result = [TmwSmoke]::RestoreSealed($Rest[0]); $result; if ($result -like 'MISMATCH*') { exit 3 } }
    'set-clipboard' { [TmwSmoke]::SetClipboardText([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Rest[0]))) }
    'dialog' { $found = [TmwSmoke]::Dialog([long]$Rest[0], $Rest[1]); if ($found) { $found } else { '<none>' } }
    'start' { [TmwSmoke]::Start($Rest[0], [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Rest[1])), $false) }
    'start-console' { [TmwSmoke]::Start($Rest[0], [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Rest[1])), $true) }
    'guard' { [TmwSmoke]::Guard($Rest[0]) }
    'tree' { [TmwSmoke]::Tree([long]$Rest[0]) }
    'fill-env' { if ([TmwSmoke]::Fill([long]$Rest[0], [int]$Rest[1], [Environment]::GetEnvironmentVariable($Rest[2]))) { 'filled' } else { 'no field'; exit 4 } }
    'invoke' { $found = [TmwSmoke]::Invoke([long]$Rest[0], $Rest[1]); if ($found) { $found } else { '<none>'; exit 4 } }
    'race' { [TmwSmoke]::Race($Rest[0], $Rest[1]) }
    'main-of' { [TmwSmoke]::MainOf([int]$Rest[0]) }
    'overlay-frame' {
        [TmwSmoke]::PhysicalPixels()
        $overlay = [TmwSmoke]::OverlayOf([int]$Rest[0])
        if ($overlay -eq 0) { 'no overlay'; exit 4 }
        [TmwSmoke]::Frame($overlay)
    }
    'displays' {
        [TmwSmoke]::PhysicalPixels()
        Add-Type -AssemblyName System.Windows.Forms
        [Windows.Forms.Screen]::AllScreens | ForEach-Object { '{0} {1} {2},{3},{4},{5} {6}' -f $_.DeviceName, $(if ($_.Primary) { 'primary' } else { 'secondary' }), $_.Bounds.X, $_.Bounds.Y, $_.Bounds.Width, $_.Bounds.Height, [TmwSmoke]::ScaleOf($_.DeviceName) }
    }
    'scale' { [TmwSmoke]::ScaleOf($Rest[0]) }
    'set-scale' { [TmwSmoke]::SetScale($Rest[0], [int]$Rest[1]); Start-Sleep -Milliseconds 500; [TmwSmoke]::ScaleOf($Rest[0]) }
    'cursor' { [TmwSmoke]::PhysicalPixels(); [TmwSmoke]::Cursor() }
    'move-cursor' { [TmwSmoke]::PhysicalPixels(); [TmwSmoke]::MoveCursor([int]$Rest[0], [int]$Rest[1]); Start-Sleep -Milliseconds 100; [TmwSmoke]::Cursor() }
    'stop-tree' {
        $root = [int]$Rest[0]
        $all = Get-CimInstance Win32_Process
        $ids = @($root)
        do {
            $added = @($all | Where-Object { $ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId } | ForEach-Object { [int]$_.ProcessId })
            $ids += $added
        } while ($added.Count -gt 0)
        Stop-Process -Id $root -ErrorAction SilentlyContinue
        for ($i = 0; $i -lt 100 -and (Get-Process -Id $ids -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
        $left = @(Get-Process -Id $ids -ErrorAction SilentlyContinue)
        $left | Stop-Process -Force -ErrorAction SilentlyContinue
        'stopped {0} processes, {1} forced' -f $ids.Count, $left.Count
    }
    'overlay-take' {
        [TmwSmoke]::PhysicalPixels()
        $appPid = [int]$Rest[0]; $mode = $Rest[1]; $target = [long]$Rest[3]; $dir = $Rest[4]
        $size = $Rest[5].Split('x') | ForEach-Object { [double]$_ }; $margin = [double]$Rest[6]; $share = [double]$Rest[7]
        $chord = [uint16[]]($Rest[2].Split(',') | ForEach-Object { $keys[$_] })
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        if (-not [TmwSmoke]::Focus($target)) { 'not focused'; exit 4 }
        $shots = [ordered]@{}
        $script:held = $false
        $script:focusKept = $true
        function Down { $script:held = $true; foreach ($k in $chord) { [TmwSmoke]::Send($k, $false); Start-Sleep -Milliseconds 10 } }
        function Up { for ($i = $chord.Count - 1; $i -ge 0; $i--) { [TmwSmoke]::Send($chord[$i], $true); Start-Sleep -Milliseconds 10 }; $script:held = $false }
        function Tap { Down; Start-Sleep -Milliseconds 60; Up }
        function Peak($name, $milliseconds) {
            $deadline = (Get-Date).AddMilliseconds($milliseconds)
            $best = $null
            do {
                $overlay = [TmwSmoke]::OverlayOf($appPid)
                $frame = [TmwSmoke]::Frame($overlay)
                if ($frame -match 'visible=True') {
                    $rect = [TmwSmoke]::RectOf($overlay)
                    $shot = [TmwSmoke]::Grab($rect)
                    $accent = [TmwSmoke]::Accent($shot)
                    if ($null -eq $best -or $accent -gt $best.Accent) { $best = @{ Rect = $rect; Shot = $shot; Frame = $frame; Accent = $accent; Place = [TmwSmoke]::Centred($overlay, $size[0], $size[1], $margin) } }
                }
                if (-not [TmwSmoke]::IsForeground($target)) { $script:focusKept = $false }
            } while ((Get-Date) -lt $deadline)
            if ($null -eq $best) { $shots[$name] = $null; return }
            $best.Shot.Save((Join-Path $dir "$name.png"))
            $shots[$name] = $best
        }
        try {
            switch ($mode) {
                'hold' { Down; Start-Sleep -Milliseconds 300; Peak 'listening' 400; Up; Peak 'processing' 600 }
                'hands-free' { Tap; Start-Sleep -Milliseconds 80; Tap; Start-Sleep -Milliseconds 500; Peak 'listening' 400; Tap; Peak 'processing' 600 }
                'no-frames' { Down; Start-Sleep -Milliseconds 200; Peak 'unpainted' 300; Start-Sleep -Milliseconds 2000; Peak 'listening' 400; Up; Peak 'processing' 600 }
                default { throw "unknown take mode $mode" }
            }
        }
        finally { if ($script:held) { Up } }
        for ($i = 0; $i -lt 100 -and [TmwSmoke]::Frame([TmwSmoke]::OverlayOf($appPid)) -match 'visible=True'; $i++) { Start-Sleep -Milliseconds 100 }
        Start-Sleep -Milliseconds 300
        $parts = foreach ($name in $shots.Keys) {
            if ($null -eq $shots[$name]) { '{0}=hidden' -f $name; continue }
            $baseline = [TmwSmoke]::Grab($shots[$name].Rect)
            $baseline.Save((Join-Path $dir "$name-baseline.png"))
            $accent = [TmwSmoke]::NewAccent($shots[$name].Shot, $baseline)
            $behind = [TmwSmoke]::Accent($baseline)
            $band = [TmwSmoke]::TopBandChanges($shots[$name].Shot, $baseline)
            $painted = if ($accent -gt 0) { 'painted' } else { 'unpainted' }
            $scale = ''
            if ($name -eq 'listening' -and $mode -ne 'hands-free' -and $accent -gt 0) {
                $ratio = [TmwSmoke]::NewAccentWidth($shots[$name].Shot, $baseline) / [double]$shots[$name].Shot.Width
                $fits = [math]::Abs($ratio - $share) -le $share * 0.05
                $scale = ' scale={0}({1:F3} of the window, expected {2:F3})' -f $(if ($fits) { 'ok' } else { 'off' }), $ratio, $share
            }
            '{0}={1} accent={2} baseline={3} band={4} {5} {6}{7}' -f $name, $painted, $accent, $behind, $band, ($shots[$name].Frame -split ' ')[0], $shots[$name].Place, $scale
        }
        $focus = if ($script:focusKept) { 'kept' } else { 'taken' }
        'take mode={0} focus={1} {2}' -f $mode, $focus, ($parts -join ' ')
    }
    'edit-text' { $text = [TmwSmoke]::EditText([long]$Rest[0]); if ($null -eq $text) { '<none>' } else { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text)) } }
    'scratch' {
        Add-Type -AssemblyName System.Windows.Forms
        $dir = $Rest[0]
        $form = New-Object Windows.Forms.Form -Property @{ Text = $Rest[1]; Width = 900; Height = 500; KeyPreview = $true }
        $box = New-Object Windows.Forms.TextBox -Property @{ Multiline = $true; Dock = 'Fill' }
        $form.Controls.Add($box)
        $form.Add_KeyDown({
            param($sender, $e)
            if ($e.Control -and $e.KeyCode -eq 'F12') { [IO.File]::WriteAllText((Join-Path $dir 'buffer'), $box.Text); $box.Clear(); $e.Handled = $true }
            if ($e.Control -and $e.KeyCode -eq 'F11') { $form.Close() }
        })
        $form.Add_Shown({ $box.Focus(); Set-Content -Path (Join-Path $dir 'prompts') -Value 1 })
        Set-Content -Path (Join-Path $dir 'pid') -Value $PID
        [Windows.Forms.Application]::Run($form)
    }
    'webview' {
        Add-Type -AssemblyName System.Windows.Forms
        $dir = $Rest[0]
        $sdk = Join-Path $PSScriptRoot 'webview2'
        if (-not (Test-Path (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.WinForms.dll'))) {
            $package = Join-Path $PSScriptRoot 'webview2.zip'
            Invoke-WebRequest -UseBasicParsing -Uri 'https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/1.0.4191.47' -OutFile $package
            Expand-Archive -Path $package -DestinationPath $sdk -Force
        }
        Copy-Item (Join-Path $sdk 'runtimes\win-x64\native\WebView2Loader.dll') (Join-Path $sdk 'lib\net462') -Force
        Add-Type -Path (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Core.dll')
        Add-Type -Path (Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.WinForms.dll')
        $form = New-Object Windows.Forms.Form -Property @{ Text = $Rest[1]; Width = 900; Height = 500 }
        $view = New-Object Microsoft.Web.WebView2.WinForms.WebView2 -Property @{ Dock = 'Fill' }
        $view.CreationProperties = New-Object Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties -Property @{ UserDataFolder = (Join-Path $dir 'profile') }
        $form.Controls.Add($view)
        $page = "<textarea id=t style='width:95vw;height:85vh'></textarea><script>const t=document.getElementById('t');t.focus();" +
            "addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='F12'){chrome.webview.postMessage(t.value);t.value='';e.preventDefault()}" +
            "if(e.ctrlKey&&e.key==='F11'){chrome.webview.postMessage('<close>')}});</script>"
        $view.Add_CoreWebView2InitializationCompleted({
            param($sender, $e)
            if ($e.IsSuccess) { $view.CoreWebView2.NavigateToString($page) }
            else { Set-Content -Path (Join-Path $dir 'error') -Value $e.InitializationException.ToString() }
        })
        $view.Add_NavigationCompleted({ $view.Focus(); $view.ExecuteScriptAsync('t.focus()') | Out-Null; Set-Content -Path (Join-Path $dir 'prompts') -Value 1 })
        $view.Add_WebMessageReceived({
            param($sender, $e)
            $message = $e.TryGetWebMessageAsString()
            if ($message -eq '<close>') { $form.Close() } else { [IO.File]::WriteAllText((Join-Path $dir 'buffer'), $message) }
        })
        $form.Add_Shown({ $view.EnsureCoreWebView2Async() | Out-Null })
        Set-Content -Path (Join-Path $dir 'pid') -Value $PID
        [Windows.Forms.Application]::Run($form)
    }
    'target' {
        $global:TmwDir = $Rest[0]
        $Host.UI.RawUI.WindowTitle = $Rest[1]
        Set-Content -Path (Join-Path $TmwDir 'prompts') -Value 0
        function global:prompt {
            $file = Join-Path $global:TmwDir 'prompts'
            Set-Content -Path $file -Value ([int](Get-Content $file) + 1)
            'tmw> '
        }
        Set-PSReadLineKeyHandler -Chord Ctrl+F12 -ScriptBlock {
            $line = $null
            $cursor = $null
            [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
            [IO.File]::WriteAllText((Join-Path $global:TmwDir 'buffer'), $line)
            [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
        }
        Set-PSReadLineKeyHandler -Chord Ctrl+F11 -ScriptBlock { [Environment]::Exit(0) }
        Set-Content -Path (Join-Path $TmwDir 'pid') -Value $PID
        $ErrorActionPreference = 'Continue'
    }
    default { throw "unknown command $Command" }
}
