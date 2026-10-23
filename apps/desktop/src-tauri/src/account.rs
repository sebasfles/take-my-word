use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::api::{ApiFailure, UserContext};
use crate::auth::Secret;
use crate::auth::account::{AccountError, SignInStep, User};
use crate::commands::blocking;
use crate::i18n::Message;
use crate::locale::{self, Language};
use crate::server::{self, SelfHosted, ServerError};
use crate::shell::Shell;
use crate::{tray, windows};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountView {
    signed_in: bool,
    username: Option<String>,
    server: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    signed_in: bool,
    username: Option<String>,
    first_run_done: bool,
    onboarded: bool,
    hands_free_note: bool,
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
    message: Message,
    back_to_sign_in: bool,
}

impl From<Message> for Problem {
    fn from(message: Message) -> Self {
        Self {
            message,
            back_to_sign_in: false,
        }
    }
}

impl From<AccountError> for Problem {
    fn from(error: AccountError) -> Self {
        let (message, back_to_sign_in) = match error {
            AccountError::InvalidCredentials => (Message::WrongCredentials, false),
            AccountError::InvalidPassword => (Message::InvalidPassword, false),
            AccountError::Expired => (Message::SignInExpired, true),
            AccountError::SignedOut => (Message::SessionEnded, true),
            AccountError::StillSignedIn => (Message::ServerSignedIn, false),
            AccountError::Unavailable(_) => (Message::Unreachable, false),
        };
        Self {
            message,
            back_to_sign_in,
        }
    }
}

impl From<ServerError> for Problem {
    fn from(error: ServerError) -> Self {
        log::warn!("choosing a server failed: {error}");
        match error {
            ServerError::InvalidDomain(_) => Message::ServerInvalidDomain,
            ServerError::Unreachable(_) => Message::ServerUnreachable,
            ServerError::NotTakeMyWord(_) => Message::ServerNotTakeMyWord,
            ServerError::Version(_) => Message::ServerNewer,
        }
        .into()
    }
}

impl From<ApiFailure> for Problem {
    fn from(failure: ApiFailure) -> Self {
        log::warn!("an account request failed: {failure}");
        let (message, back_to_sign_in) = match failure {
            ApiFailure::SignedOut => (Message::SessionEnded, true),
            ApiFailure::Network(_) => (Message::Unreachable, false),
            ApiFailure::Rejected { .. }
            | ApiFailure::InvalidRequest
            | ApiFailure::InvalidResponse(_) => (Message::Generic, false),
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
    prompt: String,
    builtin: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Onboarding {
    styles: Vec<StyleOption>,
    selected: String,
    dictation_languages: Vec<Language>,
    context: UserContext,
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
            server: shell.settings().server.map(|chosen| chosen.domain),
        }
    })
    .await
}

#[tauri::command]
pub fn server(shell: State<'_, Shell>) -> Option<String> {
    shell.settings().server.map(|chosen| chosen.domain)
}

#[tauri::command]
pub async fn use_server(app: AppHandle, domain: String) -> Result<Option<String>, Problem> {
    blocking(app, move |_, shell| {
        let domain = server::normalize_domain(&domain)?;
        let discovered = server::discover(&domain)?;
        let chosen = (discovered != *shell.official()).then_some(SelfHosted {
            domain,
            server: discovered,
        });
        let shown = chosen.as_ref().map(|chosen| chosen.domain.clone());
        shell.use_server(chosen)?;
        Ok(shown)
    })
    .await
}

#[tauri::command]
pub async fn use_official_server(app: AppHandle) -> Result<(), Problem> {
    blocking(app, |_, shell| Ok(shell.use_server(None)?)).await
}

#[tauri::command]
pub async fn app_state(app: AppHandle) -> AppState {
    blocking(app, |_, shell| {
        let settings = shell.settings();
        let signed_in = shell.account.is_signed_in();
        let user = signed_in.then(|| shell.account.user().ok()).flatten();
        AppState {
            signed_in,
            onboarded: user
                .as_ref()
                .is_none_or(|user| settings.onboarded_users.contains(&user.sub)),
            username: user.map(|user| user.username),
            first_run_done: settings.first_run_done,
            hands_free_note: settings.first_run_done && !settings.hands_free_note_seen,
        }
    })
    .await
}

#[tauri::command]
pub async fn sign_in(app: AppHandle, username: String, password: String) -> Result<Step, Problem> {
    let password = Secret::new(password);
    blocking(app, move |_, shell| {
        match shell.account.sign_in(username.trim(), password)? {
            SignInStep::NewPasswordRequired => Ok(Step::ChoosePassword),
            SignInStep::SignedIn(user) => Ok(after_sign_in(shell, &user)),
        }
    })
    .await
}

#[tauri::command]
pub async fn choose_password(app: AppHandle, password: String) -> Result<Step, Problem> {
    let password = Secret::new(password);
    blocking(app, move |_, shell| {
        let user = shell.account.complete_new_password(password)?;
        Ok(after_sign_in(shell, &user))
    })
    .await
}

#[tauri::command]
pub async fn onboarding(app: AppHandle) -> Result<Onboarding, Problem> {
    blocking(app, |_, shell| {
        let styles = shell.api.styles()?.styles;
        let settings = shell.api.settings()?;
        let user = shell.account.user()?;
        let dictation_languages = if shell.settings().onboarded_users.contains(&user.sub) {
            settings.dictation_languages
        } else {
            vec![locale::system_language()]
        };
        Ok(Onboarding {
            styles: styles
                .into_iter()
                .map(|style| StyleOption {
                    id: style.id,
                    name: style.name,
                    prompt: style.prompt,
                    builtin: style.builtin,
                })
                .collect(),
            selected: settings.default_style_id,
            dictation_languages,
            context: settings.context,
        })
    })
    .await
}

#[tauri::command]
pub async fn save_onboarding(
    app: AppHandle,
    style_id: String,
    dictation_languages: Vec<Language>,
    context: UserContext,
) -> Result<(), Problem> {
    if dictation_languages.is_empty() {
        return Err(Message::Generic.into());
    }
    blocking(app, move |_, shell| {
        let mut settings = shell.api.settings()?;
        settings.default_style_id = style_id;
        settings.dictation_languages = dictation_languages;
        settings.context = context;
        shell.api.replace_settings(&settings)?;
        let user = shell.account.user()?;
        shell.update_settings(|settings| {
            if !settings.onboarded_users.contains(&user.sub) {
                settings.onboarded_users.push(user.sub.clone());
            }
        });
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn finish_onboarding(shell: State<'_, Shell>) {
    shell.update_settings(|settings| {
        settings.first_run_done = true;
        settings.hands_free_note_seen = true;
    });
}

#[tauri::command]
pub fn dismiss_hands_free_note(shell: State<'_, Shell>) {
    shell.update_settings(|settings| settings.hands_free_note_seen = true);
}

#[tauri::command]
pub fn open_sign_in(app: AppHandle, shell: State<'_, Shell>) {
    windows::open_main(&app, "");
    let _ = app.emit_to(
        windows::MAIN,
        "account-changed",
        shell.account.is_signed_in(),
    );
}

#[tauri::command]
pub async fn sign_out(app: AppHandle) {
    blocking(app, |_, shell| shell.account.sign_out()).await;
}

fn after_sign_in(shell: &Shell, user: &User) -> Step {
    log::info!("signed in");
    if shell.settings().onboarded_users.contains(&user.sub) {
        return Step::Done;
    }
    Step::Onboarding
}

pub fn changed(app: &AppHandle, signed_in: bool) {
    log::info!("account: signed {}", if signed_in { "in" } else { "out" });
    if let Some(shell) = app.try_state::<Shell>() {
        if signed_in {
            let app = app.clone();
            std::thread::spawn(move || app.state::<Shell>().reload_rules());
        } else {
            shell.rules.clear();
        }
    }
    tray::show_signed_in(app, signed_in);
    let _ = app.emit("account-changed", signed_in);
    if !signed_in {
        windows::open_main(app, "");
    }
}

pub fn on_startup(app: &AppHandle, launched_by_user: bool) {
    let shell = app.state::<Shell>();
    if launched_by_user || !shell.account.is_signed_in() || !shell.settings().first_run_done {
        windows::open_main(app, "");
        if shell.account.is_signed_in() {
            let app = app.clone();
            std::thread::spawn(move || app.state::<Shell>().reload_rules());
        }
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let shell = app.state::<Shell>();
        if let Ok(user) = shell.account.user()
            && !shell.settings().onboarded_users.contains(&user.sub)
        {
            let main = app.clone();
            let _ = app.run_on_main_thread(move || windows::open_main(&main, ""));
        }
        shell.reload_rules();
    });
}

pub fn toggle_from_tray(app: &AppHandle) {
    let shell = app.state::<Shell>();
    if !shell.account.is_signed_in() {
        windows::open_main(app, "");
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
