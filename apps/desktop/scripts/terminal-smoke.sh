#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: scripts/terminal-smoke.sh --app 'C:\path\take-my-word.exe' [--tries 5] [--targets 1,2,3,4,5]
                                 [--multiline app|direct|none] [--hold] [--race update|paste] [--sign-in .env]
                                 [--scratch /mnt/c/dir] [--out dir] [--run-id id]

Dictates into terminal targets the run opens itself, from WSL on the Windows host:
  1 Windows Terminal, WSL, tmux, Claude Code    2 Windows Terminal, WSL, tmux
  3 Windows Terminal, WSL bash                  4 Windows Terminal, Windows PowerShell
  5 conhost, Windows PowerShell                 6 WinForms text box (scratch)
  7 WebView2 text area                          8 Chrome text area (own profile)
--race update|paste adds, from target 6 on, a reader that opens the clipboard without a window on every
clipboard update (as 0012's run did) or on every Ctrl+V (it then wins every race, and the paste is left).
Needs a debug build (the API stub), nobody at the keyboard, and no other dev instance running.
--hold needs --sign-in with a file holding CREW_E2E_B_USERNAME and CREW_E2E_B_PASSWORD; the run signs in
through the sign-in window and signs out from Settings at the end.
EOF
  exit 2
}

here="$(cd "$(dirname "$0")" && pwd)"
app=""
tries=5
targets="1,2,3,4,5"
multiline="app"
hold=0
race=""
run_id="tmw-smoke-$(date +%H%M%S)"
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --app) app="$2"; shift 2 ;;
    --tries) tries="$2"; shift 2 ;;
    --targets) targets="$2"; shift 2 ;;
    --multiline) multiline="$2"; shift 2 ;;
    --hold) hold=1; shift ;;
    --race) race="$2"; shift 2 ;;
    --sign-in) sign_in_env="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --scratch) scratch="$2"; shift 2 ;;
    --run-id) run_id="$2"; shift 2 ;;
    target) shift; mode="target"; break ;;
    *) usage ;;
  esac
done

target_shell() {
  local kind="$1" dir="$2"
  export PATH="$HOME/.local/bin:$PATH"
  cat > "$dir/rc" <<EOF
PS1='tmw\$ '
HISTFILE=/dev/null
echo 0 > '$dir/prompts'
PROMPT_COMMAND='echo \$(( \$(cat "$dir/prompts") + 1 )) > "$dir/prompts"'
tmw_dump() { printf '%s' "\$READLINE_LINE" > '$dir/buffer'; READLINE_LINE=''; READLINE_POINT=0; }
bind -x '"\e[24;5~": tmw_dump'
echo \$\$ > '$dir/pid'
EOF
  case "$kind" in
    bash) bash --noprofile --rcfile "$dir/rc" -i || true ;;
    tmux-bash)
      tmux -L "$(cat "$dir/socket")" -f /dev/null new-session -s main -x 160 -y 40 \
        "bash --noprofile --rcfile '$dir/rc' -i" || true ;;
    tmux-claude)
      mkdir -p "$dir/project" "$dir/config"
      printf '{"hasCompletedOnboarding":true,"projects":{"%s":{"hasTrustDialogAccepted":true}}}' \
        "$dir/project" > "$dir/config/.claude.json"
      tmux -L "$(cat "$dir/socket")" -f /dev/null new-session -s main -x 160 -y 40 -c "$dir/project" \
        "env -u CLAUDE_CODE_CHILD_SESSION CLAUDE_CONFIG_DIR='$dir/config' claude --bare --strict-mcp-config; echo \$? > '$dir/claude-exit'" || true ;;
  esac
  exit 0
}

if [[ "${mode:-}" == target ]]; then
  target_shell "$1" "$2"
fi

[[ -n "$app" ]] || usage

psw() {
  local output attempt
  local status
  for attempt in 1 2 3 4 5; do
    status=0
    output="$(powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$ps1" "$@" 2>/dev/null)" || status=$?
    if [[ "$status" == 0 || -n "$output" ]]; then
      printf '%s\n' "${output//$'\r'/}"
      return "$status"
    fi
    sleep "$attempt"
  done
  powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$ps1" "$@" | tr -d '\r'
}

act() {
  [[ -n "${in_cleanup:-}" ]] || guard_ok
  local output
  if ! output="$(powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$ps1" "$@" 2>/dev/null)"; then
    log "WARNING: the host did not answer '$1' (WSL interop); it may or may not have run"
  fi
  printf '%s\n' "${output//$'\r'/}"
}

log() {
  printf '%s %s\n' "$(date -u +%H:%M:%S.%3N)" "$*" | tee -a "$out/run.log" >&2
}

fail() {
  log "ABORT: $*"
  exit 1
}

local_app_data="$(wslpath "$(cmd.exe /d /c 'echo %LOCALAPPDATA%' 2>/dev/null | tr -d '\r')")"
windows_temp="$(wslpath "$(cmd.exe /d /c 'echo %TEMP%' 2>/dev/null | tr -d '\r')")"
scratch="${scratch:-$windows_temp}/$run_id"
out="${out:-$scratch/out}"
mkdir -p "$scratch" "$out"
ps1="$(wslpath -w "$scratch/terminal-smoke.ps1")"
cp "$here/terminal-smoke.ps1" "$scratch/terminal-smoke.ps1"
cp "$here/../src-tauri/src/audio/fixtures/speech.wav" "$scratch/speech.wav"
wav="$(wslpath -w "$scratch/speech.wav")"
app_log="$local_app_data/dev.fless.takemyword.dev/logs/Take My Word Dev.log"
wt="$(wslpath -w "$local_app_data/Microsoft/WindowsApps/wt.exe")"
chrome='C:\Program Files\Google\Chrome\Application\chrome.exe'

linux_scratch="/tmp/$run_id"
mkdir -p "$linux_scratch"

opened_targets=()
cleanup() {
  set +e
  in_cleanup=1
  for target in "${opened_targets[@]:-}"; do
    [[ -n "$target" ]] && close_target "$target"
  done
  if [[ -n "${signed_in:-}" ]]; then
    sign_out
  fi
  if [[ -n "${app_pid:-}" ]] && app_alive; then
    powershell.exe -NoProfile -Command "Stop-Process -Id $app_pid" >/dev/null 2>&1 && log "stopped the app the run started ($app_pid)"
  fi
  if [[ -n "${race_pid:-}" ]]; then
    kill "$race_pid" 2>/dev/null
    log "race reader: $(grep -c ' read a dictation$' "$scratch/race" 2>/dev/null || true) reads got a dictation, $(grep -c ' read other text$' "$scratch/race" 2>/dev/null || true) got other text, $(grep -c ' empty$' "$scratch/race" 2>/dev/null || true) empty, $(grep -c ' busy$' "$scratch/race" 2>/dev/null || true) busy"
  fi
  if [[ -n "${guard_pid:-}" ]]; then
    kill "$guard_pid" 2>/dev/null
    [[ -s "$scratch/guard" ]] && log "the guard saw $(cut -d' ' -f2- "$scratch/guard")"
    rm -f "$scratch/guard" "$scratch/guard.ready"
  fi
  if [[ -n "${sealed:-}" && -e "$sealed" ]]; then
    local restored
    restored="$(psw restore-sealed "$(wslpath -w "$sealed")")"
    if [[ "$restored" == "restored and verified"* ]]; then
      log "clipboard $restored, sealed file deleted"
    else
      log "WARNING: the clipboard was not restored ($restored); the sealed copy stays at $(wslpath -w "$sealed")"
    fi
  fi
}
trap cleanup EXIT
set -E
trap 'log "failed at line $LINENO: $BASH_COMMAND"' ERR

guard_clear() {
  [[ ! -s "$scratch/guard" ]]
}

guard_ok() {
  guard_clear || fail "real input during the run: $(head -1 "$scratch/guard")"
}

app_alive() {
  local path
  path="$(powershell.exe -NoProfile -NonInteractive -Command "Get-Process -Id $app_pid -ErrorAction SilentlyContinue | ForEach-Object Path" | tr -d '\r')"
  [[ -n "$path" && "${path,,}" == "${app,,}" ]]
}

dev_instances() {
  powershell.exe -NoProfile -NonInteractive -Command \
    "Get-Process take-my-word -ErrorAction SilentlyContinue | Where-Object { \$_.Path -notlike '*\\Take My Word\\take-my-word.exe' } | ForEach-Object { \$_.Id }" | tr -d '\r'
}

app_log_size() {
  if [[ -f "$app_log" ]]; then stat -c %s "$app_log"; else echo 0; fi
}

app_log_since() {
  local from="$1"
  (( $(app_log_size) < from )) && from=0
  tail -c +"$(( from + 1 ))" "$app_log" 2>/dev/null || true
}

start() {
  local path="$1"
  shift
  act start "$path" "$(printf '%s' "$*" | base64 -w0)"
}

start_console() {
  local path="$1"
  shift
  act start-console "$path" "$(printf '%s' "$*" | base64 -w0)"
}

send_to_app() {
  start "$app" "$@" >/dev/null
}

wait_for_outcome() {
  local offset="$1" deadline=$((SECONDS + 20))
  while (( SECONDS < deadline )); do
    if app_log_since "$offset" | grep -q -E 'pasted a dictation|left a dictation|returned no text|PasteFailed|failed'; then
      sleep 0.3
      return 0
    fi
    sleep 0.2
  done
  return 1
}

dir_of() { echo "$scratch/t$1"; }
linux_dir_of() { echo "$linux_scratch/t$1"; }

title_of() { echo "$run_id-t$1"; }

open_target() {
  local n="$1" title dir
  title="$(title_of "$n")"
  case "$n" in
    1|2|3)
      dir="$(linux_dir_of "$n")"
      rm -rf "$dir"; mkdir -p "$dir"
      echo "$run_id-t$n" > "$dir/socket"
      local kind=(x tmux-claude tmux-bash bash)
      start "$wt" -w "$title" new-tab --title "$title" --suppressApplicationTitle \
        wsl.exe --distribution "$WSL_DISTRO_NAME" --exec bash "$here/terminal-smoke.sh" target "${kind[$n]}" "$dir" >/dev/null ;;
    4)
      dir="$(dir_of "$n")"; rm -rf "$dir"; mkdir -p "$dir"
      start "$wt" -w "$title" new-tab --title "$title" --suppressApplicationTitle \
        powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File "$ps1" target "$(wslpath -w "$dir")" "$title" >/dev/null ;;
    5)
      dir="$(dir_of "$n")"; rm -rf "$dir"; mkdir -p "$dir"
      start_console conhost.exe powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File "$ps1" target "$(wslpath -w "$dir")" "$title" > "$dir/conhost-pid" ;;
    6|7)
      dir="$(dir_of "$n")"; rm -rf "$dir"; mkdir -p "$dir"
      local kind=(x x x x x x scratch webview)
      start powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "$ps1" "${kind[$n]}" "$(wslpath -w "$dir")" "$title" >/dev/null ;;
    8)
      dir="$(dir_of "$n")"; rm -rf "$dir"; mkdir -p "$dir"
      start "$chrome" "--user-data-dir=$(wslpath -w "$dir/profile")" --no-first-run --no-default-browser-check \
        "--app=data:text/html,<title>$title</title><textarea%20id=t%20autofocus%20style=width:95vw;height:85vh></textarea>" > "$dir/pid"
      echo 1 > "$dir/prompts" ;;
  esac
  opened_targets+=("$n")
  local class
  class="$(class_of "$n")"
  local deadline=$((SECONDS + 30)) window=0
  while (( SECONDS < deadline )); do
    window="$(psw find "$class" "$title")"
    [[ "$window" != 0 ]] && break
    sleep 0.5
  done
  [[ "$window" != 0 ]] || fail "target $n window never appeared"
  echo "$window" > "$(state_dir "$n")/window"
  wait_until_ready "$n"
  log "target $n open: $(psw describe "$window")"
}

class_of() {
  case "$1" in
    1|2|3|4) echo CASCADIA_HOSTING_WINDOW_CLASS ;;
    5) echo ConsoleWindowClass ;;
    *) echo '*' ;;
  esac
}

state_dir() {
  case "$1" in 1|2|3) linux_dir_of "$1" ;; *) dir_of "$1" ;; esac
}

wait_until_ready() {
  local n="$1" dir deadline=$((SECONDS + 60))
  dir="$(state_dir "$n")"
  while (( SECONDS < deadline )); do
    case "$n" in
      1) if tmux -L "$(cat "$dir/socket")" capture-pane -p -t main 2>/dev/null | grep -q '^❯'; then sleep 1; return 0; fi ;;
      *) if [[ -s "$dir/prompts" ]] && (( $(tr -d '\r' < "$dir/prompts") >= 1 )); then sleep 0.5; return 0; fi ;;
    esac
    sleep 0.5
  done
  fail "target $n never became ready"
}

window_of() { cat "$(state_dir "$1")/window"; }

focus_target() {
  local n="$1" window
  window="$(window_of "$n")"
  guard_ok
  psw focus "$window" >/dev/null || fail "could not focus target $n"
  [[ "$(psw is-foreground "$window")" == yes ]] || fail "the foreground is not target $n: $(psw foreground)"
}

prompts_of() {
  case "$1" in
    1) echo 0 ;;
    *) tr -d '\r' < "$(state_dir "$1")/prompts" ;;
  esac
}

read_target() {
  local n="$1" dir
  dir="$(state_dir "$n")"
  rm -f "$dir/buffer"
  case "$n" in
    1)
      tmux -L "$(cat "$dir/socket")" capture-pane -p -J -t main > "$dir/screen"
      awk '/^─+$/{rule++; next} rule==1' "$dir/screen" | sed -e 's/^❯ \{0,1\}//' -e 's/^  //' -e 's/[[:space:]]*$//' > "$dir/buffer"
      tmux -L "$(cat "$dir/socket")" send-keys -t main C-c
      sleep 3 ;;
    2)
      tmux -L "$(cat "$dir/socket")" capture-pane -p -J -t main > "$dir/screen"
      tmux -L "$(cat "$dir/socket")" send-keys -t main C-F12 ;;
    8)
      local text
      text="$(psw edit-text "$(window_of "$n")")"
      if [[ "$text" == '<none>' ]]; then : > "$dir/buffer"; else base64 -d <<<"$text" > "$dir/buffer"; fi
      focus_target "$n"
      act chord ctrl a >/dev/null
      act chord delete >/dev/null ;;
    *)
      focus_target "$n"
      act chord ctrl f12 >/dev/null ;;
  esac
  local deadline=$((SECONDS + 5))
  while [[ ! -e "$dir/buffer" ]] && (( SECONDS < deadline )); do sleep 0.2; done
  [[ -e "$dir/buffer" ]] || fail "target $n did not report its input line"
  cat "$dir/buffer"
}

close_target() {
  local n="$1" dir
  dir="$(state_dir "$n")"
  case "$n" in
    1)
      local socket; socket="$(cat "$dir/socket")"
      tmux -L "$socket" send-keys -t main C-c 2>/dev/null || true; sleep 0.4
      tmux -L "$socket" send-keys -t main C-c 2>/dev/null || true; sleep 2
      tmux -L "$socket" kill-server 2>/dev/null || true
      log "target 1 closed, Claude Code exit $(cat "$dir/claude-exit" 2>/dev/null || echo unknown)" ;;
    2) tmux -L "$(cat "$dir/socket")" kill-server 2>/dev/null || true; log "target 2 closed" ;;
    3) kill -HUP "$(cat "$dir/pid")" 2>/dev/null || true; log "target 3 closed" ;;
    8)
      psw close-window "$(window_of "$n")" >/dev/null || true
      for _ in $(seq 20); do
        [[ -z "$(powershell.exe -NoProfile -Command "Get-Process -Id $(tr -d '\r' < "$dir/pid") -ErrorAction SilentlyContinue | ForEach-Object Id" | tr -d '\r')" ]] && break
        sleep 0.5
      done
      rm -rf "$dir/profile" 2>/dev/null || true
      log "target 8 closed" ;;
    *)
      local window class
      window="$(window_of "$n")"
      class="$(class_of "$n")"
      if guard_clear && psw focus "$window" >/dev/null && [[ "$(psw is-foreground "$window")" == yes ]] && guard_clear; then
        act chord ctrl f11 >/dev/null
        sleep 1.5
      else
        log "target $n could not be focused to close: window $(psw find "$class" "$(title_of "$n")"), foreground $(psw foreground)"
      fi
      if [[ "$(psw find "$class" "$(title_of "$n")")" != 0 ]]; then
        psw close-window "$window" >/dev/null
        log "target $n closed through its window"
      else
        log "target $n closed"
      fi ;;
  esac
}

app_window() {
  local deadline=$((SECONDS + 20)) window=0
  while (( SECONDS < deadline )); do
    window="$(psw find-process "$app_pid")"
    [[ "$window" != 0 ]] && break
    sleep 0.5
  done
  echo "$window"
}

sign_in() {
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^CREW_E2E_B_(USERNAME|PASSWORD)=' "$sign_in_env")
  set +a
  export TMW_SMOKE_USERNAME="$CREW_E2E_B_USERNAME" TMW_SMOKE_PASSWORD="$CREW_E2E_B_PASSWORD"
  export WSLENV="${WSLENV:+$WSLENV:}TMW_SMOKE_USERNAME:TMW_SMOKE_PASSWORD"
  local window offset
  window="$(app_window)"
  [[ "$window" != 0 ]] || { log "WARNING: the sign-in window never appeared"; return 1; }
  guard_ok
  offset="$(app_log_size)"
  local filled=no
  for _ in $(seq 10); do
    guard_ok
    if psw fill-env "$window" 0 TMW_SMOKE_USERNAME >/dev/null 2>&1; then filled=yes; break; fi
    sleep 1
  done
  [[ "$filled" == yes ]] || { log "WARNING: the sign-in window has no username field: $(psw describe "$window")"; return 1; }
  guard_ok
  psw fill-env "$window" 1 TMW_SMOKE_PASSWORD >/dev/null || { log "WARNING: the sign-in window has no password field"; return 1; }
  act invoke "$window" 'Entrar|Sign in' >/dev/null
  unset TMW_SMOKE_PASSWORD CREW_E2E_B_PASSWORD
  local deadline=$((SECONDS + 30))
  until app_log_since "$offset" | grep -q 'signed in'; do
    (( SECONDS < deadline )) || { log "WARNING: signing in did not finish"; return 1; }
    sleep 0.5
  done
  signed_in=1
  sleep 3
  window="$(app_window)"
  [[ "$window" != 0 ]] && psw close-window "$window" >/dev/null
  log "signed in as crew-e2e-b"
}

sign_out() {
  local window offset
  offset="$(app_log_size)"
  send_to_app
  window="$(app_window)"
  if [[ "$window" == 0 ]]; then
    log "WARNING: Settings never opened, sign out by hand"
    return
  fi
  sleep 2
  act invoke "$window" 'Cuenta|Account' >/dev/null || true
  sleep 1
  act invoke "$window" 'Cerrar sesión|Sign out' >/dev/null || true
  local deadline=$((SECONDS + 20))
  until app_log_since "$offset" | grep -q 'signed out'; do
    if (( SECONDS >= deadline )); then
      log "WARNING: signing out did not finish, sign out by hand"
      return
    fi
    sleep 0.5
  done
  signed_in=""
  log "signed out; dev credentials left: $(cmd.exe /d /c 'cmdkey /list' 2>/dev/null | grep -c 'dev.fless.takemyword.dev' || true)"
}

start_race() {
  [[ -n "$race" && -z "${race_pid:-}" ]] || return 0
  powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$ps1" race "$(wslpath -w "$scratch/race")" "$race" >/dev/null 2>&1 &
  race_pid=$!
  for _ in $(seq 50); do [[ -e "$scratch/race.ready" ]] && break; sleep 0.2; done
  [[ -e "$scratch/race.ready" ]] || fail "the race reader did not start"
  log "race reader started for targets 6 to 8: it reads the clipboard without a window on every $([[ "$race" == update ]] && echo "clipboard update" || echo "Ctrl+V")"
}

expected_texts=(
  "Hello, this is a Take My Word test dictation."
  "Hola, este es un dictado de prueba de Take My Word."
)
expected_two_lines=(
  $'First line of a Take My Word test.\nSecond line of the same dictation.'
  $'Primera línea de una prueba de Take My Word.\nSegunda línea del mismo dictado.'
)

one_try() {
  local n="$1" try="$2" kind="$3"
  guard_ok
  local previous="tmw smoke previous clipboard $n.$try"
  psw set-clipboard "$(printf '%s' "$previous" | base64 -w0)" >/dev/null
  local before; before="$(prompts_of "$n")"
  focus_target "$n"
  local offset; offset="$(app_log_size)"
  local outcome="none"
  if [[ "$kind" == direct ]]; then
    psw set-clipboard "$(printf 'first line of the smoke\nsecond line of the smoke' | base64 -w0)" >/dev/null
    act chord ctrl v >/dev/null
    sleep 1.5
    outcome="direct"
  elif [[ "$kind" == hold ]]; then
    act hold 2500 alt ctrl win >/dev/null
    wait_for_outcome "$offset" || true
  else
    guard_ok
    [[ "$(psw is-foreground "$(window_of "$n")")" == yes ]] || fail "the foreground is not target $n before the dictation: $(psw foreground)"
    send_to_app --dictate-wav "$wav"
    wait_for_outcome "$offset" || true
  fi
  local lines; lines="$(app_log_since "$offset" | grep -E 'paste|clipboard|offered|keystroke|restoring|dictat|snapshot' || true)"
  [[ "$kind" != direct ]] && outcome="$(grep -o -E 'pasted a dictation|left a dictation in the clipboard: [A-Za-z]+|returned no text' <<<"$lines" | tail -1 || echo none)"
  local dialog="<none>"
  if (( n <= 4 )); then
    local press='Cancel|Cancelar'
    [[ "$kind" == multiline ]] && press='Paste anyway|Pegar de todos modos'
    guard_ok
    dialog="$(psw dialog "$(window_of "$n")" "$press" || echo '<dialog check failed>')"
    [[ "$dialog" == *"pressed Paste"* || "$dialog" == *"pressed Pegar"* ]] && sleep 1
  fi
  local text; text="$(read_target "$n")"
  local after; after="$(prompts_of "$n")"
  local clipboard; clipboard="$(psw clipboard)"
  local restored=no
  [[ "$clipboard" == "$(printf '%s' "$previous" | base64 -w0)" ]] && restored=yes
  [[ "$outcome" == "left a dictation"* && "$restored" == no ]] && restored="no, holds the dictation"
  local landed=no
  if [[ "$kind" == direct ]]; then
    [[ "$text" == *"first line of the smoke"$'\n'"second line of the smoke"* ]] && landed=yes
  elif [[ "$kind" == multiline ]]; then
    for expected in "${expected_two_lines[@]}"; do
      [[ "$text" == *"$expected"* || "$text" == *"[Pasted text"* ]] && landed=yes
    done
  else
    for expected in "${expected_texts[@]}"; do
      [[ "$text" == *"$expected"* ]] && landed=yes
    done
  fi
  [[ "$dialog" != "<none>" && "$landed" == no ]] && landed="no, dialog shown"
  local ran=no
  (( after > before )) && ran=yes
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$n" "$try" "$kind" "$outcome" "$landed" "$ran" "$restored" \
    "$(printf '%s' "$text" | tr '\n' '|')" >> "$out/results.tsv"
  {
    echo "== target $n try $try ($kind): outcome=$outcome landed=$landed ran=$ran restored=$restored dialog=$dialog"
    echo "-- target text: $(printf '%s' "$text" | tr '\n' '|')"
    echo "$lines"
  } >> "$out/pastes.log"
  log "target $n try $try ($kind): $outcome, landed $landed, ran $ran, clipboard back $restored"
  app_alive || fail "the app the run started is no longer running"
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

offset="$(app_log_size)"
app_pid="$(start "$app" | tail -1)"
[[ "$app_pid" =~ ^[0-9]+$ ]] || fail "the app did not start"
sleep 8
app_alive || fail "the app did not start"
send_to_app --stub-mode stub-normal
sleep 1
if [[ -n "${sign_in_env:-}" ]] && ! sign_in; then
  hold=0
  log "WARNING: not signed in, so the run skips the hold"
fi
log "app started: $(app_log_since "$offset" | grep -c . ) log lines"

IFS=, read -r -a chosen <<<"$targets"
for n in "${chosen[@]}"; do
  (( n >= 6 )) && start_race
  open_target "$n"
  for try in $(seq "$tries"); do
    one_try "$n" "$try" single
  done
  case "$multiline" in
    app) send_to_app --stub-mode stub-two-lines; sleep 1; one_try "$n" ml multiline; send_to_app --stub-mode stub-normal; sleep 1 ;;
    direct) one_try "$n" ml direct ;;
  esac
  if [[ "$hold" == 1 && "$n" == 1 ]]; then
    one_try "$n" hold hold
  fi
  close_target "$n"
  opened_targets=("${opened_targets[@]/$n}")
done

send_to_app --stub-mode stub-off
log "done: $(wc -l < "$out/results.tsv") pastes, results in $out"
