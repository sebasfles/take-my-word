mod http;
mod stub;

use serde::{Deserialize, Serialize};

pub use http::HttpApi;
pub use stub::{Stub, StubMode};

pub const AUDIO_FIELD: &str = "audio";
pub const META_FIELD: &str = "meta";
pub const MAX_AUDIO_BYTES: usize = 4 * 1024 * 1024;
pub const MIN_AUDIO_SECONDS: f64 = 0.5;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[allow(dead_code, reason = "mirrors transcriberIds in packages/shared")]
pub enum TranscriberId {
    #[serde(rename = "groq-whisper")]
    GroqWhisper,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[allow(dead_code, reason = "mirrors refinerIds in packages/shared")]
pub enum RefinerId {
    #[serde(rename = "openai")]
    Openai,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
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
#[serde(rename_all = "lowercase")]
pub enum Skipped {
    Silence,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
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

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[allow(
    dead_code,
    reason = "mirrors dictationResponseSchema in packages/shared"
)]
pub struct LatencyMs {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quota: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcribe: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refine: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub save: Option<u64>,
    pub total: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
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
    pub providers: Providers,
    pub latency_ms: LatencyMs,
}

impl DictationResponse {
    pub fn has_text(&self) -> bool {
        self.skipped.is_none() && !self.text.trim().is_empty()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiErrorCode {
    BadRequest,
    PayloadTooLarge,
    UnsupportedMediaType,
    QuotaExceeded,
    ProviderFailed,
    Internal,
}

impl ApiErrorCode {
    pub fn status(self) -> u16 {
        match self {
            Self::BadRequest => 400,
            Self::PayloadTooLarge => 413,
            Self::UnsupportedMediaType => 415,
            Self::QuotaExceeded => 429,
            Self::ProviderFailed => 502,
            Self::Internal => 500,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiErrorDetail {
    pub code: ApiErrorCode,
    pub message: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiErrorBody {
    pub error: ApiErrorDetail,
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
