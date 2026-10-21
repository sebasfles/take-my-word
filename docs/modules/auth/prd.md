---
updated: 2026-10-21
source: 0007_desktop_integration
---

# Auth: product

## Purpose

Only people Sebastian invites can dictate, and each of them signs in once per device and stays signed in.
Dictation costs money per minute of audio, so every request must belong to a known person whose quota and settings apply.
Signing in must never get between the user and the hotkey: after the first login the session lasts until the user signs out.

## User flows

### Get an account

1. Sebastian creates the account with a username and a temporary password and hands them over.
2. On first sign-in the user is asked to choose their own password.

There is no public sign-up page.

### Sign in on a device

1. The user opens the desktop app, the mobile app or the web, and sees a username and password form.
2. With a temporary password the form asks the user to choose their own before going on.
3. On success the app goes straight to its main screen: hold-to-talk on desktop and mobile, the account page on the web.
4. The first time a user signs in on a device, the app asks for a default style with the current one preselected; it asks once per user per device, not again when that user signs back in there, and dictation works while the choice is pending.
5. Desktop and mobile keep the user signed in across restarts with no choice to make.
   The web offers "remember me": checked, the session survives closing the browser; unchecked, it ends with the browser session.

Errors and empty states: a wrong username or password shows one generic message without saying which field failed; with no network the form says the service is unreachable.

### Stay signed in

1. The app renews the session in the background; the user never sees it.
2. A revoked session keeps working for up to about an hour, until its current access expires; then the next renewal fails and the app returns to the sign-in form, keeping nothing of a failed recording.

### Sign out

1. The user signs out from the app's menu or settings.
2. Only that device loses its session; other devices stay signed in.
3. Sebastian can end a user's session on one device or on all of them.

## Rules

- Accounts exist only by invitation; there is no self-service sign-up and no captcha.
- Username and password is the only way to sign in in v1.
- A session lasts until sign-out or revocation, not a fixed number of days; revocation takes effect within about an hour.
- Each device has its own session, so losing one device is fixed by revoking that device alone; on the web, each browser is a device.
- Every action in the product (dictating, dictionary, styles, app rules, settings, history) requires a signed-in user and only touches that user's data.

## Out of scope

- Google sign-in: phase 6.
- Service credentials for third-party integrations: later.
- Teams, roles or shared accounts.

## Open questions

- None; a forgotten password is reset by Sebastian by hand in v1.
