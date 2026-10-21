use std::sync::Arc;

use super::{
    ApiFailure, DictationApi, DictationMeta, DictationResponse, HttpApi, StyleList, UserSettings,
};
use crate::auth::Secret;
use crate::auth::account::{Account, AccountError, IdentityProvider};
use crate::keychain::Keychain;

const STYLES: &str = "/styles";
const SETTINGS: &str = "/me/settings";

pub trait Credentials {
    fn token(&self) -> Result<Secret, ApiFailure>;
    fn renew(&self, rejected: &Secret) -> Result<Secret, ApiFailure>;
}

fn api_failure(error: AccountError) -> ApiFailure {
    match error {
        AccountError::SignedOut => ApiFailure::SignedOut,
        other => ApiFailure::Network(other.to_string()),
    }
}

impl<I: IdentityProvider, K: Keychain> Credentials for Arc<Account<I, K>> {
    fn token(&self) -> Result<Secret, ApiFailure> {
        self.access_token().map_err(api_failure)
    }

    fn renew(&self, rejected: &Secret) -> Result<Secret, ApiFailure> {
        self.renew_after_rejection(rejected).map_err(api_failure)
    }
}

#[derive(Clone)]
pub struct AuthedApi<C> {
    http: HttpApi,
    credentials: C,
}

impl<C: Credentials> AuthedApi<C> {
    pub fn new(http: HttpApi, credentials: C) -> Self {
        Self { http, credentials }
    }

    pub fn styles(&self) -> Result<StyleList, ApiFailure> {
        self.authorized(|token| self.http.get(token, STYLES))
    }

    pub fn settings(&self) -> Result<UserSettings, ApiFailure> {
        self.authorized(|token| self.http.get(token, SETTINGS))
    }

    pub fn replace_settings(&self, settings: &UserSettings) -> Result<UserSettings, ApiFailure> {
        self.authorized(|token| self.http.put(token, SETTINGS, settings))
    }

    fn authorized<T>(
        &self,
        call: impl Fn(&Secret) -> Result<T, ApiFailure>,
    ) -> Result<T, ApiFailure> {
        let token = self.credentials.token()?;
        match call(&token) {
            Err(ApiFailure::Rejected {
                status: 401 | 403,
                code: None,
            }) => {
                log::info!("the gateway refused the access token; renewing once");
                call(&self.credentials.renew(&token)?)
            }
            outcome => outcome,
        }
    }
}

impl<C: Credentials> DictationApi for AuthedApi<C> {
    fn dictate(&self, wav: Vec<u8>, meta: &DictationMeta) -> Result<DictationResponse, ApiFailure> {
        self.authorized(|token| self.http.dictate(Some(token), wav.clone(), meta))
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::net::TcpListener;
    use std::sync::Mutex;

    use axum::Router;
    use axum::http::{HeaderMap, StatusCode};
    use axum::routing::get;

    use super::*;
    use crate::api::ApiErrorCode;

    #[derive(Default)]
    struct Tokens {
        current: RefCell<String>,
        renewals: RefCell<u32>,
        signed_out: bool,
    }

    impl Credentials for Tokens {
        fn token(&self) -> Result<Secret, ApiFailure> {
            if self.signed_out {
                return Err(ApiFailure::SignedOut);
            }
            Ok(Secret::new(self.current.borrow().clone()))
        }

        fn renew(&self, rejected: &Secret) -> Result<Secret, ApiFailure> {
            assert_eq!(rejected.expose(), *self.current.borrow());
            *self.renewals.borrow_mut() += 1;
            *self.current.borrow_mut() = format!("token-{}", self.renewals.borrow());
            self.token()
        }
    }

    fn gateway(accepted: &'static str, enveloped_401: bool) -> (HttpApi, Arc<Mutex<Vec<String>>>) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let recorded = Arc::clone(&seen);
        let answer = move |headers: HeaderMap| {
            let recorded = Arc::clone(&recorded);
            async move {
                let authorization = headers
                    .get("authorization")
                    .map(|value| value.to_str().unwrap().to_owned())
                    .unwrap_or_default();
                recorded.lock().unwrap().push(authorization.clone());
                if authorization == format!("Bearer {accepted}") {
                    return (StatusCode::OK, r#"{"styles":[]}"#.to_owned());
                }
                if enveloped_401 {
                    return (
                        StatusCode::UNAUTHORIZED,
                        r#"{"error":{"code":"unauthorized","message":"No user."}}"#.to_owned(),
                    );
                }
                (
                    StatusCode::FORBIDDEN,
                    r#"{"message":"Forbidden"}"#.to_owned(),
                )
            }
        };
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        let router = Router::new().route("/styles", get(answer));
        tauri::async_runtime::spawn(async move {
            let listener = tokio::net::TcpListener::from_std(listener).unwrap();
            axum::serve(listener, router).await.unwrap();
        });
        (HttpApi::new(format!("http://{address}")).unwrap(), seen)
    }

    fn credentials(current: &str) -> Tokens {
        Tokens {
            current: RefCell::new(current.into()),
            ..Tokens::default()
        }
    }

    #[test]
    fn a_gateway_refusal_without_the_error_envelope_renews_once_and_retries() {
        let (http, seen) = gateway("token-1", false);
        let api = AuthedApi::new(http, credentials("stale"));
        assert_eq!(api.styles().unwrap().styles, []);
        assert_eq!(*seen.lock().unwrap(), ["Bearer stale", "Bearer token-1"]);
        assert_eq!(*api.credentials.renewals.borrow(), 1);
    }

    #[test]
    fn a_second_refusal_is_reported_instead_of_renewing_again() {
        let (http, seen) = gateway("never", false);
        let api = AuthedApi::new(http, credentials("stale"));
        assert!(matches!(
            api.styles(),
            Err(ApiFailure::Rejected {
                status: 403,
                code: None
            })
        ));
        assert_eq!(seen.lock().unwrap().len(), 2);
    }

    #[test]
    fn an_api_error_with_the_envelope_is_not_a_token_problem() {
        let (http, seen) = gateway("never", true);
        let api = AuthedApi::new(http, credentials("token-0"));
        assert!(matches!(
            api.styles(),
            Err(ApiFailure::Rejected {
                status: 401,
                code: Some(ApiErrorCode::Unauthorized)
            })
        ));
        assert_eq!(seen.lock().unwrap().len(), 1);
        assert_eq!(*api.credentials.renewals.borrow(), 0);
    }

    #[test]
    fn signed_out_calls_never_reach_the_network() {
        let (http, seen) = gateway("token-0", false);
        let api = AuthedApi::new(
            http,
            Tokens {
                signed_out: true,
                ..credentials("token-0")
            },
        );
        assert!(matches!(api.settings(), Err(ApiFailure::SignedOut)));
        assert!(seen.lock().unwrap().is_empty());
    }
}
