mod authed;
#[cfg(test)]
mod contract;
mod http;
#[cfg(debug_assertions)]
mod stub;

use serde::{Deserialize, Serialize};

pub use authed::AuthedApi;
pub use http::HttpApi;
#[cfg(debug_assertions)]
pub use stub::{Stub, StubMode, Stubbed};

pub const AUDIO_FIELD: &str = "audio";
pub const META_FIELD: &str = "meta";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[allow(dead_code, reason = "mirrors transcriberIds in packages/shared")]
pub enum TranscriberId {
    #[serde(rename = "groq-whisper")]
    GroqWhisper,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[allow(dead_code, reason = "mirrors refinerIds in packages/shared")]
pub enum RefinerId {
    #[serde(rename = "openai")]
    Openai,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub struct DictationMeta {
    pub locale: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stt_provider: Option<TranscriberId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refine_provider: Option<RefinerId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum Skipped {
    Silence,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[allow(
    dead_code,
    reason = "mirrors dictationResponseSchema in packages/shared"
)]
pub struct Providers {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcriber: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refiner: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[allow(
    dead_code,
    reason = "mirrors dictationResponseSchema in packages/shared"
)]
pub struct LatencyMs {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quota: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcribe: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refine: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub save: Option<u64>,
    pub total: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
#[allow(
    dead_code,
    reason = "mirrors dictationResponseSchema in packages/shared"
)]
pub struct DictationResponse {
    pub raw: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped: Option<Skipped>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_id: Option<String>,
    pub providers: Providers,
    pub latency_ms: LatencyMs,
}

impl DictationResponse {
    pub fn has_text(&self) -> bool {
        self.skipped.is_none() && !self.text.trim().is_empty()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum ApiErrorCode {
    BadRequest,
    Unauthorized,
    Forbidden,
    NotFound,
    Conflict,
    PayloadTooLarge,
    UnsupportedMediaType,
    QuotaExceeded,
    ProviderFailed,
    Internal,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
pub struct ApiErrorDetail {
    pub code: ApiErrorCode,
    pub message: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
pub struct ApiErrorBody {
    pub error: ApiErrorDetail,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[allow(dead_code, reason = "mirrors settingsSchema in packages/shared")]
pub struct SettingsProviders {
    pub transcriber: TranscriberId,
    pub refiner: RefinerId,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
#[allow(dead_code, reason = "mirrors settingsSchema in packages/shared")]
pub struct UserSettings {
    pub default_style_id: String,
    pub locale: String,
    pub providers: SettingsProviders,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[allow(dead_code, reason = "mirrors styleSchema in packages/shared")]
pub struct Style {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub builtin: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[allow(dead_code, reason = "mirrors styleListSchema in packages/shared")]
pub struct StyleList {
    pub styles: Vec<Style>,
}

#[derive(Debug, thiserror::Error)]
pub enum ApiFailure {
    #[error("the API could not be reached: {0}")]
    Network(String),
    #[error("the API answered {status} {code:?}")]
    Rejected {
        status: u16,
        code: Option<ApiErrorCode>,
    },
    #[error("the API answered something unexpected: {0}")]
    InvalidResponse(String),
    #[error("signed out")]
    SignedOut,
}

pub trait DictationApi {
    fn dictate(&self, wav: Vec<u8>, meta: &DictationMeta) -> Result<DictationResponse, ApiFailure>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn meta_serializes_like_the_shared_schema() {
        let meta = DictationMeta {
            locale: "es-CL".into(),
            app_id: Some("notepad.exe".into()),
            ..DictationMeta::default()
        };
        assert_eq!(
            serde_json::to_string(&meta).unwrap(),
            r#"{"locale":"es-CL","appId":"notepad.exe"}"#
        );
    }

    #[test]
    fn responses_from_the_api_parse_with_optional_fields_missing() {
        let response: DictationResponse = serde_json::from_str(
            r#"{"raw":"","text":"","skipped":"silence","providers":{},"latencyMs":{"total":12}}"#,
        )
        .unwrap();
        assert_eq!(response.skipped, Some(Skipped::Silence));
        assert!(!response.has_text());
        let error: ApiErrorBody = serde_json::from_str(
            r#"{"error":{"code":"quota_exceeded","message":"Daily quota reached."}}"#,
        )
        .unwrap();
        assert_eq!(error.error.code, ApiErrorCode::QuotaExceeded);
    }
}
