#!/usr/bin/env bash
set -euo pipefail

desktop="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(git -C "$desktop" rev-parse --show-toplevel)"
image="tmw-linux-check"

docker build --quiet --tag "$image" - >/dev/null <<'DOCKERFILE'
FROM ubuntu:24.04
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl build-essential pkg-config \
    libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
    libasound2-dev libxdo-dev libxkbcommon-dev libssl-dev \
 && rm -rf /var/lib/apt/lists/*
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --component clippy --default-toolchain stable
ENV PATH=/root/.cargo/bin:$PATH
DOCKERFILE

(cd "$desktop" && pnpm build >/dev/null)

tar -C "$repo" --exclude=.git --exclude=node_modules --exclude=target -cf - . |
  docker run --rm -i \
    -v tmw-linux-check-registry:/root/.cargo/registry \
    -v tmw-linux-check-target:/target \
    -e CARGO_TARGET_DIR=/target \
    -e CARGO_TERM_COLOR=never \
    "$image" sh -c 'mkdir /work && tar -xf - -C /work && cd /work/apps/desktop/src-tauri && cargo clippy --all-targets --locked -- -D warnings'
