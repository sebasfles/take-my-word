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

    public static string ClipboardFormats()
    {
        if (!Open()) throw new Exception("the clipboard stayed busy");
        try
        {
            var formats = new List<string>();
            uint format = 0;
            while ((format = EnumClipboardFormats(format)) != 0) formats.Add(format.ToString());
            return string.Join(",", formats);
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

    static string guardFile;
    static HookProc keyboard;
    static HookProc mouse;

    public static void Guard(string file)
    {
        guardFile = file;
        keyboard = (code, wparam, lparam) =>
        {
            if (code >= 0)
            {
                var data = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lparam, typeof(KBDLLHOOKSTRUCT));
                if ((data.flags & 0x10) == 0) File.AppendAllText(guardFile, DateTime.UtcNow.ToString("o") + " key " + data.vkCode + "\n");
            }
            return CallNextHookEx(IntPtr.Zero, code, wparam, lparam);
        };
        mouse = (code, wparam, lparam) =>
        {
            if (code >= 0)
            {
                var data = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lparam, typeof(MSLLHOOKSTRUCT));
                if ((data.flags & 0x1) == 0) File.AppendAllText(guardFile, DateTime.UtcNow.ToString("o") + " mouse " + wparam.ToInt64() + "\n");
            }
            return CallNextHookEx(IntPtr.Zero, code, wparam, lparam);
        };
        var module = GetModuleHandle(null);
        SetWindowsHookEx(13, keyboard, module, 0);
        SetWindowsHookEx(14, mouse, module, 0);
        File.WriteAllText(guardFile + ".ready", "ready");
        MSG message;
        while (GetMessage(out message, IntPtr.Zero, 0, 0)) { TranslateMessage(ref message); DispatchMessage(ref message); }
    }
}
'@

$cache = $PSScriptRoot
$hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($source))).Replace('-', '').Substring(0, 16)
$assembly = Join-Path $cache "TmwSmoke-$hash.dll"
if (-not (Test-Path $assembly)) {
    Add-Type -TypeDefinition $source -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, WindowsBase, System.Windows.Forms -OutputAssembly $assembly -OutputType Library
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
    'clipboard-formats' { [TmwSmoke]::ClipboardFormats() }
    'set-clipboard' { if ($Rest[0] -eq '<none>') { [TmwSmoke]::SetClipboardText($null) } else { [TmwSmoke]::SetClipboardText([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Rest[0]))) } }
    'dialog' { $found = [TmwSmoke]::Dialog([long]$Rest[0], $Rest[1]); if ($found) { $found } else { '<none>' } }
    'start' { [TmwSmoke]::Start($Rest[0], [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Rest[1])), $false) }
    'start-console' { [TmwSmoke]::Start($Rest[0], [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Rest[1])), $true) }
    'guard' { [TmwSmoke]::Guard($Rest[0]) }
    'tree' { [TmwSmoke]::Tree([long]$Rest[0]) }
    'fill-env' { if ([TmwSmoke]::Fill([long]$Rest[0], [int]$Rest[1], [Environment]::GetEnvironmentVariable($Rest[2]))) { 'filled' } else { 'no field'; exit 4 } }
    'invoke' { $found = [TmwSmoke]::Invoke([long]$Rest[0], $Rest[1]); if ($found) { $found } else { '<none>'; exit 4 } }
    'race' { [TmwSmoke]::Race($Rest[0], $Rest[1]) }
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
