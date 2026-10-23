use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::{ApiErrorCode, ApiFailure};

pub type Body = Map<String, Value>;

#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(tag = "route", rename_all = "camelCase", deny_unknown_fields)]
pub enum Route {
    ListTerms {},
    AddTerm { body: Body },
    UpdateTerm { id: String, body: Body },
    DeleteTerm { id: String },
    ListStyles {},
    CreateStyle { body: Body },
    UpdateStyle { id: String, body: Body },
    DeleteStyle { id: String },
    ListAppRules {},
    CreateAppRule { body: Body },
    UpdateAppRule { id: String, body: Body },
    DeleteAppRule { id: String },
    GetSettings {},
    ReplaceSettings { body: Body },
    GetUsage {},
    ListDictations { cursor: Option<String> },
    DeleteDictation { id: String },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
    Put,
    Delete,
}

#[derive(Debug, PartialEq)]
pub struct Request<'a> {
    pub method: Method,
    pub path: String,
    pub body: Option<&'a Body>,
}

const DICTIONARY: &str = "/dictionary";
const STYLES: &str = "/styles";
const APP_RULES: &str = "/app-rules";
const SETTINGS: &str = "/me/settings";
const USAGE: &str = "/me/usage";
const DICTATIONS: &str = "/dictations";

impl Route {
    pub fn name(&self) -> &'static str {
        match self {
            Self::ListTerms {} => "listTerms",
            Self::AddTerm { .. } => "addTerm",
            Self::UpdateTerm { .. } => "updateTerm",
            Self::DeleteTerm { .. } => "deleteTerm",
            Self::ListStyles {} => "listStyles",
            Self::CreateStyle { .. } => "createStyle",
            Self::UpdateStyle { .. } => "updateStyle",
            Self::DeleteStyle { .. } => "deleteStyle",
            Self::ListAppRules {} => "listAppRules",
            Self::CreateAppRule { .. } => "createAppRule",
            Self::UpdateAppRule { .. } => "updateAppRule",
            Self::DeleteAppRule { .. } => "deleteAppRule",
            Self::GetSettings {} => "getSettings",
            Self::ReplaceSettings { .. } => "replaceSettings",
            Self::GetUsage {} => "getUsage",
            Self::ListDictations { .. } => "listDictations",
            Self::DeleteDictation { .. } => "deleteDictation",
        }
    }

    pub fn changes_app_rules(&self) -> bool {
        matches!(
            self,
            Self::CreateAppRule { .. } | Self::UpdateAppRule { .. } | Self::DeleteAppRule { .. }
        )
    }

    pub fn request(&self) -> Result<Request<'_>, ApiFailure> {
        use Method::{Delete, Get, Post, Put};
        let request = |method, path: String, body| Request { method, path, body };
        Ok(match self {
            Self::ListTerms {} => request(Get, DICTIONARY.into(), None),
            Self::AddTerm { body } => request(Post, DICTIONARY.into(), Some(body)),
            Self::UpdateTerm { id, body } => request(Put, item(DICTIONARY, id)?, Some(body)),
            Self::DeleteTerm { id } => request(Delete, item(DICTIONARY, id)?, None),
            Self::ListStyles {} => request(Get, STYLES.into(), None),
            Self::CreateStyle { body } => request(Post, STYLES.into(), Some(body)),
            Self::UpdateStyle { id, body } => request(Put, item(STYLES, id)?, Some(body)),
            Self::DeleteStyle { id } => request(Delete, item(STYLES, id)?, None),
            Self::ListAppRules {} => request(Get, APP_RULES.into(), None),
            Self::CreateAppRule { body } => request(Post, APP_RULES.into(), Some(body)),
            Self::UpdateAppRule { id, body } => request(Put, item(APP_RULES, id)?, Some(body)),
            Self::DeleteAppRule { id } => request(Delete, item(APP_RULES, id)?, None),
            Self::GetSettings {} => request(Get, SETTINGS.into(), None),
            Self::ReplaceSettings { body } => request(Put, SETTINGS.into(), Some(body)),
            Self::GetUsage {} => request(Get, USAGE.into(), None),
            Self::ListDictations { cursor } => {
                let path = match cursor {
                    Some(cursor) => format!("{DICTATIONS}?cursor={}", encode(cursor)),
                    None => DICTATIONS.into(),
                };
                request(Get, path, None)
            }
            Self::DeleteDictation { id } => request(Delete, item(DICTATIONS, id)?, None),
        })
    }
}

fn item(collection: &str, id: &str) -> Result<String, ApiFailure> {
    if id.is_empty() || id.chars().all(|c| c == '.') {
        return Err(ApiFailure::InvalidRequest);
    }
    Ok(format!("{collection}/{}", encode(id)))
}

fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'~' => {
                char::from(byte).to_string()
            }
            other => format!("%{other:02X}"),
        })
        .collect()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FailureKind {
    SignedOut,
    Network,
    Rejected,
    InvalidRequest,
    InvalidResponse,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct RouteFailure {
    pub kind: FailureKind,
    pub status: Option<u16>,
    pub code: Option<ApiErrorCode>,
}

impl From<&ApiFailure> for RouteFailure {
    fn from(failure: &ApiFailure) -> Self {
        let (kind, status, code) = match failure {
            ApiFailure::SignedOut => (FailureKind::SignedOut, None, None),
            ApiFailure::Network(_) => (FailureKind::Network, None, None),
            ApiFailure::Rejected { status, code } => (FailureKind::Rejected, Some(*status), *code),
            ApiFailure::InvalidRequest => (FailureKind::InvalidRequest, None, None),
            ApiFailure::InvalidResponse(_) => (FailureKind::InvalidResponse, None, None),
        };
        Self { kind, status, code }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn route(value: Value) -> Result<Route, serde_json::Error> {
        serde_json::from_value(value)
    }

    #[test]
    fn ids_are_one_encoded_path_segment() {
        let update =
            route(json!({"route": "updateTerm", "id": "../styles?x=1#y", "body": {}})).unwrap();
        assert_eq!(
            update.request().unwrap().path,
            "/dictionary/%2E%2E%2Fstyles%3Fx%3D1%23y"
        );
        let rule = route(json!({"route": "deleteAppRule", "id": "bm90ZXBhZC5leGU"})).unwrap();
        assert_eq!(rule.request().unwrap().path, "/app-rules/bm90ZXBhZC5leGU");
    }

    #[test]
    fn empty_or_dot_ids_never_reach_the_network() {
        for id in ["", ".", ".."] {
            let delete = route(json!({"route": "deleteStyle", "id": id})).unwrap();
            assert!(matches!(delete.request(), Err(ApiFailure::InvalidRequest)));
        }
    }

    #[test]
    fn only_named_routes_with_their_own_fields_are_accepted() {
        for refused in [
            json!({"route": "dictate"}),
            json!({"route": "listTerms", "path": "/dictations"}),
            json!({"route": "getSettings", "url": "https://example.com"}),
            json!({"route": "addTerm", "body": "not an object"}),
            json!({"route": "deleteTerm"}),
            json!({"path": "/styles"}),
        ] {
            assert!(route(refused.clone()).is_err(), "accepted {refused}");
        }
    }

    #[test]
    fn usage_is_a_plain_get_without_parameters() {
        let usage = route(json!({"route": "getUsage"})).unwrap();
        let request = usage.request().unwrap();
        assert_eq!(request.method, Method::Get);
        assert_eq!(request.path, "/me/usage");
        assert!(request.body.is_none());
        assert!(route(json!({"route": "getUsage", "day": "2026-10-23"})).is_err());
    }

    #[test]
    fn history_pages_send_the_cursor_encoded_in_the_query() {
        let page = route(json!({"route": "listDictations", "cursor": "a/b&limit=1"})).unwrap();
        let request = page.request().unwrap();
        assert_eq!(request.method, Method::Get);
        assert_eq!(request.path, "/dictations?cursor=a%2Fb%26limit%3D1");
        let first = route(json!({"route": "listDictations"})).unwrap();
        assert_eq!(first.request().unwrap().path, "/dictations");
    }

    #[test]
    fn failures_carry_kind_status_and_code_without_text() {
        let failure = RouteFailure::from(&ApiFailure::Rejected {
            status: 409,
            code: Some(ApiErrorCode::Conflict),
        });
        assert_eq!(
            serde_json::to_value(&failure).unwrap(),
            json!({"kind": "rejected", "status": 409, "code": "conflict"})
        );
        assert_eq!(
            serde_json::to_value(RouteFailure::from(&ApiFailure::Network(
                "dns error for api.dev".into()
            )))
            .unwrap(),
            json!({"kind": "network", "status": null, "code": null})
        );
    }
}
