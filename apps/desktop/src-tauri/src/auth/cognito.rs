use std::collections::HashMap;
use std::time::Duration;

use reqwest::blocking::Client;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use time::OffsetDateTime;

use super::Secret;
use super::srp::{self, Ephemeral, PasswordChallenge, SrpError};
use crate::env::Environment;

const TIMEOUT: Duration = Duration::from_secs(15);
const TARGET_PREFIX: &str = "AWSCognitoIdentityProviderService.";

#[derive(Debug, thiserror::Error)]
pub enum CognitoError {
    #[error("Cognito could not be reached: {0}")]
    Network(String),
    #[error("Cognito answered {kind}: {message}")]
    Rejected { kind: String, message: String },
    #[error("Cognito answered something unexpected: {0}")]
    Unexpected(String),
    #[error(transparent)]
    Srp(#[from] SrpError),
}

impl CognitoError {
    pub fn ends_session(&self) -> bool {
        matches!(self, Self::Rejected { kind, .. }
            if kind == "NotAuthorizedException" || kind == "RefreshTokenReuseException")
    }
}

#[derive(Debug)]
pub struct Tokens {
    pub access_token: Secret,
    pub refresh_token: Secret,
    pub expires_in: u64,
    pub new_device: Option<NewDevice>,
}

#[derive(Debug)]
pub struct NewDevice {
    pub key: Secret,
    pub group_key: Secret,
}

#[derive(Debug)]
pub struct NewPasswordChallenge {
    pub username: String,
    session: Secret,
}

#[derive(Debug)]
pub enum SignIn {
    Done(Tokens),
    NewPasswordRequired(NewPasswordChallenge),
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ChallengeAnswer {
    challenge_name: Option<String>,
    #[serde(default)]
    challenge_parameters: HashMap<String, String>,
    session: Option<Secret>,
    authentication_result: Option<AuthenticationResult>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct AuthenticationResult {
    access_token: Secret,
    refresh_token: Option<Secret>,
    expires_in: u64,
    new_device_metadata: Option<NewDeviceMetadata>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct NewDeviceMetadata {
    device_key: Secret,
    device_group_key: Secret,
}

#[derive(Deserialize)]
struct Ignored {}

pub struct Cognito {
    client: Client,
    endpoint: String,
    user_pool_id: String,
    client_id: String,
}

impl Cognito {
    pub fn for_environment(environment: &Environment) -> Result<Self, CognitoError> {
        Self::new(
            format!(
                "https://cognito-idp.{}.amazonaws.com/",
                environment.region()
            ),
            environment.user_pool_id,
            environment.client_id,
        )
    }

    pub fn new(
        endpoint: impl Into<String>,
        user_pool_id: impl Into<String>,
        client_id: impl Into<String>,
    ) -> Result<Self, CognitoError> {
        let client = Client::builder()
            .timeout(TIMEOUT)
            .build()
            .map_err(|error| CognitoError::Network(error.to_string()))?;
        Ok(Self {
            client,
            endpoint: endpoint.into(),
            user_pool_id: user_pool_id.into(),
            client_id: client_id.into(),
        })
    }

    pub fn sign_in(
        &self,
        username: &str,
        password: &Secret,
        now: OffsetDateTime,
    ) -> Result<SignIn, CognitoError> {
        let ephemeral = Ephemeral::generate()?;
        let started: ChallengeAnswer = self.call(
            "InitiateAuth",
            json!({
                "AuthFlow": "USER_SRP_AUTH",
                "ClientId": self.client_id,
                "AuthParameters": { "USERNAME": username, "SRP_A": ephemeral.public_hex() },
            }),
        )?;
        if started.challenge_name.as_deref() != Some("PASSWORD_VERIFIER") {
            return Err(unexpected_challenge(started.challenge_name));
        }
        let parameter = |name: &str| {
            started
                .challenge_parameters
                .get(name)
                .map(String::as_str)
                .unwrap_or_default()
        };
        let user_id_for_srp = parameter("USER_ID_FOR_SRP");
        let secret_block = parameter("SECRET_BLOCK");
        let claim = srp::password_claim(
            &ephemeral,
            &PasswordChallenge {
                user_pool_id: &self.user_pool_id,
                user_id_for_srp,
                srp_b: parameter("SRP_B"),
                salt: parameter("SALT"),
                secret_block,
            },
            password,
            now,
        )?;
        let answered: ChallengeAnswer = self.call(
            "RespondToAuthChallenge",
            json!({
                "ChallengeName": "PASSWORD_VERIFIER",
                "ClientId": self.client_id,
                "ChallengeResponses": {
                    "USERNAME": user_id_for_srp,
                    "PASSWORD_CLAIM_SECRET_BLOCK": secret_block,
                    "PASSWORD_CLAIM_SIGNATURE": claim.signature,
                    "TIMESTAMP": claim.timestamp,
                },
            }),
        )?;
        match (answered.challenge_name.as_deref(), answered.session) {
            (Some("NEW_PASSWORD_REQUIRED"), Some(session)) => {
                Ok(SignIn::NewPasswordRequired(NewPasswordChallenge {
                    username: user_id_for_srp.to_owned(),
                    session,
                }))
            }
            (None, _) => tokens(answered.authentication_result).map(SignIn::Done),
            (name, _) => Err(unexpected_challenge(name.map(str::to_owned))),
        }
    }

    pub fn complete_new_password(
        &self,
        challenge: &NewPasswordChallenge,
        new_password: &Secret,
    ) -> Result<Tokens, CognitoError> {
        let answered: ChallengeAnswer = self.call(
            "RespondToAuthChallenge",
            json!({
                "ChallengeName": "NEW_PASSWORD_REQUIRED",
                "ClientId": self.client_id,
                "Session": challenge.session.expose(),
                "ChallengeResponses": {
                    "USERNAME": challenge.username,
                    "NEW_PASSWORD": new_password.expose(),
                },
            }),
        )?;
        if answered.challenge_name.is_some() {
            return Err(unexpected_challenge(answered.challenge_name));
        }
        tokens(answered.authentication_result)
    }

    pub fn confirm_device(
        &self,
        access_token: &Secret,
        device: &NewDevice,
        device_name: &str,
    ) -> Result<(), CognitoError> {
        let verifier = srp::device_verifier(device.group_key.expose(), device.key.expose())?;
        self.call::<Ignored>(
            "ConfirmDevice",
            json!({
                "AccessToken": access_token.expose(),
                "DeviceKey": device.key.expose(),
                "DeviceName": device_name,
                "DeviceSecretVerifierConfig": {
                    "PasswordVerifier": verifier.password_verifier,
                    "Salt": verifier.salt,
                },
            }),
        )?;
        Ok(())
    }

    pub fn refresh(
        &self,
        refresh_token: &Secret,
        device_key: &Secret,
    ) -> Result<Tokens, CognitoError> {
        let answered: ChallengeAnswer = self.call(
            "GetTokensFromRefreshToken",
            json!({
                "ClientId": self.client_id,
                "RefreshToken": refresh_token.expose(),
                "DeviceKey": device_key.expose(),
            }),
        )?;
        tokens(answered.authentication_result)
    }

    pub fn forget_device(
        &self,
        access_token: &Secret,
        device_key: &Secret,
    ) -> Result<(), CognitoError> {
        self.call::<Ignored>(
            "ForgetDevice",
            json!({ "AccessToken": access_token.expose(), "DeviceKey": device_key.expose() }),
        )?;
        Ok(())
    }

    pub fn revoke_token(&self, refresh_token: &Secret) -> Result<(), CognitoError> {
        self.call::<Ignored>(
            "RevokeToken",
            json!({ "ClientId": self.client_id, "Token": refresh_token.expose() }),
        )?;
        Ok(())
    }

    fn call<T: DeserializeOwned>(&self, operation: &str, body: Value) -> Result<T, CognitoError> {
        let response = self
            .client
            .post(&self.endpoint)
            .header("Content-Type", "application/x-amz-json-1.1")
            .header("X-Amz-Target", format!("{TARGET_PREFIX}{operation}"))
            .body(body.to_string())
            .send()
            .map_err(|error| CognitoError::Network(error.without_url().to_string()))?;
        let status = response.status();
        let body = response
            .bytes()
            .map_err(|error| CognitoError::Network(error.without_url().to_string()))?;
        if status.is_success() {
            let body: &[u8] = if body.is_empty() { b"{}" } else { &body };
            return serde_json::from_slice(body).map_err(|_| {
                CognitoError::Unexpected(format!("{operation} returned no valid JSON"))
            });
        }
        Err(rejection(status.as_u16(), &body))
    }
}

fn rejection(status: u16, body: &[u8]) -> CognitoError {
    let body: Value = serde_json::from_slice(body).unwrap_or_default();
    let field = |name: &str| body.get(name).and_then(Value::as_str).unwrap_or_default();
    let kind = field("__type").rsplit('#').next().unwrap_or_default();
    if kind.is_empty() {
        return CognitoError::Unexpected(format!("status {status} without an error type"));
    }
    let message = [field("message"), field("Message")]
        .into_iter()
        .find(|message| !message.is_empty())
        .unwrap_or_default();
    CognitoError::Rejected {
        kind: kind.to_owned(),
        message: message.to_owned(),
    }
}

fn unexpected_challenge(name: Option<String>) -> CognitoError {
    CognitoError::Unexpected(format!(
        "unexpected challenge {}",
        name.as_deref().unwrap_or("none")
    ))
}

fn tokens(result: Option<AuthenticationResult>) -> Result<Tokens, CognitoError> {
    let result = result.ok_or_else(|| CognitoError::Unexpected("no tokens".into()))?;
    let refresh_token = result
        .refresh_token
        .ok_or_else(|| CognitoError::Unexpected("no refresh token".into()))?;
    Ok(Tokens {
        access_token: result.access_token,
        refresh_token,
        expires_in: result.expires_in,
        new_device: result.new_device_metadata.map(|device| NewDevice {
            key: device.device_key,
            group_key: device.device_group_key,
        }),
    })
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    use axum::Router;
    use axum::http::{HeaderMap, StatusCode};
    use axum::routing::post;

    use super::*;

    type Request = (String, Value);

    #[derive(Clone, Default)]
    struct Fake {
        requests: Arc<Mutex<Vec<Request>>>,
        answers: Arc<Mutex<VecDeque<(u16, Value)>>>,
    }

    impl Fake {
        fn start(answers: impl IntoIterator<Item = (u16, Value)>) -> (Self, Cognito) {
            let fake = Self::default();
            fake.answers.lock().unwrap().extend(answers);
            let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
            listener.set_nonblocking(true).unwrap();
            let address = listener.local_addr().unwrap();
            let state = fake.clone();
            let router = Router::new().route(
                "/",
                post(move |headers: HeaderMap, body: String| {
                    let state = state.clone();
                    async move {
                        let target = headers["x-amz-target"].to_str().unwrap().to_owned();
                        let body = serde_json::from_str(&body).unwrap();
                        state.requests.lock().unwrap().push((target, body));
                        let (status, answer) = state.answers.lock().unwrap().pop_front().unwrap();
                        let body = if answer.is_null() {
                            String::new()
                        } else {
                            answer.to_string()
                        };
                        (StatusCode::from_u16(status).unwrap(), body)
                    }
                }),
            );
            tauri::async_runtime::spawn(async move {
                let listener = tokio::net::TcpListener::from_std(listener).unwrap();
                axum::serve(listener, router).await.unwrap();
            });
            let cognito =
                Cognito::new(format!("http://{address}/"), "us-east-1_pool", "client").unwrap();
            (fake, cognito)
        }

        fn requests(&self) -> Vec<Request> {
            self.requests.lock().unwrap().clone()
        }
    }

    fn password_verifier_challenge() -> (u16, Value) {
        let v: Value = serde_json::from_str(include_str!("srp_vectors.json")).unwrap();
        (
            200,
            json!({
                "ChallengeName": "PASSWORD_VERIFIER",
                "ChallengeParameters": {
                    "SALT": v["salt"], "SECRET_BLOCK": v["secretBlock"], "SRP_B": v["srpB"],
                    "USERNAME": "sebastian", "USER_ID_FOR_SRP": "user-sub",
                },
            }),
        )
    }

    fn authenticated(device: bool) -> (u16, Value) {
        let mut result = json!({
            "AccessToken": "access-1", "RefreshToken": "refresh-1", "IdToken": "id-1",
            "ExpiresIn": 3600, "TokenType": "Bearer",
        });
        if device {
            result["NewDeviceMetadata"] =
                json!({ "DeviceKey": "device-key", "DeviceGroupKey": "group-key" });
        }
        (200, json!({ "AuthenticationResult": result }))
    }

    fn rejected(kind: &str, message: &str) -> (u16, Value) {
        (400, json!({ "__type": kind, "message": message }))
    }

    #[test]
    fn sign_in_runs_user_srp_and_returns_the_new_device() {
        let (fake, cognito) = Fake::start([password_verifier_challenge(), authenticated(true)]);
        let password = Secret::new("hunter2-password");
        let SignIn::Done(tokens) = cognito
            .sign_in("sebastian", &password, OffsetDateTime::UNIX_EPOCH)
            .unwrap()
        else {
            panic!("expected tokens");
        };
        assert_eq!(tokens.access_token.expose(), "access-1");
        assert_eq!(tokens.refresh_token.expose(), "refresh-1");
        assert_eq!(tokens.expires_in, 3600);
        let device = tokens.new_device.unwrap();
        assert_eq!(
            (device.key.expose(), device.group_key.expose()),
            ("device-key", "group-key")
        );

        let requests = fake.requests();
        let (target, initiate) = &requests[0];
        assert_eq!(target, "AWSCognitoIdentityProviderService.InitiateAuth");
        assert_eq!(initiate["AuthFlow"], "USER_SRP_AUTH");
        assert_eq!(initiate["AuthParameters"]["USERNAME"], "sebastian");
        assert!(initiate["AuthParameters"]["SRP_A"].as_str().unwrap().len() > 700);
        assert!(initiate["AuthParameters"].get("DEVICE_KEY").is_none());
        let (target, respond) = &requests[1];
        assert_eq!(
            target,
            "AWSCognitoIdentityProviderService.RespondToAuthChallenge"
        );
        assert_eq!(respond["ChallengeResponses"]["USERNAME"], "user-sub");
        assert_eq!(
            respond["ChallengeResponses"]["TIMESTAMP"],
            "Thu Jan 1 00:00:00 UTC 1970"
        );
        assert!(
            !requests
                .iter()
                .any(|(_, body)| body.to_string().contains("hunter2-password"))
        );
    }

    #[test]
    fn a_temporary_password_leads_to_the_new_password_step() {
        let (fake, cognito) = Fake::start([
            password_verifier_challenge(),
            (
                200,
                json!({ "ChallengeName": "NEW_PASSWORD_REQUIRED", "Session": "challenge-session" }),
            ),
            authenticated(true),
        ]);
        let SignIn::NewPasswordRequired(challenge) = cognito
            .sign_in(
                "sebastian",
                &Secret::new("temporary"),
                OffsetDateTime::UNIX_EPOCH,
            )
            .unwrap()
        else {
            panic!("expected the new password step");
        };
        assert!(!format!("{challenge:?}").contains("challenge-session"));
        let tokens = cognito
            .complete_new_password(&challenge, &Secret::new("chosen password"))
            .unwrap();
        assert!(tokens.new_device.is_some());
        let (_, answer) = &fake.requests()[2];
        assert_eq!(answer["ChallengeName"], "NEW_PASSWORD_REQUIRED");
        assert_eq!(answer["Session"], "challenge-session");
        assert_eq!(answer["ChallengeResponses"]["USERNAME"], "user-sub");
        assert_eq!(
            answer["ChallengeResponses"]["NEW_PASSWORD"],
            "chosen password"
        );
    }

    #[test]
    fn refresh_always_sends_the_device_key_and_returns_the_rotated_token() {
        let (fake, cognito) = Fake::start([authenticated(false), (200, Value::Null)]);
        let tokens = cognito
            .refresh(&Secret::new("refresh-0"), &Secret::new("device-key"))
            .unwrap();
        assert_eq!(tokens.refresh_token.expose(), "refresh-1");
        assert!(tokens.new_device.is_none());
        cognito.revoke_token(&tokens.refresh_token).unwrap();
        let requests = fake.requests();
        assert_eq!(
            requests[0],
            (
                "AWSCognitoIdentityProviderService.GetTokensFromRefreshToken".into(),
                json!({ "ClientId": "client", "RefreshToken": "refresh-0", "DeviceKey": "device-key" })
            )
        );
        assert_eq!(
            requests[1],
            (
                "AWSCognitoIdentityProviderService.RevokeToken".into(),
                json!({ "ClientId": "client", "Token": "refresh-1" })
            )
        );
    }

    #[test]
    fn device_confirmation_and_forgetting_carry_the_access_token_and_device_key() {
        let (fake, cognito) = Fake::start([(200, json!({})), (200, Value::Null)]);
        let device = NewDevice {
            key: Secret::new("device-key"),
            group_key: Secret::new("group-key"),
        };
        let access = Secret::new("access-1");
        cognito
            .confirm_device(&access, &device, "Take My Word on PC")
            .unwrap();
        cognito.forget_device(&access, &device.key).unwrap();
        let requests = fake.requests();
        let (target, confirm) = &requests[0];
        assert_eq!(target, "AWSCognitoIdentityProviderService.ConfirmDevice");
        assert_eq!(confirm["AccessToken"], "access-1");
        assert_eq!(confirm["DeviceKey"], "device-key");
        assert_eq!(confirm["DeviceName"], "Take My Word on PC");
        let config = &confirm["DeviceSecretVerifierConfig"];
        assert!(
            config["PasswordVerifier"]
                .as_str()
                .is_some_and(|v| !v.is_empty())
        );
        assert!(config["Salt"].as_str().is_some_and(|v| !v.is_empty()));
        assert_eq!(
            requests[1],
            (
                "AWSCognitoIdentityProviderService.ForgetDevice".into(),
                json!({ "AccessToken": "access-1", "DeviceKey": "device-key" })
            )
        );
    }

    #[test]
    fn only_not_authorized_and_reuse_end_the_session() {
        let (_, cognito) = Fake::start([
            rejected("NotAuthorizedException", "Invalid Refresh Token."),
            rejected("RefreshTokenReuseException", "Refresh token reuse detected"),
            rejected(
                "com.amazonaws.cognito#TooManyRequestsException",
                "Rate exceeded",
            ),
            (500, json!({})),
        ]);
        let refresh = || cognito.refresh(&Secret::new("refresh"), &Secret::new("device"));
        assert!(refresh().unwrap_err().ends_session());
        assert!(refresh().unwrap_err().ends_session());
        let throttled = refresh().unwrap_err();
        assert!(
            matches!(&throttled, CognitoError::Rejected { kind, .. } if kind == "TooManyRequestsException")
        );
        assert!(!throttled.ends_session());
        assert!(matches!(
            refresh().unwrap_err(),
            CognitoError::Unexpected(_)
        ));

        let closed = TcpListener::bind(("127.0.0.1", 0))
            .unwrap()
            .local_addr()
            .unwrap();
        let offline =
            Cognito::new(format!("http://{closed}/"), "us-east-1_pool", "client").unwrap();
        let error = offline
            .refresh(&Secret::new("refresh"), &Secret::new("device"))
            .unwrap_err();
        assert!(matches!(error, CognitoError::Network(_)));
        assert!(!error.ends_session());
    }
}
