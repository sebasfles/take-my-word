use std::sync::Arc;

use super::routes::Route;
use super::{
    ApiFailure, AppRuleList, DictationApi, DictationMeta, DictationResponse, EarlierSegment,
    HttpApi, SegmentApi, SegmentMeta, SegmentResponse, StyleList, UserSettings,
};
use crate::auth::Secret;
use crate::auth::account::{Account, AccountError, IdentityProvider};
use crate::keychain::Keychain;

const STYLES: &str = "/styles";
const SETTINGS: &str = "/me/settings";
const APP_RULES: &str = "/app-rules";

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

    pub fn set_base_url(&self, base_url: &str) {
        self.http.set_base_url(base_url);
    }

    pub fn styles(&self) -> Result<StyleList, ApiFailure> {
        self.authorized(|token| self.http.get(token, STYLES))
    }

    pub fn settings(&self) -> Result<UserSettings, ApiFailure> {
        self.authorized(|token| self.http.get(token, SETTINGS))
    }

    pub fn app_rules(&self) -> Result<AppRuleList, ApiFailure> {
        self.authorized(|token| self.http.get(token, APP_RULES))
    }

    pub fn replace_settings(&self, settings: &UserSettings) -> Result<UserSettings, ApiFailure> {
        self.authorized(|token| self.http.put(token, SETTINGS, settings))
    }

    pub fn forward(&self, route: &Route) -> Result<serde_json::Value, ApiFailure> {
        let request = route.request()?;
        self.authorized(|token| self.http.forward(token, &request))
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
    fn dictate(
        &self,
        wav: Vec<u8>,
        meta: &DictationMeta,
        earlier: &[EarlierSegment],
    ) -> Result<DictationResponse, ApiFailure> {
        self.authorized(|token| self.http.dictate(Some(token), wav.clone(), meta, earlier))
    }
}

impl<C: Credentials> SegmentApi for AuthedApi<C> {
    fn segment(
        &self,
        wav: Vec<u8>,
        meta: &SegmentMeta,
        previous: &str,
    ) -> Result<SegmentResponse, ApiFailure> {
        self.authorized(|token| self.http.segment(Some(token), wav.clone(), meta, previous))
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::net::TcpListener;
    use std::rc::Rc;
    use std::sync::Mutex;

    use axum::extract::Path;
    use axum::http::{HeaderMap, StatusCode};
    use axum::routing::{delete, get, post};
    use axum::{Json, Router};
    use serde_json::{Value, json};

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

    impl Credentials for Rc<Tokens> {
        fn token(&self) -> Result<Secret, ApiFailure> {
            self.as_ref().token()
        }

        fn renew(&self, rejected: &Secret) -> Result<Secret, ApiFailure> {
            self.as_ref().renew(rejected)
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
        (serve(Router::new().route("/styles", get(answer))), seen)
    }

    fn serve(router: Router) -> HttpApi {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        tauri::async_runtime::spawn(async move {
            let listener = tokio::net::TcpListener::from_std(listener).unwrap();
            axum::serve(listener, router).await.unwrap();
        });
        HttpApi::new(format!("http://{address}")).unwrap()
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
    fn a_server_switch_reaches_every_clone_of_the_api() {
        let (old, old_seen) = gateway("token-0", false);
        let (new, new_seen) = gateway("token-0", false);
        let shell = AuthedApi::new(old, Rc::new(credentials("token-0")));
        let worker = shell.clone();
        shell.set_base_url(&new.base_url());
        assert_eq!(worker.styles().unwrap().styles, []);
        assert!(old_seen.lock().unwrap().is_empty());
        assert_eq!(*new_seen.lock().unwrap(), ["Bearer token-0"]);
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

    fn route(value: Value) -> Route {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn forwarded_routes_send_their_body_and_read_an_empty_answer_as_null() {
        let http = serve(
            Router::new()
                .route(
                    "/dictionary",
                    post(|headers: HeaderMap, Json(body): Json<Value>| async move {
                        assert_eq!(headers["authorization"], "Bearer token-0");
                        (StatusCode::CREATED, Json(json!({"echo": body})))
                    }),
                )
                .route(
                    "/dictionary/{id}",
                    delete(|Path(id): Path<String>| async move {
                        assert_eq!(id, "a b");
                        StatusCode::NO_CONTENT
                    }),
                ),
        );
        let api = AuthedApi::new(http, credentials("token-0"));
        let added = api.forward(&route(
            json!({"route": "addTerm", "body": {"term": "Kubernetes", "aliases": []}}),
        ));
        assert_eq!(
            added.unwrap(),
            json!({"echo": {"term": "Kubernetes", "aliases": []}})
        );
        let deleted = api.forward(&route(json!({"route": "deleteTerm", "id": "a b"})));
        assert_eq!(deleted.unwrap(), Value::Null);
    }

    #[test]
    fn a_final_adds_its_segments_part_only_when_segments_were_transcribed() {
        use axum::extract::Multipart;

        type Seen = Arc<Mutex<Vec<(String, Vec<String>)>>>;
        let seen: Seen = Arc::default();
        let record = |path: &'static str, seen: Seen| {
            move |mut multipart: Multipart| {
                let seen = Arc::clone(&seen);
                async move {
                    let mut parts = Vec::new();
                    while let Some(field) = multipart.next_field().await.unwrap() {
                        let name = field.name().unwrap().to_owned();
                        let text = if name == "audio" {
                            String::new()
                        } else {
                            field.text().await.unwrap()
                        };
                        parts.push(format!("{name}={text}"));
                    }
                    seen.lock().unwrap().push((path.to_owned(), parts));
                    if path == "/dictations" {
                        Json(
                            json!({"raw": "", "text": "", "providers": {}, "latencyMs": {"total": 1}}),
                        )
                    } else {
                        Json(json!({"raw": "uno", "providers": {}, "latencyMs": {"total": 1}}))
                    }
                }
            }
        };
        let http = serve(
            Router::new()
                .route(
                    "/dictations",
                    post(record("/dictations", Arc::clone(&seen))),
                )
                .route(
                    "/dictations/segments",
                    post(record("/dictations/segments", Arc::clone(&seen))),
                ),
        );
        let api = AuthedApi::new(http, credentials("token-0"));
        let meta = DictationMeta::default();
        api.dictate(b"RIFF".to_vec(), &meta, &[]).unwrap();
        let earlier = [crate::api::EarlierSegment {
            text: "uno".into(),
            receipt: "r".into(),
        }];
        api.dictate(b"RIFF".to_vec(), &meta, &earlier).unwrap();
        api.segment(b"RIFF".to_vec(), &SegmentMeta::default(), "")
            .unwrap();
        api.segment(b"RIFF".to_vec(), &SegmentMeta::default(), "uno")
            .unwrap();
        assert_eq!(
            *seen.lock().unwrap(),
            [
                (
                    "/dictations".to_owned(),
                    vec!["audio=".to_owned(), "meta={}".to_owned()]
                ),
                (
                    "/dictations".to_owned(),
                    vec![
                        "audio=".to_owned(),
                        "meta={}".to_owned(),
                        r#"segments=[{"text":"uno","receipt":"r"}]"#.to_owned()
                    ]
                ),
                (
                    "/dictations/segments".to_owned(),
                    vec!["audio=".to_owned(), "meta={}".to_owned()]
                ),
                (
                    "/dictations/segments".to_owned(),
                    vec![
                        "audio=".to_owned(),
                        "meta={}".to_owned(),
                        "previous=uno".to_owned()
                    ]
                ),
            ]
        );
    }

    #[test]
    fn forwarded_routes_renew_once_like_every_other_call() {
        let (http, seen) = gateway("token-1", false);
        let api = AuthedApi::new(http, credentials("stale"));
        let styles = api.forward(&route(json!({"route": "listStyles"})));
        assert_eq!(styles.unwrap(), json!({"styles": []}));
        assert_eq!(*seen.lock().unwrap(), ["Bearer stale", "Bearer token-1"]);
    }
}
