#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: scripts/windows.sh <command> [args...]" >&2
  exit 2
fi

repo="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
checkout="${TMW_WINDOWS_CHECKOUT:-/mnt/c/dev/take-my-word}"

mkdir -p "$checkout"
rsync -a --delete --exclude=.git --filter=':- .gitignore' "$repo/" "$checkout/"
commit="$(git -C "$repo" rev-parse HEAD)"
if [[ -n "$(git -C "$repo" status --porcelain)" ]]; then
  commit="$commit-dirty"
fi
echo "$commit" > "$checkout/.synced-commit"
echo "windows.sh: $checkout at $commit" >&2

if [[ "$1" == cargo ]]; then
  workdir="$checkout/apps/desktop/src-tauri"
else
  workdir="$checkout/apps/desktop"
fi

for arg in "$@"; do
  if [[ "$arg" =~ [[:space:]\"\'] ]]; then
    echo "windows.sh: arguments cannot contain spaces or quotes: $arg" >&2
    exit 2
  fi
done

lockfile="apps/desktop/src-tauri/Cargo.lock"
status=0
powershell.exe -NoProfile -NonInteractive -Command "
  \$env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')
  \$env:CARGO_TERM_COLOR = 'never'
  \$env:CARGO_BUILD_JOBS = '2'
  Set-Location '$(wslpath -w "$workdir")'
  cmd.exe /d /c '$* 2>&1'
  exit \$LASTEXITCODE
" || status=$?

if [[ -f "$checkout/$lockfile" ]] && ! cmp -s "$checkout/$lockfile" "$repo/$lockfile"; then
  cp "$checkout/$lockfile" "$repo/$lockfile"
  echo "windows.sh: copied the updated $lockfile back" >&2
fi
exit "$status"
