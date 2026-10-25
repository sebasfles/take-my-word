use std::io::Cursor;
use std::net::{SocketAddr, TcpListener};
use std::sync::Arc;
use std::sync::atomic::{AtomicU8, Ordering};
use std::time::Duration;

use axum::Router;
use axum::body::{Body, Bytes};
use axum::extract::multipart::{Multipart, MultipartRejection};
use axum::extract::{DefaultBodyLimit, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::post;

use super::{
    AUDIO_FIELD, ApiErrorBody, ApiErrorCode, ApiErrorDetail, ApiFailure, DictationApi,
    DictationMeta, DictationResponse, EarlierSegment, HttpApi, LatencyMs, META_FIELD, Providers,
    SEGMENTS_FIELD, SEGMENTS_PATH, SegmentApi, SegmentLatencyMs, SegmentMeta, SegmentResponse,
    Skipped,
};
use crate::locale::Language;

const MAX_AUDIO_BYTES: usize = 4 * 1024 * 1024;
const MIN_AUDIO_SECONDS: f64 = 0.5;

const WAV_MEDIA_TYPES: [&str; 4] = ["audio/wav", "audio/wave", "audio/x-wav", "audio/vnd.wave"];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StubMode {
    Off,
    Normal,
    TwoLines,
    Silence,
    QuotaExceeded,
    NetworkError,
}

impl StubMode {
    pub const ALL: [Self; 6] = [
        Self::Off,
        Self::Normal,
        Self::TwoLines,
        Self::Silence,
        Self::QuotaExceeded,
        Self::NetworkError,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::Off => "Off, real API",
            Self::Normal => "Normal",
            Self::TwoLines => "Two lines",
            Self::Silence => "Silence (empty text)",
            Self::QuotaExceeded => "Quota exceeded (429)",
            Self::NetworkError => "Network error",
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::Off => "stub-off",
            Self::Normal => "stub-normal",
            Self::TwoLines => "stub-two-lines",
            Self::Silence => "stub-silence",
            Self::QuotaExceeded => "stub-quota",
            Self::NetworkError => "stub-network",
        }
    }

    fn from_index(index: u8) -> Self {
        Self::ALL
            .get(usize::from(index))
            .copied()
            .unwrap_or(Self::Off)
    }

    fn index(self) -> u8 {
        Self::ALL
            .iter()
            .position(|mode| *mode == self)
            .unwrap_or_default() as u8
    }
}

#[derive(Clone)]
struct Shared {
    mode: Arc<AtomicU8>,
    delay: Duration,
}

#[derive(Clone)]
pub struct Stub {
    mode: Arc<AtomicU8>,
    address: SocketAddr,
}

impl Stub {
    pub fn start(delay: Duration) -> std::io::Result<Self> {
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        listener.set_nonblocking(true)?;
        let address = listener.local_addr()?;
        let mode = Arc::new(AtomicU8::new(StubMode::Off.index()));
        let shared = Shared {
            mode: Arc::clone(&mode),
            delay,
        };
        let router = Router::new()
            .route("/dictations", post(dictations))
            .route(SEGMENTS_PATH, post(segments))
            .layer(DefaultBodyLimit::max(MAX_AUDIO_BYTES + 1024 * 1024))
            .with_state(shared);
        tauri::async_runtime::spawn(async move {
            let served = match tokio::net::TcpListener::from_std(listener) {
                Ok(listener) => axum::serve(listener, router).await,
                Err(error) => Err(error),
            };
            if let Err(error) = served {
                log::error!("the API stub stopped: {error}");
            }
        });
        Ok(Self { mode, address })
    }

    pub fn base_url(&self) -> String {
        format!("http://{}", self.address)
    }

    pub fn mode(&self) -> StubMode {
        StubMode::from_index(self.mode.load(Ordering::SeqCst))
    }

    pub fn set_mode(&self, mode: StubMode) {
        self.mode.store(mode.index(), Ordering::SeqCst);
    }
}

pub struct Stubbed<A> {
    stub: Stub,
    stub_api: HttpApi,
    real: A,
}

impl<A> Stubbed<A> {
    pub fn new(stub: Stub, real: A) -> Result<Self, ApiFailure> {
        let stub_api = HttpApi::new(stub.base_url())?;
        Ok(Self {
            stub,
            stub_api,
            real,
        })
    }
}

impl<A: DictationApi> DictationApi for Stubbed<A> {
    fn dictate(
        &self,
        wav: Vec<u8>,
        meta: &DictationMeta,
        earlier: &[EarlierSegment],
    ) -> Result<DictationResponse, ApiFailure> {
        match self.stub.mode() {
            StubMode::Off => self.real.dictate(wav, meta, earlier),
            _ => self.stub_api.dictate(None, wav, meta, earlier),
        }
    }
}

impl<A: SegmentApi> SegmentApi for Stubbed<A> {
    fn segment(
        &self,
        wav: Vec<u8>,
        meta: &SegmentMeta,
        previous: &str,
    ) -> Result<SegmentResponse, ApiFailure> {
        match self.stub.mode() {
            StubMode::Off => self.real.segment(wav, meta, previous),
            _ => self.stub_api.segment(None, wav, meta, previous),
        }
    }
}

#[derive(Debug, Default)]
struct Upload {
    audio: Option<(String, Bytes)>,
    meta: Option<String>,
    segments: Option<String>,
}

type Rejection = (ApiErrorCode, &'static str);

async fn dictations(
    State(shared): State<Shared>,
    multipart: Result<Multipart, MultipartRejection>,
) -> Response {
    let mode = StubMode::from_index(shared.mode.load(Ordering::SeqCst));
    tokio::time::sleep(shared.delay).await;
    let upload = match multipart {
        Ok(multipart) => read(multipart).await,
        Err(_) => Err((
            ApiErrorCode::UnsupportedMediaType,
            "Send multipart/form-data with audio and meta parts.",
        )),
    };
    let (meta, earlier) = match upload.and_then(|upload| {
        let earlier = earlier_of(&upload)?;
        Ok((validate(&upload)?, earlier))
    }) {
        Ok(read) => read,
        Err((code, message)) => return api_error(code, message),
    };
    match mode {
        StubMode::Off | StubMode::Normal => {
            let mut answer = canned(meta.locale.as_deref().unwrap_or("es"), shared.delay);
            if !earlier.is_empty() {
                answer.text = format!("{} ({} segments)", answer.text, earlier.len());
            }
            axum::Json(answer).into_response()
        }
        StubMode::TwoLines => axum::Json(two_lines(
            meta.locale.as_deref().unwrap_or("es"),
            shared.delay,
        ))
        .into_response(),
        StubMode::Silence => axum::Json(silence(shared.delay)).into_response(),
        StubMode::QuotaExceeded => api_error(
            ApiErrorCode::QuotaExceeded,
            "The daily dictation quota is used up.",
        ),
        StubMode::NetworkError => dropped_connection(),
    }
}

async fn segments(
    State(shared): State<Shared>,
    multipart: Result<Multipart, MultipartRejection>,
) -> Response {
    let mode = StubMode::from_index(shared.mode.load(Ordering::SeqCst));
    tokio::time::sleep(shared.delay).await;
    let upload = match multipart {
        Ok(multipart) => read(multipart).await,
        Err(_) => Err((
            ApiErrorCode::UnsupportedMediaType,
            "Send multipart/form-data.",
        )),
    };
    if let Err((code, message)) = upload.and_then(|upload| validate_audio(&upload)) {
        return api_error(code, message);
    }
    match mode {
        StubMode::Off | StubMode::Normal | StubMode::TwoLines => axum::Json(SegmentResponse {
            raw: "segmento de prueba".into(),
            language: Some(Language::Es),
            receipt: Some("stub".into()),
            latency_ms: SegmentLatencyMs {
                total: shared.delay.as_millis() as u64,
                ..SegmentLatencyMs::default()
            },
            ..SegmentResponse::default()
        })
        .into_response(),
        StubMode::Silence => axum::Json(SegmentResponse {
            skipped: Some(Skipped::Silence),
            ..SegmentResponse::default()
        })
        .into_response(),
        StubMode::QuotaExceeded => api_error(
            ApiErrorCode::QuotaExceeded,
            "The daily dictation quota is used up.",
        ),
        StubMode::NetworkError => dropped_connection(),
    }
}

fn earlier_of(upload: &Upload) -> Result<Vec<EarlierSegment>, Rejection> {
    upload
        .segments
        .as_deref()
        .map_or(Ok(Vec::new()), |segments| {
            serde_json::from_str(segments)
                .map_err(|_| (ApiErrorCode::BadRequest, "The segments part is not valid."))
        })
}

async fn read(mut multipart: Multipart) -> Result<Upload, Rejection> {
    const MALFORMED: Rejection = (ApiErrorCode::BadRequest, "Malformed multipart body.");
    let mut upload = Upload::default();
    while let Some(field) = multipart.next_field().await.map_err(|_| MALFORMED)? {
        match field.name() {
            Some(AUDIO_FIELD) => {
                let content_type = field.content_type().unwrap_or_default().to_owned();
                let bytes = field.bytes().await.map_err(|_| MALFORMED)?;
                upload.audio = Some((content_type, bytes));
            }
            Some(META_FIELD) => upload.meta = Some(field.text().await.map_err(|_| MALFORMED)?),
            Some(SEGMENTS_FIELD) => {
                upload.segments = Some(field.text().await.map_err(|_| MALFORMED)?);
            }
            _ => {}
        }
    }
    Ok(upload)
}

fn validate(upload: &Upload) -> Result<DictationMeta, Rejection> {
    validate_audio(upload)?;
    let Some(meta) = &upload.meta else {
        return Err((ApiErrorCode::BadRequest, "The meta part is missing."));
    };
    let meta: DictationMeta = serde_json::from_str(meta)
        .map_err(|_| (ApiErrorCode::BadRequest, "The meta part is not valid JSON."))?;
    if meta
        .locale
        .as_deref()
        .is_some_and(|locale| !valid_locale(locale))
    {
        return Err((
            ApiErrorCode::BadRequest,
            "Invalid locale: expected es or en, optionally with a region.",
        ));
    }
    Ok(meta)
}

fn validate_audio(upload: &Upload) -> Result<(), Rejection> {
    let Some((content_type, bytes)) = &upload.audio else {
        return Err((ApiErrorCode::BadRequest, "The audio part is missing."));
    };
    let media_type = content_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if !WAV_MEDIA_TYPES.contains(&media_type.as_str()) {
        return Err((
            ApiErrorCode::UnsupportedMediaType,
            "The desktop app sends WAV (audio/wav).",
        ));
    }
    if bytes.len() > MAX_AUDIO_BYTES {
        return Err((ApiErrorCode::PayloadTooLarge, "The audio is over 4 MB."));
    }
    let reader = hound::WavReader::new(Cursor::new(bytes.as_ref()))
        .map_err(|_| (ApiErrorCode::BadRequest, "The audio is not a WAV file."))?;
    let spec = reader.spec();
    if spec.sample_rate != 16_000
        || spec.channels != 1
        || spec.bits_per_sample != 16
        || spec.sample_format != hound::SampleFormat::Int
    {
        return Err((
            ApiErrorCode::BadRequest,
            "The audio must be 16 kHz mono 16-bit WAV.",
        ));
    }
    if f64::from(reader.duration()) / f64::from(spec.sample_rate) < MIN_AUDIO_SECONDS {
        return Err((
            ApiErrorCode::BadRequest,
            "The audio is shorter than half a second.",
        ));
    }
    Ok(())
}

fn valid_locale(locale: &str) -> bool {
    let (language, region) = match locale.split_once('-') {
        Some((language, region)) => (language, Some(region)),
        None => (locale, None),
    };
    (language == "es" || language == "en")
        && region.is_none_or(|region| {
            region.len() == 2 && region.chars().all(|c| c.is_ascii_uppercase())
        })
}

fn canned(locale: &str, delay: Duration) -> DictationResponse {
    let text = if locale.starts_with("en") {
        "Hello, this is a Take My Word test dictation."
    } else {
        "Hola, este es un dictado de prueba de Take My Word."
    };
    response(text, delay)
}

fn two_lines(locale: &str, delay: Duration) -> DictationResponse {
    let text = if locale.starts_with("en") {
        "First line of a Take My Word test.\nSecond line of the same dictation."
    } else {
        "Primera línea de una prueba de Take My Word.\nSegunda línea del mismo dictado."
    };
    response(text, delay)
}

fn response(text: &str, delay: Duration) -> DictationResponse {
    DictationResponse {
        raw: text.to_lowercase().replace([',', '.'], ""),
        text: text.into(),
        providers: Providers {
            transcriber: Some("stub".into()),
            refiner: Some("stub".into()),
        },
        latency_ms: latency(delay),
        ..DictationResponse::default()
    }
}

fn silence(delay: Duration) -> DictationResponse {
    DictationResponse {
        raw: String::new(),
        text: String::new(),
        skipped: Some(Skipped::Silence),
        providers: Providers {
            transcriber: Some("stub".into()),
            refiner: None,
        },
        latency_ms: latency(delay),
        ..DictationResponse::default()
    }
}

fn latency(delay: Duration) -> LatencyMs {
    LatencyMs {
        total: delay.as_millis() as u64,
        ..LatencyMs::default()
    }
}

fn status(code: ApiErrorCode) -> u16 {
    match code {
        ApiErrorCode::BadRequest => 400,
        ApiErrorCode::Unauthorized => 401,
        ApiErrorCode::Forbidden => 403,
        ApiErrorCode::NotFound => 404,
        ApiErrorCode::Conflict => 409,
        ApiErrorCode::PayloadTooLarge => 413,
        ApiErrorCode::UnsupportedMediaType => 415,
        ApiErrorCode::QuotaExceeded => 429,
        ApiErrorCode::ProviderFailed => 502,
        ApiErrorCode::Internal => 500,
    }
}

fn api_error(code: ApiErrorCode, message: &str) -> Response {
    let status = StatusCode::from_u16(status(code)).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let body = ApiErrorBody {
        error: ApiErrorDetail {
            code,
            message: message.into(),
        },
    };
    (status, axum::Json(body)).into_response()
}

fn dropped_connection() -> Response {
    let broken = futures_util::stream::once(async {
        Err::<Bytes, std::io::Error>(std::io::Error::other("the stub dropped the connection"))
    });
    Response::new(Body::from_stream(broken))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::{Captured, encode_wav};

    fn wav(seconds: f32) -> Vec<u8> {
        let captured = Captured {
            samples: vec![0.1; (seconds * 16_000.0) as usize],
            channels: 1,
            sample_rate: 16_000,
        };
        encode_wav(&captured).unwrap()
    }

    fn upload(content_type: &str, audio: Vec<u8>, meta: &str) -> Upload {
        Upload {
            audio: Some((content_type.into(), Bytes::from(audio))),
            meta: Some(meta.into()),
            segments: None,
        }
    }

    fn meta(locale: &str) -> DictationMeta {
        DictationMeta {
            locale: Some(locale.into()),
            app_id: Some("notepad.exe".into()),
            ..DictationMeta::default()
        }
    }

    #[test]
    fn the_stub_accepts_what_the_desktop_sends() {
        let accepted = validate(&upload(
            "audio/wav",
            wav(1.0),
            r#"{"locale":"es-CL","appId":"notepad.exe"}"#,
        ))
        .unwrap();
        assert_eq!(accepted, meta("es-CL"));
        let without_locale = validate(&upload("audio/wav", wav(1.0), r#"{"appId":"notepad.exe"}"#));
        assert_eq!(without_locale.map(|meta| meta.locale), Ok(None));
    }

    #[test]
    fn the_stub_rejects_what_the_api_rejects() {
        let cases = [
            (
                upload("audio/mpeg", wav(1.0), r#"{"locale":"es"}"#),
                ApiErrorCode::UnsupportedMediaType,
            ),
            (
                upload("audio/wav", vec![0; 64], r#"{"locale":"es"}"#),
                ApiErrorCode::BadRequest,
            ),
            (
                upload("audio/wav", wav(0.3), r#"{"locale":"es"}"#),
                ApiErrorCode::BadRequest,
            ),
            (
                upload("audio/wav", wav(1.0), r#"{"locale":"fr-FR"}"#),
                ApiErrorCode::BadRequest,
            ),
            (
                upload("audio/wav", wav(1.0), r#"{"locale":"es-cl"}"#),
                ApiErrorCode::BadRequest,
            ),
            (
                upload("audio/wav", wav(1.0), r#"{"locale":"#),
                ApiErrorCode::BadRequest,
            ),
            (
                upload(
                    "audio/wav",
                    vec![0; MAX_AUDIO_BYTES + 1],
                    r#"{"locale":"es"}"#,
                ),
                ApiErrorCode::PayloadTooLarge,
            ),
        ];
        for (upload, code) in cases {
            assert_eq!(validate(&upload).map_err(|(code, _)| code), Err(code));
        }
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 16_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut stereo = Vec::new();
        let mut writer = hound::WavWriter::new(Cursor::new(&mut stereo), spec).unwrap();
        for _ in 0..32_000 {
            writer.write_sample(100_i16).unwrap();
        }
        writer.finalize().unwrap();
        assert_eq!(
            validate(&upload("audio/wav", stereo, r#"{"locale":"es"}"#)).map_err(|(code, _)| code),
            Err(ApiErrorCode::BadRequest)
        );
    }

    struct RealApi;

    impl DictationApi for RealApi {
        fn dictate(
            &self,
            _: Vec<u8>,
            _: &DictationMeta,
            _: &[EarlierSegment],
        ) -> Result<DictationResponse, ApiFailure> {
            Ok(DictationResponse {
                text: "real".into(),
                ..DictationResponse::default()
            })
        }
    }

    impl SegmentApi for RealApi {
        fn segment(
            &self,
            _: Vec<u8>,
            _: &SegmentMeta,
            _: &str,
        ) -> Result<SegmentResponse, ApiFailure> {
            Ok(SegmentResponse {
                raw: "real".into(),
                ..SegmentResponse::default()
            })
        }
    }

    #[test]
    fn stub_modes_replace_the_real_api_over_the_wire_and_off_restores_it() {
        let stub = Stub::start(Duration::ZERO).unwrap();
        let api = Stubbed::new(stub.clone(), RealApi).unwrap();

        assert_eq!(
            api.dictate(wav(1.0), &meta("en-US"), &[]).unwrap().text,
            "real"
        );

        stub.set_mode(StubMode::Normal);
        let normal = api.dictate(wav(1.0), &meta("en-US"), &[]).unwrap();
        assert!(normal.has_text());
        assert!(normal.text.starts_with("Hello"));

        stub.set_mode(StubMode::TwoLines);
        let two_lines = api.dictate(wav(1.0), &meta("es"), &[]).unwrap();
        assert_eq!(two_lines.text.lines().count(), 2);

        stub.set_mode(StubMode::Silence);
        assert!(!api.dictate(wav(1.0), &meta("es"), &[]).unwrap().has_text());

        stub.set_mode(StubMode::QuotaExceeded);
        assert!(matches!(
            api.dictate(wav(1.0), &meta("es"), &[]),
            Err(ApiFailure::Rejected {
                status: 429,
                code: Some(ApiErrorCode::QuotaExceeded)
            })
        ));

        stub.set_mode(StubMode::NetworkError);
        assert!(matches!(
            api.dictate(wav(1.0), &meta("es"), &[]),
            Err(ApiFailure::Network(_))
        ));

        stub.set_mode(StubMode::Normal);
        assert!(matches!(
            api.dictate(wav(1.0), &meta("fr"), &[]),
            Err(ApiFailure::Rejected {
                status: 400,
                code: Some(ApiErrorCode::BadRequest)
            })
        ));

        stub.set_mode(StubMode::Off);
        assert_eq!(
            api.dictate(wav(1.0), &meta("es"), &[]).unwrap().text,
            "real"
        );
    }

    #[test]
    fn the_stub_answers_segments_and_finals_that_carry_them() {
        let stub = Stub::start(Duration::ZERO).unwrap();
        let api = Stubbed::new(stub.clone(), RealApi).unwrap();
        assert_eq!(
            api.segment(wav(1.0), &SegmentMeta::default(), "")
                .unwrap()
                .raw,
            "real"
        );
        stub.set_mode(StubMode::Normal);
        let segment = api
            .segment(wav(1.0), &SegmentMeta::default(), "antes")
            .unwrap();
        assert_eq!(segment.language, Some(Language::Es));
        let earlier = [EarlierSegment {
            text: segment.raw,
            receipt: segment.receipt.unwrap(),
        }];
        let final_text = api.dictate(wav(1.0), &meta("es"), &earlier).unwrap().text;
        assert!(final_text.ends_with("(1 segments)"), "{final_text}");
    }
}
