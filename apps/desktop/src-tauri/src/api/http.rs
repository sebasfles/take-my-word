use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::blocking::multipart::{Form, Part};

use super::{
    AUDIO_FIELD, ApiErrorBody, ApiFailure, DictationApi, DictationMeta, DictationResponse,
    META_FIELD,
};

const TIMEOUT: Duration = Duration::from_secs(60);

pub struct HttpApi {
    base_url: String,
    client: Client,
}

impl HttpApi {
    pub fn new(base_url: impl Into<String>) -> Result<Self, ApiFailure> {
        let client = Client::builder()
            .timeout(TIMEOUT)
            .build()
            .map_err(|error| ApiFailure::Network(error.to_string()))?;
        Ok(Self {
            base_url: base_url.into(),
            client,
        })
    }
}

impl DictationApi for HttpApi {
    fn dictate(&self, wav: Vec<u8>, meta: &DictationMeta) -> Result<DictationResponse, ApiFailure> {
        let invalid =
            |error: &dyn std::fmt::Display| ApiFailure::InvalidResponse(error.to_string());
        let network = |error: reqwest::Error| ApiFailure::Network(error.to_string());
        let audio = Part::bytes(wav)
            .file_name("dictation.wav")
            .mime_str("audio/wav")
            .map_err(|error| invalid(&error))?;
        let meta = serde_json::to_string(meta).map_err(|error| invalid(&error))?;
        let form = Form::new().part(AUDIO_FIELD, audio).text(META_FIELD, meta);
        let response = self
            .client
            .post(format!("{}/dictations", self.base_url))
            .multipart(form)
            .send()
            .map_err(network)?;
        let status = response.status();
        let body = response.bytes().map_err(network)?;
        if status.is_success() {
            return serde_json::from_slice(&body).map_err(|error| invalid(&error));
        }
        Err(ApiFailure::Rejected {
            status: status.as_u16(),
            code: serde_json::from_slice::<ApiErrorBody>(&body)
                .ok()
                .map(|body| body.error.code),
        })
    }
}
