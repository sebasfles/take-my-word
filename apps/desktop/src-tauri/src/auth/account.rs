use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, RwLock, RwLockReadGuard};
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Deserialize;
use time::OffsetDateTime;

use super::Secret;
use super::cognito::{Cognito, CognitoError, NewDevice, NewPasswordChallenge, SignIn, Tokens};
use crate::keychain::{Keychain, StoredSession};
use crate::server::Server;

const RENEW_BEFORE: Duration = Duration::from_secs(5 * 60);
const CREDENTIAL_ERRORS: [&str; 4] = [
    "NotAuthorizedException",
    "UserNotFoundException",
    "PasswordResetRequiredException",
    "UserNotConfirmedException",
];

pub trait IdentityProvider: Send + Sync {
    fn sign_in(&self, username: &str, password: &Secret) -> Result<SignIn, CognitoError>;
    fn complete_new_password(
        &self,
        challenge: &NewPasswordChallenge,
        new_password: &Secret,
    ) -> Result<Tokens, CognitoError>;
    fn confirm_device(&self, access_token: &Secret, device: &NewDevice)
    -> Result<(), CognitoError>;
    fn refresh(&self, refresh_token: &Secret, device_key: &Secret) -> Result<Tokens, CognitoError>;
    fn forget_device(&self, access_token: &Secret, device_key: &Secret)
    -> Result<(), CognitoError>;
    fn revoke_token(&self, refresh_token: &Secret) -> Result<(), CognitoError>;
}

pub struct CognitoProvider {
    cognito: RwLock<Cognito>,
    device_name: String,
}

impl CognitoProvider {
    pub fn new(cognito: Cognito, device_name: impl Into<String>) -> Self {
        Self {
            cognito: RwLock::new(cognito),
            device_name: device_name.into(),
        }
    }

    pub fn connect(&self, server: &Server) -> Result<(), CognitoError> {
        let cognito = Cognito::for_server(server)?;
        *self.cognito.write().unwrap_or_else(PoisonError::into_inner) = cognito;
        Ok(())
    }

    fn cognito(&self) -> RwLockReadGuard<'_, Cognito> {
        self.cognito.read().unwrap_or_else(PoisonError::into_inner)
    }
}

impl IdentityProvider for CognitoProvider {
    fn sign_in(&self, username: &str, password: &Secret) -> Result<SignIn, CognitoError> {
        self.cognito()
            .sign_in(username, password, OffsetDateTime::now_utc())
    }

    fn complete_new_password(
        &self,
        challenge: &NewPasswordChallenge,
        new_password: &Secret,
    ) -> Result<Tokens, CognitoError> {
        self.cognito()
            .complete_new_password(challenge, new_password)
    }

    fn confirm_device(
        &self,
        access_token: &Secret,
        device: &NewDevice,
    ) -> Result<(), CognitoError> {
        self.cognito()
            .confirm_device(access_token, device, &self.device_name)
    }

    fn refresh(&self, refresh_token: &Secret, device_key: &Secret) -> Result<Tokens, CognitoError> {
        self.cognito().refresh(refresh_token, device_key)
    }

    fn forget_device(
        &self,
        access_token: &Secret,
        device_key: &Secret,
    ) -> Result<(), CognitoError> {
        self.cognito().forget_device(access_token, device_key)
    }

    fn revoke_token(&self, refresh_token: &Secret) -> Result<(), CognitoError> {
        self.cognito().revoke_token(refresh_token)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct User {
    pub sub: String,
    pub username: String,
}

#[derive(Debug, PartialEq, Eq)]
pub enum SignInStep {
    NewPasswordRequired,
    SignedIn(User),
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum AccountError {
    #[error("wrong username or password")]
    InvalidCredentials,
    #[error("the new password does not meet the requirements")]
    InvalidPassword,
    #[error("the sign-in expired")]
    Expired,
    #[error("signed out")]
    SignedOut,
    #[error("still signed in")]
    StillSignedIn,
    #[error("{0}")]
    Unavailable(String),
}

fn unavailable(error: impl ToString) -> AccountError {
    AccountError::Unavailable(error.to_string())
}

struct Access {
    token: Secret,
    expires_at: Instant,
    user: User,
}

impl Access {
    fn new(token: Secret, expires_in: u64) -> Result<Self, AccountError> {
        let user = token
            .expose()
            .split('.')
            .nth(1)
            .and_then(|payload| URL_SAFE_NO_PAD.decode(payload).ok())
            .and_then(|payload| serde_json::from_slice::<User>(&payload).ok())
            .ok_or_else(|| unavailable("Cognito issued an unreadable access token"))?;
        Ok(Self {
            token,
            expires_at: Instant::now() + Duration::from_secs(expires_in),
            user,
        })
    }

    fn usable(&self) -> bool {
        Instant::now() + RENEW_BEFORE < self.expires_at
    }
}

struct Signed {
    stored: StoredSession,
    access: Option<Access>,
}

enum State {
    SignedOut(Option<NewPasswordChallenge>),
    SignedIn(Signed),
}

pub type Listener = Box<dyn Fn(bool) + Send + Sync>;

pub struct Account<I, K> {
    provider: I,
    keychain: K,
    state: Mutex<State>,
    signed_in: AtomicBool,
    listener: Listener,
}

impl<I: IdentityProvider, K: Keychain> Account<I, K> {
    pub fn restore(provider: I, keychain: K, listener: Listener) -> Self {
        let stored = keychain.load().unwrap_or_else(|error| {
            log::warn!("reading the session failed: {error}");
            None
        });
        let signed_in = stored.is_some();
        let state = match stored {
            Some(stored) => State::SignedIn(Signed {
                stored,
                access: None,
            }),
            None => State::SignedOut(None),
        };
        Self {
            provider,
            keychain,
            state: Mutex::new(state),
            signed_in: AtomicBool::new(signed_in),
            listener,
        }
    }

    pub fn is_signed_in(&self) -> bool {
        self.signed_in.load(Ordering::SeqCst)
    }

    pub fn user(&self) -> Result<User, AccountError> {
        let mut state = self.lock();
        let result = self.fresh(&mut state, None).and_then(|_| match &*state {
            State::SignedIn(Signed {
                access: Some(access),
                ..
            }) => Ok(access.user.clone()),
            _ => Err(AccountError::SignedOut),
        });
        self.settle(state, result)
    }

    pub fn access_token(&self) -> Result<Secret, AccountError> {
        let mut state = self.lock();
        let result = self.fresh(&mut state, None);
        self.settle(state, result)
    }

    pub fn renew_after_rejection(&self, rejected: &Secret) -> Result<Secret, AccountError> {
        let mut state = self.lock();
        let result = self.fresh(&mut state, Some(rejected));
        self.settle(state, result)
    }

    pub fn sign_in(&self, username: &str, password: Secret) -> Result<SignInStep, AccountError> {
        let mut state = self.lock();
        let result = match self.provider.sign_in(username, &password) {
            Ok(SignIn::Done(tokens)) => {
                self.establish(&mut state, tokens).map(SignInStep::SignedIn)
            }
            Ok(SignIn::NewPasswordRequired(challenge)) => {
                *state = State::SignedOut(Some(challenge));
                Ok(SignInStep::NewPasswordRequired)
            }
            Err(error)
                if error
                    .kind()
                    .is_some_and(|kind| CREDENTIAL_ERRORS.contains(&kind)) =>
            {
                Err(AccountError::InvalidCredentials)
            }
            Err(error) => {
                log::warn!("sign-in failed: {error}");
                Err(unavailable(error))
            }
        };
        drop(password);
        self.settle(state, result)
    }

    pub fn complete_new_password(&self, new_password: Secret) -> Result<User, AccountError> {
        let mut state = self.lock();
        let challenge = match &mut *state {
            State::SignedOut(challenge) => challenge.take(),
            State::SignedIn(_) => None,
        };
        let result = match challenge {
            None => Err(AccountError::Expired),
            Some(challenge) => match self
                .provider
                .complete_new_password(&challenge, &new_password)
            {
                Ok(tokens) => self.establish(&mut state, tokens),
                Err(error) => match error.kind() {
                    Some("NotAuthorizedException" | "CodeMismatchException") => {
                        Err(AccountError::Expired)
                    }
                    kind => {
                        log::warn!("choosing the password failed: {error}");
                        *state = State::SignedOut(Some(challenge));
                        Err(if kind == Some("InvalidPasswordException") {
                            AccountError::InvalidPassword
                        } else {
                            unavailable(error)
                        })
                    }
                },
            },
        };
        drop(new_password);
        self.settle(state, result)
    }

    pub fn sign_out(&self) {
        let mut state = self.lock();
        if matches!(*state, State::SignedIn(_)) {
            let access = self.fresh(&mut state, None);
            if let State::SignedIn(signed) = &*state {
                match access {
                    Ok(token) => {
                        if let Err(error) = self
                            .provider
                            .forget_device(&token, &signed.stored.device_key)
                        {
                            log::warn!("forgetting the device failed: {error}");
                        }
                    }
                    Err(error) => log::warn!("signing out without forgetting the device: {error}"),
                }
                if let Err(error) = self.provider.revoke_token(&signed.stored.refresh_token) {
                    log::warn!("revoking the refresh token failed: {error}");
                }
            }
        }
        self.end_locally(&mut state);
        self.settle(state, ());
    }

    pub fn while_signed_out<T>(&self, change: impl FnOnce(&I) -> T) -> Result<T, AccountError> {
        let mut state = self.lock();
        let result = match &mut *state {
            State::SignedIn(_) => Err(AccountError::StillSignedIn),
            State::SignedOut(challenge) => {
                *challenge = None;
                Ok(change(&self.provider))
            }
        };
        self.settle(state, result)
    }

    fn fresh(&self, state: &mut State, rejected: Option<&Secret>) -> Result<Secret, AccountError> {
        let State::SignedIn(signed) = state else {
            return Err(AccountError::SignedOut);
        };
        if let Some(access) = &signed.access {
            let current = match rejected {
                Some(rejected) => *rejected != access.token,
                None => access.usable(),
            };
            if current {
                return Ok(access.token.clone());
            }
        }
        match self
            .provider
            .refresh(&signed.stored.refresh_token, &signed.stored.device_key)
        {
            Ok(tokens) => {
                if let Err(error) = self.keychain.save_refresh_token(&tokens.refresh_token) {
                    log::error!("storing the rotated refresh token failed: {error}");
                }
                signed.stored.refresh_token = tokens.refresh_token;
                let access = Access::new(tokens.access_token, tokens.expires_in)?;
                let token = access.token.clone();
                signed.access = Some(access);
                Ok(token)
            }
            Err(error) if error.ends_session() => {
                log::warn!("the session ended: {error}");
                self.end_locally(state);
                Err(AccountError::SignedOut)
            }
            Err(error) => {
                log::warn!("renewing the session failed: {error}");
                Err(unavailable(error))
            }
        }
    }

    fn establish(&self, state: &mut State, tokens: Tokens) -> Result<User, AccountError> {
        let device = tokens
            .new_device
            .ok_or_else(|| unavailable("Cognito issued no device"))?;
        self.provider
            .confirm_device(&tokens.access_token, &device)
            .map_err(unavailable)?;
        let access = Access::new(tokens.access_token, tokens.expires_in)?;
        let stored = StoredSession {
            refresh_token: tokens.refresh_token,
            device_key: device.key,
            device_group_key: device.group_key,
        };
        if let Err(error) = self.keychain.save(&stored) {
            log::error!("storing the session failed: {error}");
            let _ = self
                .provider
                .forget_device(&access.token, &stored.device_key);
            let _ = self.provider.revoke_token(&stored.refresh_token);
            let _ = self.keychain.clear();
            return Err(unavailable("Windows did not store the sign-in."));
        }
        let user = access.user.clone();
        *state = State::SignedIn(Signed {
            stored,
            access: Some(access),
        });
        Ok(user)
    }

    fn end_locally(&self, state: &mut State) {
        if let Err(error) = self.keychain.clear() {
            log::error!("clearing the keychain failed: {error}");
        }
        *state = State::SignedOut(None);
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn settle<T>(&self, state: MutexGuard<'_, State>, result: T) -> T {
        let signed_in = matches!(*state, State::SignedIn(_));
        drop(state);
        if self.signed_in.swap(signed_in, Ordering::SeqCst) != signed_in {
            (self.listener)(signed_in);
        }
        result
    }
}

impl<I: IdentityProvider + 'static, K: Keychain + 'static> Account<I, K> {
    pub fn renew_in_background(self: &Arc<Self>) {
        if !self.is_signed_in() {
            return;
        }
        let account = Arc::clone(self);
        let spawned = thread::Builder::new()
            .name("session-renewal".into())
            .spawn(move || {
                let _ = account.access_token();
            });
        if let Err(error) = spawned {
            log::warn!("starting the session renewal failed: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;

    use serde_json::json;

    use super::*;
    use crate::keychain::memory::MemoryKeychain;

    enum Answer {
        SignIn(Result<SignIn, CognitoError>),
        Tokens(Result<Tokens, CognitoError>),
        Done(Result<(), CognitoError>),
    }

    #[derive(Default)]
    struct Fake {
        answers: Mutex<VecDeque<Answer>>,
        calls: Mutex<Vec<String>>,
        refresh_delay: Duration,
    }

    impl Fake {
        fn answering(answers: impl IntoIterator<Item = Answer>) -> Self {
            Self {
                answers: Mutex::new(answers.into_iter().collect()),
                ..Self::default()
            }
        }

        fn next(&self, call: String) -> Answer {
            self.calls.lock().unwrap().push(call);
            self.answers
                .lock()
                .unwrap()
                .pop_front()
                .expect("an unexpected Cognito call")
        }
    }

    impl IdentityProvider for Fake {
        fn sign_in(&self, username: &str, password: &Secret) -> Result<SignIn, CognitoError> {
            match self.next(format!("sign_in {username} {}", password.expose())) {
                Answer::SignIn(answer) => answer,
                _ => panic!("expected a sign-in answer"),
            }
        }

        fn complete_new_password(
            &self,
            challenge: &NewPasswordChallenge,
            new_password: &Secret,
        ) -> Result<Tokens, CognitoError> {
            let call = format!(
                "complete_new_password {} {}",
                challenge.session.expose(),
                new_password.expose()
            );
            match self.next(call) {
                Answer::Tokens(answer) => answer,
                _ => panic!("expected tokens"),
            }
        }

        fn confirm_device(
            &self,
            access_token: &Secret,
            device: &NewDevice,
        ) -> Result<(), CognitoError> {
            let call = format!(
                "confirm_device {} {}",
                short(access_token),
                device.key.expose()
            );
            match self.next(call) {
                Answer::Done(answer) => answer,
                _ => panic!("expected a unit answer"),
            }
        }

        fn refresh(
            &self,
            refresh_token: &Secret,
            device_key: &Secret,
        ) -> Result<Tokens, CognitoError> {
            thread::sleep(self.refresh_delay);
            let call = format!("refresh {} {}", refresh_token.expose(), device_key.expose());
            match self.next(call) {
                Answer::Tokens(answer) => answer,
                _ => panic!("expected tokens"),
            }
        }

        fn forget_device(
            &self,
            access_token: &Secret,
            device_key: &Secret,
        ) -> Result<(), CognitoError> {
            let call = format!(
                "forget_device {} {}",
                short(access_token),
                device_key.expose()
            );
            match self.next(call) {
                Answer::Done(answer) => answer,
                _ => panic!("expected a unit answer"),
            }
        }

        fn revoke_token(&self, refresh_token: &Secret) -> Result<(), CognitoError> {
            match self.next(format!("revoke_token {}", refresh_token.expose())) {
                Answer::Done(answer) => answer,
                _ => panic!("expected a unit answer"),
            }
        }
    }

    fn jwt(label: &str) -> Secret {
        let payload = json!({ "sub": "user-sub", "username": "sebastian", "label": label });
        Secret::new(format!(
            "header.{}.signature",
            URL_SAFE_NO_PAD.encode(payload.to_string())
        ))
    }

    fn short(token: &Secret) -> String {
        let payload = token.expose().split('.').nth(1).unwrap();
        let claims: serde_json::Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(payload).unwrap()).unwrap();
        claims["label"].as_str().unwrap().to_owned()
    }

    fn tokens(label: &str, expires_in: u64, device: bool) -> Tokens {
        Tokens {
            access_token: jwt(&format!("access-{label}")),
            refresh_token: Secret::new(format!("refresh-{label}")),
            expires_in,
            new_device: device.then(|| NewDevice {
                key: Secret::new("device-new"),
                group_key: Secret::new("group-new"),
            }),
        }
    }

    fn renewed(label: &str, expires_in: u64) -> Answer {
        Answer::Tokens(Ok(tokens(label, expires_in, false)))
    }

    fn rejected(kind: &str) -> CognitoError {
        CognitoError::Rejected {
            status: 400,
            kind: kind.into(),
            message: String::new(),
        }
    }

    fn stored() -> StoredSession {
        StoredSession {
            refresh_token: Secret::new("refresh-0"),
            device_key: Secret::new("device-0"),
            device_group_key: Secret::new("group-0"),
        }
    }

    type Changes = Arc<Mutex<Vec<bool>>>;

    fn account(
        provider: Fake,
        keychain: MemoryKeychain,
    ) -> (Arc<Account<Fake, MemoryKeychain>>, Changes) {
        let changes = Changes::default();
        let recorded = Arc::clone(&changes);
        let listener: Listener =
            Box::new(move |signed_in| recorded.lock().unwrap().push(signed_in));
        (
            Arc::new(Account::restore(provider, keychain, listener)),
            changes,
        )
    }

    fn calls(account: &Account<Fake, MemoryKeychain>) -> Vec<String> {
        account.provider.calls.lock().unwrap().clone()
    }

    #[test]
    fn the_server_changes_only_while_signed_out_and_drops_a_pending_new_password_step() {
        let (signed_in, _) = account(Fake::default(), MemoryKeychain::holding(stored()));
        assert_eq!(
            signed_in.while_signed_out(|_| ()),
            Err(AccountError::StillSignedIn)
        );

        let challenge = NewPasswordChallenge {
            username: "sebastian".into(),
            session: Secret::new("session-0"),
        };
        let (account, _) = account(
            Fake::answering([Answer::SignIn(Ok(SignIn::NewPasswordRequired(challenge)))]),
            MemoryKeychain::default(),
        );
        account
            .sign_in("sebastian", Secret::new("temporary"))
            .unwrap();
        assert_eq!(account.while_signed_out(|_| "switched"), Ok("switched"));
        assert_eq!(
            account.complete_new_password(Secret::new("chosen")),
            Err(AccountError::Expired)
        );
        assert_eq!(calls(&account), ["sign_in sebastian temporary"]);
    }

    #[test]
    fn a_restored_session_renews_lazily_once_and_stores_the_rotated_token_at_once() {
        let (account, _) = account(
            Fake::answering([renewed("1", 3600)]),
            MemoryKeychain::holding(stored()),
        );
        assert!(account.is_signed_in());
        assert!(calls(&account).is_empty());

        assert_eq!(short(&account.access_token().unwrap()), "access-1");
        assert_eq!(
            account.keychain.refresh_token().as_deref(),
            Some("refresh-1")
        );
        assert_eq!(short(&account.access_token().unwrap()), "access-1");
        assert_eq!(account.user().unwrap().sub, "user-sub");
        assert_eq!(calls(&account), ["refresh refresh-0 device-0"]);
    }

    #[test]
    fn an_access_token_with_under_five_minutes_left_is_renewed_with_the_newest_refresh_token() {
        let (account, _) = account(
            Fake::answering([renewed("1", 299), renewed("2", 3600)]),
            MemoryKeychain::holding(stored()),
        );
        account.access_token().unwrap();
        assert_eq!(short(&account.access_token().unwrap()), "access-2");
        assert_eq!(
            calls(&account),
            ["refresh refresh-0 device-0", "refresh refresh-1 device-0"]
        );
    }

    #[test]
    fn callers_waiting_on_one_renewal_share_its_result() {
        let mut fake = Fake::answering([renewed("1", 3600)]);
        fake.refresh_delay = Duration::from_millis(100);
        let (account, _) = account(fake, MemoryKeychain::holding(stored()));
        let waiting = (0..4)
            .map(|_| {
                let account = Arc::clone(&account);
                thread::spawn(move || short(&account.access_token().unwrap()))
            })
            .collect::<Vec<_>>();
        for handle in waiting {
            assert_eq!(handle.join().unwrap(), "access-1");
        }
        assert_eq!(calls(&account).len(), 1);
    }

    #[test]
    fn a_rejected_token_forces_one_renewal_unless_another_caller_already_replaced_it() {
        let (account, _) = account(
            Fake::answering([renewed("1", 3600), renewed("2", 3600)]),
            MemoryKeychain::holding(stored()),
        );
        let first = account.access_token().unwrap();
        let second = account.renew_after_rejection(&first).unwrap();
        assert_eq!(short(&second), "access-2");
        assert_eq!(
            short(&account.renew_after_rejection(&first).unwrap()),
            "access-2"
        );
        assert_eq!(calls(&account).len(), 2);
    }

    #[test]
    fn a_session_ending_renewal_signs_out_and_clears_the_keychain() {
        let (account, changes) = account(
            Fake::answering([Answer::Tokens(Err(rejected("NotAuthorizedException")))]),
            MemoryKeychain::holding(stored()),
        );
        assert_eq!(account.access_token(), Err(AccountError::SignedOut));
        assert!(!account.is_signed_in());
        assert!(account.keychain.refresh_token().is_none());
        assert_eq!(*changes.lock().unwrap(), [false]);
        assert_eq!(account.access_token(), Err(AccountError::SignedOut));
        assert_eq!(calls(&account).len(), 1);
    }

    #[test]
    fn a_transient_renewal_failure_keeps_the_session_for_the_next_try() {
        let (account, changes) = account(
            Fake::answering([
                Answer::Tokens(Err(CognitoError::Network("offline".into()))),
                renewed("1", 3600),
            ]),
            MemoryKeychain::holding(stored()),
        );
        assert!(matches!(
            account.access_token(),
            Err(AccountError::Unavailable(_))
        ));
        assert!(account.is_signed_in());
        assert_eq!(
            account.keychain.refresh_token().as_deref(),
            Some("refresh-0")
        );
        assert_eq!(short(&account.access_token().unwrap()), "access-1");
        assert!(changes.lock().unwrap().is_empty());
    }

    #[test]
    fn signing_in_confirms_the_new_device_and_keeps_it_with_the_refresh_token() {
        let (account, changes) = account(
            Fake::answering([
                Answer::SignIn(Ok(SignIn::Done(tokens("1", 3600, true)))),
                Answer::Done(Ok(())),
            ]),
            MemoryKeychain::default(),
        );
        assert!(!account.is_signed_in());
        let step = account
            .sign_in("sebastian", Secret::new("correct password"))
            .unwrap();
        assert_eq!(
            step,
            SignInStep::SignedIn(User {
                sub: "user-sub".into(),
                username: "sebastian".into()
            })
        );
        assert_eq!(
            calls(&account),
            [
                "sign_in sebastian correct password",
                "confirm_device access-1 device-new"
            ]
        );
        let kept = account.keychain.load().unwrap().unwrap();
        assert_eq!(kept.refresh_token.expose(), "refresh-1");
        assert_eq!(kept.device_key.expose(), "device-new");
        assert_eq!(kept.device_group_key.expose(), "group-new");
        assert_eq!(short(&account.access_token().unwrap()), "access-1");
        assert_eq!(*changes.lock().unwrap(), [true]);
    }

    #[test]
    fn wrong_credentials_and_outages_read_differently_and_store_nothing() {
        let (account, _) = account(
            Fake::answering([
                Answer::SignIn(Err(rejected("NotAuthorizedException"))),
                Answer::SignIn(Err(rejected("UserNotFoundException"))),
                Answer::SignIn(Err(CognitoError::Network("offline".into()))),
            ]),
            MemoryKeychain::default(),
        );
        let attempt = || account.sign_in("sebastian", Secret::new("wrong"));
        assert_eq!(attempt(), Err(AccountError::InvalidCredentials));
        assert_eq!(attempt(), Err(AccountError::InvalidCredentials));
        assert!(matches!(attempt(), Err(AccountError::Unavailable(_))));
        assert!(account.keychain.load().unwrap().is_none());
    }

    #[test]
    fn a_temporary_password_waits_in_rust_until_a_valid_new_one_arrives() {
        let challenge = NewPasswordChallenge {
            username: "user-sub".into(),
            session: Secret::new("challenge"),
        };
        let (account, _) = account(
            Fake::answering([
                Answer::SignIn(Ok(SignIn::NewPasswordRequired(challenge))),
                Answer::Tokens(Err(rejected("InvalidPasswordException"))),
                Answer::Tokens(Ok(tokens("1", 3600, true))),
                Answer::Done(Ok(())),
            ]),
            MemoryKeychain::default(),
        );
        assert_eq!(
            account.sign_in("sebastian", Secret::new("temporary")),
            Ok(SignInStep::NewPasswordRequired)
        );
        assert!(!account.is_signed_in());
        assert_eq!(
            account.complete_new_password(Secret::new("short")),
            Err(AccountError::InvalidPassword)
        );
        assert_eq!(
            account
                .complete_new_password(Secret::new("Long enough 123"))
                .unwrap()
                .username,
            "sebastian"
        );
        assert!(account.is_signed_in());
        assert_eq!(
            calls(&account)[1..3],
            [
                "complete_new_password challenge short",
                "complete_new_password challenge Long enough 123"
            ]
        );
    }

    #[test]
    fn an_expired_or_missing_challenge_sends_the_user_back_to_sign_in() {
        let challenge = NewPasswordChallenge {
            username: "user-sub".into(),
            session: Secret::new("challenge"),
        };
        let (account, _) = account(
            Fake::answering([
                Answer::SignIn(Ok(SignIn::NewPasswordRequired(challenge))),
                Answer::Tokens(Err(rejected("NotAuthorizedException"))),
            ]),
            MemoryKeychain::default(),
        );
        account
            .sign_in("sebastian", Secret::new("temporary"))
            .unwrap();
        assert_eq!(
            account.complete_new_password(Secret::new("Long enough 123")),
            Err(AccountError::Expired)
        );
        assert_eq!(
            account.complete_new_password(Secret::new("Long enough 123")),
            Err(AccountError::Expired)
        );
        assert_eq!(calls(&account).len(), 2);
    }

    #[test]
    fn sign_out_renews_then_forgets_the_device_revokes_and_clears_the_keychain() {
        let (account, changes) = account(
            Fake::answering([
                renewed("1", 3600),
                Answer::Done(Ok(())),
                Answer::Done(Ok(())),
            ]),
            MemoryKeychain::holding(stored()),
        );
        account.sign_out();
        assert_eq!(
            calls(&account),
            [
                "refresh refresh-0 device-0",
                "forget_device access-1 device-0",
                "revoke_token refresh-1"
            ]
        );
        assert!(account.keychain.load().unwrap().is_none());
        assert!(!account.is_signed_in());
        assert_eq!(*changes.lock().unwrap(), [false]);
    }

    #[test]
    fn sign_out_clears_the_keychain_even_when_cognito_fails() {
        let network = || CognitoError::Network("offline".into());
        let (account, _) = account(
            Fake::answering([Answer::Tokens(Err(network())), Answer::Done(Err(network()))]),
            MemoryKeychain::holding(stored()),
        );
        account.sign_out();
        assert_eq!(
            calls(&account),
            ["refresh refresh-0 device-0", "revoke_token refresh-0"]
        );
        assert!(account.keychain.load().unwrap().is_none());
        assert_eq!(account.access_token(), Err(AccountError::SignedOut));
    }

    #[test]
    fn a_keychain_that_refuses_the_session_leaves_nothing_behind() {
        let keychain = MemoryKeychain::default();
        keychain.refuse_writes.store(true, Ordering::SeqCst);
        let (account, changes) = account(
            Fake::answering([
                Answer::SignIn(Ok(SignIn::Done(tokens("1", 3600, true)))),
                Answer::Done(Ok(())),
                Answer::Done(Ok(())),
                Answer::Done(Ok(())),
            ]),
            keychain,
        );
        assert!(matches!(
            account.sign_in("sebastian", Secret::new("correct password")),
            Err(AccountError::Unavailable(_))
        ));
        assert_eq!(
            calls(&account)[2..],
            [
                "forget_device access-1 device-new",
                "revoke_token refresh-1"
            ]
        );
        assert!(!account.is_signed_in());
        assert!(changes.lock().unwrap().is_empty());
    }
}
