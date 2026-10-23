---
updated: 2026-10-23
source: 0016_self_hosting
---

# Mobile: architecture and debt

## 2026-10-20: Expo managed workflow with EAS, inside the monorepo

- Decision: the app is Expo managed in `apps/mobile` of the project's monorepo; EAS Build, Submit and Update produce, ship and patch it, running from `apps/mobile`.
- Alternatives rejected: bare React Native or native apps per platform; a separate mobile repository, as first proposed.
- Reason: no store pipeline is hand-made, and living in the monorepo lets the app import the zod contracts from `packages/shared` directly.
- Debt created: none.
- Revisit when: a feature needs native code no config plugin can provide.
- Source: setup

## 2026-10-20: Record m4a and send it as is

- Decision: `expo-audio` records m4a and the app posts that file to `POST /dictations`; the API accepts WAV and m4a only.
- Alternatives rejected: Opus, as first proposed; transcoding on the device.
- Reason: m4a comes straight from the recorder with no encoder on the phone, and the transcriber accepts it.
- Debt created: none.
- Revisit when: upload size or time on mobile networks becomes a measured problem.
- Source: setup

## 2026-10-20: Copy and share instead of paste; keyboard in v2

- Decision: the app shows the clean text with copy and a share sheet; the user picks the style by hand.
- Alternatives rejected: a custom keyboard extension in v1.
- Reason: iOS and Android let a regular app neither see the active app nor type into it; a keyboard extension needs a config plugin and is its own project.
- Debt created: dictating on the phone takes an extra copy or share step compared to desktop.
- Revisit when: v2 starts the keyboard extension.
- Source: setup

## 2026-10-20: Own login form against Cognito, tokens in expo-secure-store

- Decision: the app signs in with username and password against Cognito (SRP) from its own form and keeps the rotating refresh token in `expo-secure-store`.
- Alternatives rejected: `expo-auth-session` with Cognito managed login and Google, as first proposed.
- Reason: v1 has closed sign-up with username and password only; managed login arrives with Google sign-in.
- Debt created: none.
- Revisit when: phase 6 adds Google sign-in with PKCE.
- Source: setup
