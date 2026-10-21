#[cfg(not(windows))]
mod unsupported;
#[cfg(windows)]
mod win32;

#[cfg(not(windows))]
pub use unsupported::SystemKeychain;
#[cfg(windows)]
pub use win32::SystemKeychain;

use crate::auth::Secret;

#[derive(Debug)]
pub struct StoredSession {
    pub refresh_token: Secret,
    pub device_key: Secret,
    pub device_group_key: Secret,
}

#[derive(Debug, thiserror::Error)]
#[error("the keychain failed to {action} the {item}: {reason}")]
pub struct KeychainError {
    pub action: &'static str,
    pub item: &'static str,
    pub reason: String,
}

pub trait Keychain: Send + Sync {
    fn load(&self) -> Result<Option<StoredSession>, KeychainError>;
    fn save(&self, session: &StoredSession) -> Result<(), KeychainError>;
    fn save_refresh_token(&self, refresh_token: &Secret) -> Result<(), KeychainError>;
    fn clear(&self) -> Result<(), KeychainError>;
}
