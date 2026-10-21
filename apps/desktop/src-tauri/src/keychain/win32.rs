use std::collections::HashMap;
use std::sync::Arc;

use keyring_core::api::CredentialStoreApi;
use keyring_core::{Entry, Error};
use windows_native_keyring_store::Store;
use zeroize::Zeroizing;

use super::{Keychain, KeychainError, StoredSession};
use crate::auth::Secret;

const REFRESH_TOKEN: &str = "refresh-token";
const DEVICE_KEY: &str = "device-key";
const DEVICE_GROUP_KEY: &str = "device-group-key";

pub struct SystemKeychain {
    service: String,
    store: Arc<Store>,
}

fn failure(action: &'static str, item: &'static str, error: &Error) -> KeychainError {
    let reason = match error {
        Error::NoStorageAccess(_) => "access to Credential Manager was denied",
        Error::TooLong(..) => "the value is over the Credential Manager size limit",
        Error::PlatformFailure(_) => "Credential Manager failed",
        Error::BadEncoding(_) | Error::BadDataFormat(..) => "the stored value is unreadable",
        _ => "unexpected keychain error",
    };
    KeychainError {
        action,
        item,
        reason: reason.into(),
    }
}

impl SystemKeychain {
    pub fn new(service: &str) -> Result<Self, KeychainError> {
        let store = Store::new().map_err(|error| failure("open", "store", &error))?;
        Ok(Self {
            service: service.to_owned(),
            store,
        })
    }

    fn entry(&self, item: &'static str, action: &'static str) -> Result<Entry, KeychainError> {
        let local = HashMap::from([("persistence", "Local")]);
        self.store
            .build(&self.service, item, Some(&local))
            .map_err(|error| failure(action, item, &error))
    }

    fn read(&self, item: &'static str) -> Result<Option<Secret>, KeychainError> {
        match self.entry(item, "read")?.get_secret() {
            Ok(bytes) => {
                let bytes = Zeroizing::new(bytes);
                let text = std::str::from_utf8(&bytes).map_err(|_| KeychainError {
                    action: "read",
                    item,
                    reason: "the stored value is unreadable".into(),
                })?;
                Ok(Some(Secret::new(text)))
            }
            Err(Error::NoEntry) => Ok(None),
            Err(error) => Err(failure("read", item, &error)),
        }
    }

    fn write(&self, item: &'static str, value: &Secret) -> Result<(), KeychainError> {
        self.entry(item, "save")?
            .set_secret(value.expose().as_bytes())
            .map_err(|error| failure("save", item, &error))
    }

    fn delete(&self, item: &'static str) -> Result<(), KeychainError> {
        match self.entry(item, "delete")?.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(error) => Err(failure("delete", item, &error)),
        }
    }
}

impl Keychain for SystemKeychain {
    fn load(&self) -> Result<Option<StoredSession>, KeychainError> {
        let refresh_token = self.read(REFRESH_TOKEN)?;
        let device_key = self.read(DEVICE_KEY)?;
        let device_group_key = self.read(DEVICE_GROUP_KEY)?;
        match (refresh_token, device_key, device_group_key) {
            (Some(refresh_token), Some(device_key), Some(device_group_key)) => {
                Ok(Some(StoredSession {
                    refresh_token,
                    device_key,
                    device_group_key,
                }))
            }
            (None, None, None) => Ok(None),
            _ => {
                log::warn!("the keychain held part of a session; clearing it");
                self.clear()?;
                Ok(None)
            }
        }
    }

    fn save(&self, session: &StoredSession) -> Result<(), KeychainError> {
        self.write(DEVICE_KEY, &session.device_key)?;
        self.write(DEVICE_GROUP_KEY, &session.device_group_key)?;
        self.write(REFRESH_TOKEN, &session.refresh_token)
    }

    fn save_refresh_token(&self, refresh_token: &Secret) -> Result<(), KeychainError> {
        self.write(REFRESH_TOKEN, refresh_token)
    }

    fn clear(&self) -> Result<(), KeychainError> {
        let results = [
            self.delete(REFRESH_TOKEN),
            self.delete(DEVICE_KEY),
            self.delete(DEVICE_GROUP_KEY),
        ];
        results.into_iter().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Scratch(SystemKeychain);

    impl Scratch {
        fn new(name: &str) -> Self {
            let service = format!("dev.fless.takemyword.test.{name}.{}", std::process::id());
            let keychain = SystemKeychain::new(&service).unwrap();
            keychain.clear().unwrap();
            Self(keychain)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = self.0.clear();
        }
    }

    fn token(length: usize, seed: char) -> Secret {
        Secret::new(std::iter::repeat_n(seed, length).collect::<String>())
    }

    #[test]
    fn a_saved_session_survives_and_the_refresh_token_rotates_in_place() {
        let scratch = Scratch::new("round-trip");
        let keychain = &scratch.0;
        assert!(keychain.load().unwrap().is_none());

        let session = StoredSession {
            refresh_token: token(2000, 'r'),
            device_key: Secret::new("us-east-1_0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0"),
            device_group_key: Secret::new("-abcDEF123"),
        };
        keychain.save(&session).unwrap();
        let loaded = keychain.load().unwrap().unwrap();
        assert_eq!(loaded.refresh_token, session.refresh_token);
        assert_eq!(loaded.device_key, session.device_key);
        assert_eq!(loaded.device_group_key, session.device_group_key);

        keychain.save_refresh_token(&token(2000, 's')).unwrap();
        let rotated = keychain.load().unwrap().unwrap();
        assert_eq!(rotated.refresh_token, token(2000, 's'));
        assert_eq!(rotated.device_key, session.device_key);

        keychain.clear().unwrap();
        assert!(keychain.load().unwrap().is_none());
        keychain.clear().unwrap();
    }

    #[test]
    fn a_partial_session_reads_as_signed_out_and_is_removed() {
        let scratch = Scratch::new("partial");
        let keychain = &scratch.0;
        keychain.save_refresh_token(&token(10, 'r')).unwrap();
        assert!(keychain.load().unwrap().is_none());
        assert!(keychain.read(REFRESH_TOKEN).unwrap().is_none());
    }

    #[test]
    fn values_over_the_credential_blob_limit_fail_without_echoing_them() {
        let scratch = Scratch::new("too-long");
        let error = scratch.0.save_refresh_token(&token(2561, 'x')).unwrap_err();
        assert!(!error.to_string().contains("xxxx"));
    }
}
