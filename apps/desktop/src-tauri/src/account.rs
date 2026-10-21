use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::api::ApiFailure;
use crate::auth::Secret;
use crate::auth::account::{AccountError, SignInStep, User};
use crate::shell::Shell;
use crate::{tray, windows};

const UNREACHABLE: &str = "We could not reach the service. Try again in a few minutes.";
const SESSION_ENDED: &str = "Your session ended. Sign in again.";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountView {
    signed_in: bool,
    username: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Step {
    ChoosePassword,
    Onboarding,
    Done,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Problem {
    message: &'static str,
    back_to_sign_in: bool,
}

impl From<AccountError> for Problem {
    fn from(error: AccountError) -> Self {
        let (message, back_to_sign_in) = match error {
            AccountError::InvalidCredentials => ("Wrong username or password.", false),
            AccountError::InvalidPassword => {
                ("The password does not meet the requirements.", false)
            }
            AccountError::Expired => (
                "The sign-in expired. Sign in again with your temporary password.",
                true,
            ),
            AccountError::SignedOut => (SESSION_ENDED, true),
            AccountError::Unavailable(_) => (UNREACHABLE, false),
        };
        Self {
            message,
            back_to_sign_in,
        }
    }
}

impl From<ApiFailure> for Problem {
    fn from(failure: ApiFailure) -> Self {
        log::warn!("an account request failed: {failure}");
        let (message, back_to_sign_in) = match failure {
            ApiFailure::SignedOut => (SESSION_ENDED, true),
            ApiFailure::Network(_) => (UNREACHABLE, false),
            ApiFailure::Rejected { .. } | ApiFailure::InvalidResponse(_) => {
                ("Something went wrong. Try again.", false)
            }
        };
        Self {
            message,
            back_to_sign_in,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleOption {
    id: String,
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Onboarding {
    styles: Vec<StyleOption>,
    selected: String,
}

async fn blocking<T: Send + 'static>(
    app: AppHandle,
    work: impl FnOnce(&AppHandle, &Shell) -> T + Send + 'static,
) -> T {
    tauri::async_runtime::spawn_blocking(move || work(&app, app.state::<Shell>().inner()))
        .await
        .expect("an account task panicked")
}

#[tauri::command]
pub async fn account_status(app: AppHandle) -> AccountView {
    blocking(app, |_, shell| {
        let signed_in = shell.account.is_signed_in();
        let username = signed_in
            .then(|| shell.account.user().ok())
            .flatten()
            .map(|user| user.username);
        AccountView {
            signed_in,
            username,
        }
    })
    .await
}

#[tauri::command]
pub async fn sign_in(app: AppHandle, username: String, password: String) -> Result<Step, Problem> {
    let password = Secret::new(password);
    blocking(app, move |app, shell| {
        match shell.account.sign_in(username.trim(), password)? {
            SignInStep::NewPasswordRequired => Ok(Step::ChoosePassword),
            SignInStep::SignedIn(user) => Ok(after_sign_in(app, shell, &user)),
        }
    })
    .await
}

#[tauri::command]
pub async fn choose_password(app: AppHandle, password: String) -> Result<Step, Problem> {
    let password = Secret::new(password);
    blocking(app, move |app, shell| {
        let user = shell.account.complete_new_password(password)?;
        Ok(after_sign_in(app, shell, &user))
    })
    .await
}

#[tauri::command]
pub async fn onboarding(app: AppHandle) -> Result<Onboarding, Problem> {
    blocking(app, |_, shell| {
        let styles = shell.api.styles()?.styles;
        let selected = shell.api.settings()?.default_style_id;
        Ok(Onboarding {
            styles: styles
                .into_iter()
                .map(|style| StyleOption {
                    id: style.id,
                    name: style.name,
                })
                .collect(),
            selected,
        })
    })
    .await
}

#[tauri::command]
pub async fn save_default_style(app: AppHandle, style_id: String) -> Result<(), Problem> {
    blocking(app, move |app, shell| {
        let mut settings = shell.api.settings()?;
        settings.default_style_id = style_id;
        shell.api.replace_settings(&settings)?;
        let user = shell.account.user()?;
        shell.update_settings(|settings| {
            if !settings.onboarded_users.contains(&user.sub) {
                settings.onboarded_users.push(user.sub.clone());
            }
        });
        finish(app, shell);
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn open_sign_in(app: AppHandle) {
    windows::open_account(&app, false);
}

#[tauri::command]
pub async fn sign_out(app: AppHandle) {
    blocking(app, |_, shell| shell.account.sign_out()).await;
}

fn after_sign_in(app: &AppHandle, shell: &Shell, user: &User) -> Step {
    log::info!("signed in");
    if shell.settings().onboarded_users.contains(&user.sub) {
        finish(app, shell);
        return Step::Done;
    }
    Step::Onboarding
}

fn finish(app: &AppHandle, shell: &Shell) {
    if let Some(window) = app.get_webview_window(windows::ACCOUNT) {
        let _ = window.close();
    }
    if !shell.settings().first_run_done {
        windows::open_first_run(app);
    }
}

pub fn changed(app: &AppHandle, signed_in: bool) {
    log::info!("account: signed {}", if signed_in { "in" } else { "out" });
    tray::show_signed_in(app, signed_in);
    let _ = app.emit("account-changed", signed_in);
    if !signed_in {
        windows::open_account(app, false);
    }
}

pub fn on_startup(app: &AppHandle) {
    let shell = app.state::<Shell>();
    if !shell.account.is_signed_in() {
        windows::open_account(app, false);
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let shell = app.state::<Shell>();
        let onboarded = |user: &User| shell.settings().onboarded_users.contains(&user.sub);
        match shell.account.user() {
            Ok(user) if !onboarded(&user) => windows::open_account(&app, true),
            _ if !shell.settings().first_run_done => windows::open_first_run(&app),
            _ => {}
        }
    });
}

pub fn toggle_from_tray(app: &AppHandle) {
    let shell = app.state::<Shell>();
    if !shell.account.is_signed_in() {
        windows::open_account(app, false);
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || app.state::<Shell>().account.sign_out());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_ended_session_or_expired_challenge_returns_to_sign_in_and_outages_do_not() {
        assert!(Problem::from(AccountError::Expired).back_to_sign_in);
        assert!(Problem::from(AccountError::SignedOut).back_to_sign_in);
        assert!(Problem::from(ApiFailure::SignedOut).back_to_sign_in);
        assert!(!Problem::from(AccountError::InvalidCredentials).back_to_sign_in);
        assert!(!Problem::from(AccountError::Unavailable("offline".into())).back_to_sign_in);
        assert!(!Problem::from(ApiFailure::Network("offline".into())).back_to_sign_in);
    }
}
