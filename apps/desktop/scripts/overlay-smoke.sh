#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: scripts/overlay-smoke.sh --app 'C:\path\take-my-word.exe' --sign-in .env [--takes 5]
                                [--starts hand,autostart] [--no-frames] [--displays] [--keys alt,ctrl,win] [--out dir]

Starts the dev app each way it starts and checks the overlay's pixels on every take, from WSL on the Windows host:
  hand       a start by hand, which opens the main window; the run closes it
  autostart  --autostart by hand, which stays in the tray
After each start the overlay must be frameless; then near-silent takes into a scratch window, alternating hold and
hands-free, must each paint listening and processing (accent pixels the hidden baseline lacks), draw no title bar,
sit centred above the taskbar of the monitor it shows on and leave the focus on the scratch window.
--no-frames (debug builds only) makes the overlay paint nothing before one extra hold, which must paint again within
that hold once the overlay is recreated.
--displays adds, after the last start's takes, a hold on the secondary display (the cursor moved there), one after
raising that display's scale a step, and one back on the primary display; the scale and cursor are always restored.
Exits nonzero when any check fails.
--sign-in names a file with CREW_E2E_B_USERNAME and CREW_E2E_B_PASSWORD; the run signs in through the main window
and signs out at the end. Needs nobody at the keyboard and no other dev instance running.
EOF
  exit 2
}

here="$(cd "$(dirname "$0")" && pwd)"
app=""
takes=5
starts="hand,autostart"
no_frames=0
displays=0
keys="alt,ctrl,win"
run_id="tmw-overlay-$(date +%H%M%S)"
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --app) app="$2"; shift 2 ;;
    --sign-in) sign_in_env="$2"; shift 2 ;;
    --takes) takes="$2"; shift 2 ;;
    --starts) starts="$2"; shift 2 ;;
    --no-frames) no_frames=1; shift ;;
    --displays) displays=1; shift ;;
    --keys) keys="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[[ -n "$app" && -n "${sign_in_env:-}" ]] || usage

local_app_data="$(wslpath "$(cmd.exe /d /c 'echo %LOCALAPPDATA%' 2>/dev/null | tr -d '\r')")"
windows_temp="$(wslpath "$(cmd.exe /d /c 'echo %TEMP%' 2>/dev/null | tr -d '\r')")"
scratch="$windows_temp/$run_id"
out="${out:-$scratch/out}"
mkdir -p "$scratch" "$out"
cp "$here/terminal-smoke.ps1" "$scratch/terminal-smoke.ps1"
ps1="$(wslpath -w "$scratch/terminal-smoke.ps1")"
app_log="$local_app_data/dev.fless.takemyword.dev/logs/Take My Word Dev.log"
overlay_size="$(node -p "const o = require('$here/../src/windows.json').overlay; o.width + 'x' + o.height")"
overlay_margin="$(grep -oP 'const BOTTOM_MARGIN: f64 = \K[0-9.]+' "$here/../src-tauri/src/overlay.rs")"

log() {
  printf '%s %s\n' "$(date -u +%H:%M:%S.%3N)" "$*" | tee -a "$out/run.log" >&2
}

fail() {
  log "ABORT: $*"
  exit 1
}

psw() {
  powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$ps1" "$@" 2>/dev/null | tr -d '\r'
}

guard_ok() {
  [[ ! -s "$scratch/guard" ]] || fail "real input during the run: $(head -1 "$scratch/guard")"
}

act() {
  [[ -n "${in_cleanup:-}" ]] || guard_ok
  psw "$@"
}

app_log_size() {
  if [[ -f "$app_log" ]]; then stat -c %s "$app_log"; else echo 0; fi
}

app_log_since() {
  local from="$1"
  (( $(app_log_size) < from )) && from=0
  tail -c +"$(( from + 1 ))" "$app_log" 2>/dev/null || true
}

dev_instances() {
  powershell.exe -NoProfile -NonInteractive -Command \
    "Get-Process take-my-word -ErrorAction SilentlyContinue | Where-Object { \$_.Path -notlike '*\\Take My Word\\take-my-word.exe' } | ForEach-Object { \$_.Id }" | tr -d '\r'
}

start_app() {
  act start "$app" "$(printf '%s' "$*" | base64 -w0)" | tail -1
}

stop_app() {
  [[ -n "${app_pid:-}" ]] || return 0
  log "stopped the app ($app_pid) and its WebView2: $(psw stop-tree "$app_pid")"
  app_pid=""
}

main_window() {
  local deadline=$((SECONDS + 20)) window=0
  while (( SECONDS < deadline )); do
    window="$(psw find-process "$app_pid")"
    [[ "$window" != 0 ]] && break
    sleep 0.5
  done
  echo "$window"
}

sign_in() {
  local window="$1" offset step
  offset="$(app_log_size)"
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^CREW_E2E_B_(USERNAME|PASSWORD)=' "$sign_in_env")
  set +a
  export TMW_SMOKE_USERNAME="$CREW_E2E_B_USERNAME" TMW_SMOKE_PASSWORD="$CREW_E2E_B_PASSWORD"
  export WSLENV="${WSLENV:+$WSLENV:}TMW_SMOKE_USERNAME:TMW_SMOKE_PASSWORD"
  act invoke "$window" 'Empezar|Get started' >/dev/null || true
  sleep 1
  act fill-env "$window" 0 TMW_SMOKE_USERNAME >/dev/null || fail "the main window has no username field"
  act fill-env "$window" 1 TMW_SMOKE_PASSWORD >/dev/null || fail "the main window has no password field"
  act invoke "$window" 'Entrar|Sign in' >/dev/null
  unset TMW_SMOKE_PASSWORD CREW_E2E_B_PASSWORD
  local deadline=$((SECONDS + 30))
  until app_log_since "$offset" | grep -q 'signed in'; do
    (( SECONDS < deadline )) || fail "signing in did not finish"
    sleep 0.5
  done
  signed_in=1
  log "signed in as crew-e2e-b"
  for step in $(seq 8); do
    sleep 1.5
    act invoke "$window" 'Continuar|Continue|Empezar a dictar|Start dictating' >/dev/null || break
  done
}

sign_out() {
  local window offset
  offset="$(app_log_size)"
  [[ -n "${app_pid:-}" ]] || app_pid="$(start_app)"
  start_app >/dev/null
  window="$(main_window)"
  [[ "$window" != 0 ]] || { log "WARNING: the main window never opened, sign out by hand"; return; }
  sleep 2
  act invoke "$window" 'Cuenta|Account' >/dev/null || true
  sleep 1
  act invoke "$window" 'Cerrar sesión|Sign out' >/dev/null || true
  local deadline=$((SECONDS + 20))
  until app_log_since "$offset" | grep -q 'signed out'; do
    (( SECONDS < deadline )) || { log "WARNING: signing out did not finish, sign out by hand"; return; }
    sleep 0.5
  done
  signed_in=""
  log "signed out"
}

cleanup() {
  set +e
  in_cleanup=1
  if [[ -n "${scaled_display:-}" ]]; then
    log "scale of $scaled_display restored to $(psw set-scale "$scaled_display" "$scaled_from")%"
  fi
  [[ -n "${cursor_home:-}" ]] && psw move-cursor "${cursor_home%,*}" "${cursor_home#*,}" >/dev/null
  [[ -n "${target_pid:-}" ]] && powershell.exe -NoProfile -Command "Stop-Process -Id $target_pid" >/dev/null 2>&1
  [[ -n "${signed_in:-}" ]] && sign_out
  stop_app
  if [[ -n "${guard_pid:-}" ]]; then
    kill "$guard_pid" 2>/dev/null
    [[ -s "$scratch/guard" ]] && log "the guard saw $(cut -d' ' -f2- "$scratch/guard")"
  fi
  if [[ -n "${sealed:-}" && -e "$sealed" ]]; then
    local restored
    restored="$(psw restore-sealed "$(wslpath -w "$sealed")")"
    if [[ "$restored" == "restored and verified"* ]]; then
      log "clipboard $restored"
    else
      log "WARNING: the clipboard was not restored ($restored); the sealed copy stays at $(wslpath -w "$sealed")"
    fi
  fi
}
trap cleanup EXIT

open_target() {
  local title="tmw-overlay-$run_id"
  mkdir -p "$scratch/target"
  act start powershell.exe "$(printf '%s' "-NoProfile -STA -ExecutionPolicy Bypass -File \"$ps1\" scratch \"$(wslpath -w "$scratch/target")\" $title" | base64 -w0)" >/dev/null
  local deadline=$((SECONDS + 20))
  target=0
  while (( SECONDS < deadline )); do
    target="$(psw find '*' "$title")"
    [[ "$target" != 0 ]] && break
    sleep 0.5
  done
  [[ "$target" != 0 ]] || fail "the scratch window did not open"
  target_pid="$(tr -d '\r' < "$scratch/target/pid")"
}

judge() {
  local line="$1" mode="$2"
  [[ "$line" == *"focus=kept"* ]] || return 1
  [[ "$line" == *"listening=painted"* && "$line" == *"processing=painted"* ]] || return 1
  [[ "$line" != *"framed"* && "$line" != *"off-centre"* ]] || return 1
  local band
  for band in $(grep -o 'band=[0-9]*' <<<"$line" | cut -d= -f2); do
    (( band <= 200 )) || return 1
  done
  [[ "$mode" != no-frames ]] || [[ "$line" == *"unpainted=unpainted"* ]]
}

take() {
  local start="$1" n="$2" mode="$3" offset line verdict
  guard_ok
  offset="$(app_log_size)"
  line="$(act overlay-take "$app_pid" "$mode" "$keys" "$target" "$(wslpath -w "$out/$start-$n-$mode")" "$overlay_size" "$overlay_margin")"
  sleep 2
  if judge "$line" "$mode"; then verdict=PASS; else verdict=FAIL; fi
  if [[ "$mode" == no-frames ]] && ! app_log_since "$offset" | grep -q 'recreating the overlay'; then verdict=FAIL; fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$start" "$n" "$mode" "$verdict" "$line" >> "$out/results.tsv"
  app_log_since "$offset" | grep -i 'overlay' | sed "s/^/  $start $n: /" >> "$out/overlay.log" || true
  log "$start take $n ($mode): $verdict $line"
}

[[ -z "$(dev_instances)" ]] || fail "a dev instance of the app is already running; close it first"
(( $(psw idle) >= 300 )) || fail "someone used the machine in the last 5 minutes"
sealed="$scratch/clipboard.sealed"
sealing="$(psw seal-clipboard "$(wslpath -w "$sealed")")"
[[ "$sealing" == sealed* ]] || fail "could not seal the clipboard before the run: $sealing"
log "run $run_id, app $app, out $out, clipboard $sealing"
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$ps1" guard "$(wslpath -w "$scratch/guard")" >/dev/null 2>&1 &
guard_pid=$!
for _ in $(seq 50); do [[ -e "$scratch/guard.ready" ]] && break; sleep 0.2; done
[[ -e "$scratch/guard.ready" ]] || fail "the input guard did not start"
open_target

IFS=, read -r -a paths <<<"$starts"
for start in "${paths[@]}"; do
  offset="$(app_log_size)"
  case "$start" in
    hand) app_pid="$(start_app)" ;;
    autostart) app_pid="$(start_app --autostart)" ;;
    *) fail "unknown start $start" ;;
  esac
  [[ "$app_pid" =~ ^[0-9]+$ ]] || fail "the app did not start"
  sleep 8
  if [[ "$start" == hand ]]; then
    window="$(main_window)"
    [[ "$window" != 0 ]] || fail "a start by hand opened no main window"
    if [[ -z "${signed_in:-}" ]] && psw tree "$window" | grep -qE "Edit '(Usuario|Username)'|Button '(Empezar|Get started)'"; then
      sign_in "$window"
    fi
    signed_in=1
    act close-window "$window" >/dev/null
    sleep 2
  fi
  frame="$(psw overlay-frame "$app_pid")"
  log "$start: overlay after start $frame"
  printf '%s\t%s\t%s\t%s\t%s\n' "$start" start frame "$([[ "$frame" == frameless* && "$frame" == *noactivate=True* ]] && echo PASS || echo FAIL)" "$frame" >> "$out/results.tsv"
  app_log_since "$offset" | grep -i 'overlay' | sed "s/^/  $start start: /" >> "$out/overlay.log" || true
  for n in $(seq "$takes"); do
    if (( n % 2 )); then take "$start" "$n" hold; else take "$start" "$n" hands-free; fi
  done
  if (( no_frames )); then
    start_app --overlay-no-frames >/dev/null
    sleep 1
    take "$start" "$((takes + 1))" no-frames
  fi
  if (( displays )) && [[ "$start" == "${paths[-1]}" ]]; then
    secondary="$(psw displays | grep ' secondary ' | head -1)"
    [[ -n "$secondary" ]] || fail "--displays needs a secondary display"
    read -r display _ bounds scale <<<"$secondary"
    IFS=, read -r bx by bw bh <<<"$bounds"
    cursor_home="$(psw cursor)"
    log "displays: secondary $display at $scale%, cursor from $cursor_home"
    act move-cursor "$((bx + bw / 2))" "$((by + bh / 2))" >/dev/null
    take "$start" secondary hold
    case "$scale" in 100) raised=125 ;; 125) raised=150 ;; *) raised=100 ;; esac
    scaled_display="$display"
    scaled_from="$scale"
    guard_ok
    log "displays: $display scale now $(act set-scale "$display" "$raised")%"
    sleep 3
    act move-cursor "$((bx + bw / 2))" "$((by + bh / 2))" >/dev/null
    take "$start" "secondary-$raised" hold
    log "displays: $display scale restored to $(act set-scale "$display" "$scale")%"
    scaled_display=""
    sleep 3
    act move-cursor "${cursor_home%,*}" "${cursor_home#*,}" >/dev/null
    cursor_home=""
    take "$start" primary hold
  fi
  stop_app
done

failed="$(grep -c $'\tFAIL\t' "$out/results.tsv" || true)"
log "done: $(grep -c $'\tPASS\t' "$out/results.tsv") passed, $failed failed, results in $out"
(( failed == 0 )) || exit 1
