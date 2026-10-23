use std::io::Read;
use std::time::Duration;

use reqwest::StatusCode;
use reqwest::blocking::Client;
use reqwest::header::ACCEPT;
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DISCOVERY_PATH: &str = "/.well-known/take-my-word.json";
const DISCOVERY_VERSION: u64 = 1;
const TIMEOUT: Duration = Duration::from_secs(15);
const MAX_DOCUMENT: u64 = 16 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub version: u8,
    pub api_url: String,
    pub region: String,
    pub user_pool_id: String,
    pub client_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfHosted {
    pub domain: String,
    pub server: Server,
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum ServerError {
    #[error("{0:?} is not a domain")]
    InvalidDomain(String),
    #[error("the server could not be reached: {0}")]
    Unreachable(String),
    #[error("the server does not serve Take My Word: {0}")]
    NotTakeMyWord(String),
    #[error("the server speaks discovery version {0}, this app reads {DISCOVERY_VERSION}")]
    Version(u64),
}

fn not_take_my_word(reason: impl ToString) -> ServerError {
    ServerError::NotTakeMyWord(reason.to_string())
}

fn is_hostname(host: &str) -> bool {
    let labels: Vec<&str> = host.split('.').collect();
    let Some((top, inner)) = labels.split_last() else {
        return false;
    };
    host.len() <= 253
        && !inner.is_empty()
        && (2..=63).contains(&top.len())
        && top.bytes().all(|byte| byte.is_ascii_lowercase())
        && inner.iter().all(|label| {
            (1..=63).contains(&label.len())
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        })
}

fn is_region(region: &str) -> bool {
    let parts: Vec<&str> = region.split('-').collect();
    let [first, words @ .., number] = parts.as_slice() else {
        return false;
    };
    let lowercase = |part: &&str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_lowercase());
    first.len() == 2
        && lowercase(first)
        && !words.is_empty()
        && words.iter().all(lowercase)
        && (1..=2).contains(&number.len())
        && number.bytes().all(|byte| byte.is_ascii_digit())
}

fn region_of_user_pool(user_pool_id: &str) -> Option<&str> {
    let (region, suffix) = user_pool_id.split_once('_')?;
    let suffix_ok =
        (1..=55).contains(&suffix.len()) && suffix.bytes().all(|byte| byte.is_ascii_alphanumeric());
    (is_region(region) && suffix_ok).then_some(region)
}

fn is_client_id(client_id: &str) -> bool {
    (1..=128).contains(&client_id.len())
        && client_id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
}

impl Server {
    pub fn from_json(json: &[u8]) -> Result<Self, ServerError> {
        let value: Value = serde_json::from_slice(json).map_err(not_take_my_word)?;
        if let Some(version) = value.get("version").and_then(Value::as_u64)
            && version != DISCOVERY_VERSION
        {
            return Err(ServerError::Version(version));
        }
        let server: Self = serde_json::from_value(value).map_err(not_take_my_word)?;
        server.validate()
    }

    pub fn validate(self) -> Result<Self, ServerError> {
        if u64::from(self.version) != DISCOVERY_VERSION {
            return Err(ServerError::Version(self.version.into()));
        }
        if !self
            .api_url
            .strip_prefix("https://")
            .is_some_and(is_hostname)
        {
            return Err(not_take_my_word(
                "apiUrl is not https://<hostname> with no port, path or query",
            ));
        }
        if !is_region(&self.region) {
            return Err(not_take_my_word("region is not an AWS region"));
        }
        match region_of_user_pool(&self.user_pool_id) {
            None => return Err(not_take_my_word("userPoolId is not a user pool id")),
            Some(region) if region != self.region => {
                return Err(not_take_my_word("the user pool lives in another region"));
            }
            Some(_) => {}
        }
        if !is_client_id(&self.client_id) {
            return Err(not_take_my_word("clientId is not an app client id"));
        }
        Ok(self)
    }
}

impl SelfHosted {
    pub fn checked(self) -> Result<Self, ServerError> {
        if normalize_domain(&self.domain)? != self.domain {
            return Err(ServerError::InvalidDomain(self.domain));
        }
        Ok(Self {
            server: self.server.validate()?,
            domain: self.domain,
        })
    }
}

pub fn normalize_domain(input: &str) -> Result<String, ServerError> {
    let lowered = input.trim().to_ascii_lowercase();
    let host = lowered.strip_prefix("https://").unwrap_or(&lowered);
    let host = host.strip_suffix('/').unwrap_or(host);
    if is_hostname(host) {
        Ok(host.to_owned())
    } else {
        Err(ServerError::InvalidDomain(input.trim().to_owned()))
    }
}

pub fn discover(domain: &str) -> Result<Server, ServerError> {
    fetch(&format!("https://{domain}"))
}

fn fetch(origin: &str) -> Result<Server, ServerError> {
    let unreachable = |error: reqwest::Error| ServerError::Unreachable(error.to_string());
    let client = Client::builder()
        .timeout(TIMEOUT)
        .redirect(Policy::none())
        .build()
        .map_err(unreachable)?;
    let response = client
        .get(format!("{origin}{DISCOVERY_PATH}"))
        .header(ACCEPT, "application/json")
        .send()
        .map_err(unreachable)?;
    if response.status() != StatusCode::OK {
        return Err(not_take_my_word(format!(
            "{DISCOVERY_PATH} answered {}",
            response.status()
        )));
    }
    let mut body = Vec::new();
    response
        .take(MAX_DOCUMENT + 1)
        .read_to_end(&mut body)
        .map_err(|error| ServerError::Unreachable(error.to_string()))?;
    if body.len() as u64 > MAX_DOCUMENT {
        return Err(not_take_my_word(format!(
            "{DISCOVERY_PATH} is over {MAX_DOCUMENT} bytes"
        )));
    }
    Server::from_json(&body)
}

#[cfg(test)]
mod tests {
    use std::net::TcpListener;

    use axum::Router;
    use axum::http::StatusCode as Status;
    use axum::response::IntoResponse;
    use axum::routing::get;
    use serde_json::json;

    use super::*;

    #[derive(Deserialize)]
    struct Vector {
        why: String,
        #[serde(default)]
        set: serde_json::Map<String, Value>,
        #[serde(default)]
        remove: Vec<String>,
    }

    #[derive(Deserialize)]
    struct Vectors {
        base: serde_json::Map<String, Value>,
        accepted: Vec<Vector>,
        refused: Vec<Vector>,
    }

    fn vectors() -> Vectors {
        serde_json::from_str(include_str!("discovery_vectors.json")).unwrap()
    }

    fn document(base: &serde_json::Map<String, Value>, vector: &Vector) -> Vec<u8> {
        let mut document = base.clone();
        document.extend(vector.set.clone());
        for key in &vector.remove {
            document.remove(key);
        }
        serde_json::to_vec(&document).unwrap()
    }

    #[test]
    fn rust_accepts_and_refuses_the_same_documents_as_discovery_schema() {
        let vectors = vectors();
        for vector in &vectors.accepted {
            let result = Server::from_json(&document(&vectors.base, vector));
            assert!(result.is_ok(), "{}: {result:?}", vector.why);
        }
        for vector in &vectors.refused {
            let result = Server::from_json(&document(&vectors.base, vector));
            assert!(result.is_err(), "{} was accepted", vector.why);
        }
    }

    #[test]
    fn a_newer_discovery_version_says_so() {
        let vectors = vectors();
        let mut newer = vectors.base.clone();
        newer.insert("version".into(), json!(2));
        assert_eq!(
            Server::from_json(&serde_json::to_vec(&newer).unwrap()),
            Err(ServerError::Version(2))
        );
    }

    fn self_hosted(domain: &str, region: &str) -> SelfHosted {
        let mut server: Server = serde_json::from_str(&base_document()).unwrap();
        server.region = region.into();
        SelfHosted {
            domain: domain.into(),
            server,
        }
    }

    #[test]
    fn a_stored_server_is_used_only_while_it_still_validates() {
        let kept = self_hosted("dictation.example.com", "eu-west-2");
        assert_eq!(kept.clone().checked(), Ok(kept));
        assert!(
            self_hosted("Dictation.example.com", "eu-west-2")
                .checked()
                .is_err()
        );
        assert!(
            self_hosted("dictation.example.com", "evil.example/eu-west-2")
                .checked()
                .is_err()
        );
    }

    #[test]
    fn a_typed_domain_is_trimmed_lowered_and_stripped_of_https_and_one_slash() {
        for (typed, domain) in [
            ("dictation.example.com", "dictation.example.com"),
            ("  Dictation.Example.COM  ", "dictation.example.com"),
            ("https://dictation.example.com/", "dictation.example.com"),
            ("HTTPS://dictation.example.com", "dictation.example.com"),
        ] {
            assert_eq!(normalize_domain(typed).as_deref(), Ok(domain), "{typed}");
        }
    }

    #[test]
    fn a_typed_domain_with_anything_but_a_host_is_refused() {
        for typed in [
            "",
            "localhost",
            "http://dictation.example.com",
            "dictation.example.com:8443",
            "dictation.example.com/.well-known/take-my-word.json",
            "dictation.example.com//",
            "user@dictation.example.com",
            "dictation.example.com?x=1",
            "dictation.example.com#x",
            "10.0.0.1",
            "dictation .example.com",
            "dicción.example.com",
        ] {
            assert!(
                matches!(normalize_domain(typed), Err(ServerError::InvalidDomain(_))),
                "{typed}"
            );
        }
    }

    fn serve(router: Router) -> String {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        tauri::async_runtime::spawn(async move {
            let listener = tokio::net::TcpListener::from_std(listener).unwrap();
            axum::serve(listener, router).await.unwrap();
        });
        format!("http://{address}")
    }

    fn base_document() -> String {
        Value::Object(vectors().base).to_string()
    }

    #[test]
    fn the_well_known_document_of_a_server_is_read_and_validated() {
        let body = base_document();
        let origin = serve(Router::new().route(DISCOVERY_PATH, get(move || async move { body })));
        let server = fetch(&origin).unwrap();
        assert_eq!(server.api_url, "https://api.dictation.example.com");
        assert_eq!(server.user_pool_id, "eu-west-2_AbC123xyZ");
    }

    #[test]
    fn a_missing_redirected_oversized_or_invalid_document_is_not_a_server() {
        let origin = serve(
            Router::new()
                .route(
                    "/missing/.well-known/take-my-word.json",
                    get(|| async { Status::NOT_FOUND }),
                )
                .route(
                    "/moved/.well-known/take-my-word.json",
                    get(|| async {
                        (
                            Status::FOUND,
                            [("location", "/.well-known/take-my-word.json")],
                        )
                            .into_response()
                    }),
                )
                .route(
                    "/large/.well-known/take-my-word.json",
                    get(|| async { " ".repeat(16 * 1024 + 1) + &base_document() }),
                )
                .route(
                    "/page/.well-known/take-my-word.json",
                    get(|| async { "<html>parked domain</html>" }),
                )
                .route(DISCOVERY_PATH, get(|| async { base_document() })),
        );
        for path in ["missing", "moved", "large", "page"] {
            let result = fetch(&format!("{origin}/{path}"));
            assert!(
                matches!(result, Err(ServerError::NotTakeMyWord(_))),
                "{path}: {result:?}"
            );
        }
    }

    #[test]
    fn a_server_that_does_not_answer_is_unreachable() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        drop(listener);
        assert!(matches!(fetch(&origin), Err(ServerError::Unreachable(_))));
    }
}
