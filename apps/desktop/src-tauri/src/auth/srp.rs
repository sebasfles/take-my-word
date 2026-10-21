use std::sync::LazyLock;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use hmac::{Hmac, Mac};
use num_bigint::BigUint;
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use zeroize::Zeroizing;

use super::Secret;

static N: LazyLock<BigUint> = LazyLock::new(|| {
    BigUint::parse_bytes(
        b"FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF",
        16,
    )
    .expect("the RFC 5054 3072-bit prime parses")
});
static G: LazyLock<BigUint> = LazyLock::new(|| BigUint::from(2u8));
static K: LazyLock<BigUint> = LazyLock::new(|| number(&sha256(&[&padded(&N), &padded(&G)])));

#[derive(Debug, thiserror::Error)]
pub enum SrpError {
    #[error("Cognito sent an invalid SRP challenge")]
    InvalidChallenge,
    #[error("the system random generator failed")]
    Random,
}

pub struct Ephemeral {
    a: BigUint,
    public: BigUint,
}

impl Ephemeral {
    pub fn generate() -> Result<Self, SrpError> {
        loop {
            let bytes = Zeroizing::new(random_bytes::<128>()?);
            let ephemeral = Self::from_private(BigUint::from_bytes_be(bytes.as_slice()) % &*N);
            if ephemeral.public != BigUint::ZERO {
                return Ok(ephemeral);
            }
        }
    }

    fn from_private(a: BigUint) -> Self {
        let public = G.modpow(&a, &N);
        Self { a, public }
    }

    pub fn public_hex(&self) -> String {
        self.public.to_str_radix(16)
    }
}

pub struct PasswordChallenge<'a> {
    pub user_pool_id: &'a str,
    pub user_id_for_srp: &'a str,
    pub srp_b: &'a str,
    pub salt: &'a str,
    pub secret_block: &'a str,
}

pub struct Claim {
    pub signature: String,
    pub timestamp: String,
}

pub fn password_claim(
    ephemeral: &Ephemeral,
    challenge: &PasswordChallenge<'_>,
    password: &Secret,
    now: OffsetDateTime,
) -> Result<Claim, SrpError> {
    let pool_name = challenge
        .user_pool_id
        .split_once('_')
        .map_or("", |(_, name)| name);
    let b = hex_number(challenge.srp_b)?;
    if &b % &*N == BigUint::ZERO {
        return Err(SrpError::InvalidChallenge);
    }
    let u = number(&sha256(&[&padded(&ephemeral.public), &padded(&b)]));
    if u == BigUint::ZERO {
        return Err(SrpError::InvalidChallenge);
    }
    let identity = Zeroizing::new(sha256(&[
        pool_name.as_bytes(),
        challenge.user_id_for_srp.as_bytes(),
        b":",
        password.expose().as_bytes(),
    ]));
    let x = number(&sha256(&[
        &padded(&hex_number(challenge.salt)?),
        identity.as_slice(),
    ]));
    let base = (&b + &*N - (&*K * G.modpow(&x, &N)) % &*N) % &*N;
    let s = base.modpow(&(&ephemeral.a + &u * &x), &N);

    let prk = hmac(&padded(&u), &[&padded(&s)]);
    let key = Zeroizing::new(hmac(&prk, &[b"Caldera Derived Key", &[1]]));
    let secret_block = BASE64
        .decode(challenge.secret_block)
        .map_err(|_| SrpError::InvalidChallenge)?;
    let timestamp = cognito_timestamp(now);
    let signature = hmac(
        &key[..16],
        &[
            pool_name.as_bytes(),
            challenge.user_id_for_srp.as_bytes(),
            &secret_block,
            timestamp.as_bytes(),
        ],
    );
    Ok(Claim {
        signature: BASE64.encode(signature),
        timestamp,
    })
}

pub struct DeviceVerifier {
    pub password_verifier: String,
    pub salt: String,
}

pub fn device_verifier(
    device_group_key: &str,
    device_key: &str,
) -> Result<DeviceVerifier, SrpError> {
    let password = Zeroizing::new(BASE64.encode(random_bytes::<40>()?));
    Ok(device_verifier_with(
        device_group_key,
        device_key,
        &password,
        &random_bytes::<16>()?,
    ))
}

fn device_verifier_with(
    device_group_key: &str,
    device_key: &str,
    password: &str,
    salt: &[u8],
) -> DeviceVerifier {
    let salt = BigUint::from_bytes_be(salt);
    let identity = sha256(&[
        device_group_key.as_bytes(),
        device_key.as_bytes(),
        b":",
        password.as_bytes(),
    ]);
    let x = number(&sha256(&[&padded(&salt), &identity]));
    DeviceVerifier {
        password_verifier: BASE64.encode(padded(&G.modpow(&x, &N))),
        salt: BASE64.encode(padded(&salt)),
    }
}

fn cognito_timestamp(now: OffsetDateTime) -> String {
    let now = now.to_offset(time::UtcOffset::UTC);
    let weekday = now.weekday().to_string();
    let month = now.month().to_string();
    format!(
        "{} {} {} {:02}:{:02}:{:02} UTC {}",
        &weekday[..3],
        &month[..3],
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
        now.year()
    )
}

fn padded(value: &BigUint) -> Vec<u8> {
    let bytes = value.to_bytes_be();
    if bytes[0] & 0x80 == 0 {
        return bytes;
    }
    let mut prefixed = Vec::with_capacity(bytes.len() + 1);
    prefixed.push(0);
    prefixed.extend(bytes);
    prefixed
}

fn number(bytes: &[u8]) -> BigUint {
    BigUint::from_bytes_be(bytes)
}

fn hex_number(hex: &str) -> Result<BigUint, SrpError> {
    BigUint::parse_bytes(hex.as_bytes(), 16).ok_or(SrpError::InvalidChallenge)
}

fn sha256(parts: &[&[u8]]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    parts.iter().for_each(|part| hasher.update(part));
    hasher.finalize().to_vec()
}

fn hmac(key: &[u8], parts: &[&[u8]]) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC takes keys of any length");
    parts.iter().for_each(|part| mac.update(part));
    mac.finalize().into_bytes().to_vec()
}

fn random_bytes<const LEN: usize>() -> Result<[u8; LEN], SrpError> {
    let mut bytes = [0; LEN];
    getrandom::fill(&mut bytes).map_err(|_| SrpError::Random)?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use super::*;

    fn vectors() -> Value {
        serde_json::from_str(include_str!("srp_vectors.json")).unwrap()
    }

    fn text<'a>(value: &'a Value, key: &str) -> &'a str {
        value[key].as_str().unwrap()
    }

    #[test]
    fn password_claims_match_packages_cognito() {
        let v = vectors();
        let ephemeral = Ephemeral::from_private(hex_number(text(&v, "a")).unwrap());
        assert_eq!(ephemeral.public_hex(), text(&v, "A"));
        let challenge = PasswordChallenge {
            user_pool_id: text(&v, "userPoolId"),
            user_id_for_srp: text(&v, "userIdForSrp"),
            srp_b: text(&v, "srpB"),
            salt: text(&v, "salt"),
            secret_block: text(&v, "secretBlock"),
        };
        let password = Secret::new(text(&v, "password"));
        for expected in v["signatures"].as_array().unwrap() {
            let now =
                OffsetDateTime::from_unix_timestamp(expected["unixSeconds"].as_i64().unwrap())
                    .unwrap();
            let claim = password_claim(&ephemeral, &challenge, &password, now).unwrap();
            assert_eq!(claim.timestamp, text(expected, "timestamp"));
            assert_eq!(claim.signature, text(expected, "signature"));
        }
    }

    #[test]
    fn device_verifiers_match_packages_cognito() {
        let v = &vectors()["device"];
        let salt = hex_number(text(v, "saltBytes")).unwrap().to_bytes_be();
        let verifier = device_verifier_with(
            text(v, "deviceGroupKey"),
            text(v, "deviceKey"),
            text(v, "password"),
            &salt,
        );
        assert_eq!(verifier.password_verifier, text(v, "passwordVerifier"));
        assert_eq!(verifier.salt, text(v, "salt"));
    }

    #[test]
    fn a_challenge_with_b_divisible_by_n_is_refused() {
        let v = vectors();
        let ephemeral = Ephemeral::generate().unwrap();
        let n = N.to_str_radix(16);
        for srp_b in ["0", n.as_str()] {
            let challenge = PasswordChallenge {
                user_pool_id: text(&v, "userPoolId"),
                user_id_for_srp: text(&v, "userIdForSrp"),
                srp_b,
                salt: text(&v, "salt"),
                secret_block: text(&v, "secretBlock"),
            };
            let claim = password_claim(
                &ephemeral,
                &challenge,
                &Secret::new("x"),
                OffsetDateTime::UNIX_EPOCH,
            );
            assert!(matches!(claim, Err(SrpError::InvalidChallenge)));
        }
    }
}
