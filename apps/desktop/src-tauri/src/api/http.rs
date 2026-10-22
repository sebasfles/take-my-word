use std::time::Duration;

use reqwest::blocking::multipart::{Form, Part};
use reqwest::blocking::{Client, RequestBuilder};
use serde::Serialize;
use serde::de::DeserializeOwned;

use super::routes::{Method, Request};
use super::{AUDIO_FIELD, ApiErrorBody, ApiFailure, DictationMeta, DictationResponse, META_FIELD};
use crate::auth::Secret;

const DICTATION_TIMEOUT: Duration = Duration::from_secs(60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone)]
pub struct HttpApi {
    base_url: String,
    client: Client,
}

fn invalid(error: impl std::fmt::Display) -> ApiFailure {
    ApiFailure::InvalidResponse(error.to_string())
}

fn network(error: reqwest::Error) -> ApiFailure {
    ApiFailure::Network(error.without_url().to_string())
}

impl HttpApi {
    pub fn new(base_url: impl Into<String>) -> Result<Self, ApiFailure> {
        let client = Client::builder().build().map_err(network)?;
        Ok(Self {
            base_url: base_url.into(),
            client,
        })
    }

    pub fn dictate(
        &self,
        token: Option<&Secret>,
        wav: Vec<u8>,
        meta: &DictationMeta,
    ) -> Result<DictationResponse, ApiFailure> {
        let audio = Part::bytes(wav)
            .file_name("dictation.wav")
            .mime_str("audio/wav")
            .map_err(invalid)?;
        let meta = serde_json::to_string(meta).map_err(invalid)?;
        let form = Form::new().part(AUDIO_FIELD, audio).text(META_FIELD, meta);
        let request = self
            .client
            .post(self.url("/dictations"))
            .timeout(DICTATION_TIMEOUT)
            .multipart(form);
        send(request, token)
    }

    pub fn get<T: DeserializeOwned>(&self, token: &Secret, path: &str) -> Result<T, ApiFailure> {
        let request = self.client.get(self.url(path)).timeout(REQUEST_TIMEOUT);
        send(request, Some(token))
    }

    pub fn put<B: Serialize, T: DeserializeOwned>(
        &self,
        token: &Secret,
        path: &str,
        body: &B,
    ) -> Result<T, ApiFailure> {
        let request = self
            .client
            .put(self.url(path))
            .timeout(REQUEST_TIMEOUT)
            .json(body);
        send(request, Some(token))
    }

    pub fn forward(
        &self,
        token: &Secret,
        request: &Request<'_>,
    ) -> Result<serde_json::Value, ApiFailure> {
        let url = self.url(&request.path);
        let builder = match request.method {
            Method::Get => self.client.get(url),
            Method::Post => self.client.post(url),
            Method::Put => self.client.put(url),
            Method::Delete => self.client.delete(url),
        }
        .timeout(REQUEST_TIMEOUT);
        let builder = match request.body {
            Some(body) => builder.json(body),
            None => builder,
        };
        let body = send_bytes(builder, Some(token))?;
        if body.is_empty() {
            return Ok(serde_json::Value::Null);
        }
        serde_json::from_slice(&body).map_err(invalid)
    }

    fn url(&self, path: &str) -> String {
        format!("{}{path}", self.base_url)
    }
}

fn send<T: DeserializeOwned>(
    request: RequestBuilder,
    token: Option<&Secret>,
) -> Result<T, ApiFailure> {
    serde_json::from_slice(&send_bytes(request, token)?).map_err(invalid)
}

fn send_bytes(request: RequestBuilder, token: Option<&Secret>) -> Result<Vec<u8>, ApiFailure> {
    let request = match token {
        Some(token) => request.bearer_auth(token.expose()),
        None => request,
    };
    let response = request.send().map_err(network)?;
    let status = response.status();
    let body = response.bytes().map_err(network)?;
    if status.is_success() {
        return Ok(body.to_vec());
    }
    Err(ApiFailure::Rejected {
        status: status.as_u16(),
        code: serde_json::from_slice::<ApiErrorBody>(&body)
            .ok()
            .map(|body| body.error.code),
    })
}
