---
updated: 2026-10-20
source: setup
---

# Mobile: technical

Planned; no code yet, phase 4 builds it.

## Structure

| Path | What |
|---|---|
| `apps/mobile` | Expo managed app (React Native, TypeScript), one workspace of the pnpm monorepo |
| `apps/mobile` recording | `expo-audio` records m4a while the talk button is held; recordings under 0.5 s are discarded on the device |
| `apps/mobile` login | Username and password form against Cognito (SRP); tokens in `expo-secure-store` (owned by auth) |
| `apps/mobile` main screen | Hold-to-talk button, transcript, copy, share sheet, manual style picker |
| `packages/shared` | zod contracts for `POST /dictations` and the style list, imported by the app |

Exact folders and the routing library inside `apps/mobile` are decided when phase 4 starts.
The SRP client library for Cognito on React Native is not chosen yet.

## Endpoints owned

None; mobile is a client of the API.

| Method | Route | Purpose |
|---|---|---|
| POST | `/dictations` | Sends the m4a with locale and the picked `styleId`, receives the clean text |
| GET | `/styles` | Fills the manual style picker |
| GET | `/me/settings` | Reads the default style and locale to preselect them |

Jobs, listeners or scheduled work: none on the device.

## Depends on

- auth: Cognito sign-in, silent refresh with rotation, and the access token every request carries.
- dictation: `POST /dictations` does the transcription and cleanup; mobile only records and displays.
- styles: the list behind the picker.
- Expo Application Services: EAS Build for binaries, EAS Submit for the stores, EAS Update for over-the-air JavaScript updates.

## Depended on by

- None.

## Configuration

- API base URL and Cognito user pool id and app client id per env, baked into each build.
- EAS build profiles and update channels map to dev and prd.
- Microphone permission strings for iOS and Android in the Expo app config.

## Testing

- Tests live next to the code in `apps/mobile`.
- Module-specific run: see TRD.
