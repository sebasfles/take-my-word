use super::{Keychain, KeychainError, StoredSession};
use crate::auth::Secret;

pub struct SystemKeychain;

impl SystemKeychain {
    pub fn new(_service: &str) -> Result<Self, KeychainError> {
        Ok(Self)
    }
}

fn unsupported(action: &'static str) -> KeychainError {
    KeychainError {
        action,
        item: "session",
        reason: "this platform has no keychain support yet".into(),
    }
}

impl Keychain for SystemKeychain {
    fn load(&self) -> Result<Option<StoredSession>, KeychainError> {
        Ok(None)
    }

    fn save(&self, _: &StoredSession) -> Result<(), KeychainError> {
        Err(unsupported("save"))
    }

    fn save_refresh_token(&self, _: &Secret) -> Result<(), KeychainError> {
        Err(unsupported("save"))
    }

    fn clear(&self) -> Result<(), KeychainError> {
        Ok(())
    }
}
