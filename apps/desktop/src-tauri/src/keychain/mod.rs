#[cfg(not(windows))]
mod unsupported;
#[cfg(windows)]
mod win32;

#[cfg(not(windows))]
pub use unsupported::SystemKeychain;
#[cfg(windows)]
pub use win32::SystemKeychain;

use crate::auth::Secret;

#[derive(Clone, Debug)]
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

#[cfg(test)]
pub mod memory {
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::{Keychain, KeychainError, StoredSession};
    use crate::auth::Secret;

    #[derive(Default)]
    pub struct MemoryKeychain {
        pub stored: Mutex<Option<StoredSession>>,
        pub refuse_writes: AtomicBool,
    }

    impl MemoryKeychain {
        pub fn holding(session: StoredSession) -> Self {
            Self {
                stored: Mutex::new(Some(session)),
                ..Self::default()
            }
        }

        pub fn refresh_token(&self) -> Option<String> {
            self.stored
                .lock()
                .unwrap()
                .as_ref()
                .map(|session| session.refresh_token.expose().to_owned())
        }

        fn writable(&self) -> Result<(), KeychainError> {
            if self.refuse_writes.load(Ordering::SeqCst) {
                return Err(KeychainError {
                    action: "save",
                    item: "session",
                    reason: "refused".into(),
                });
            }
            Ok(())
        }
    }

    impl Keychain for MemoryKeychain {
        fn load(&self) -> Result<Option<StoredSession>, KeychainError> {
            Ok(self.stored.lock().unwrap().clone())
        }

        fn save(&self, session: &StoredSession) -> Result<(), KeychainError> {
            self.writable()?;
            *self.stored.lock().unwrap() = Some(session.clone());
            Ok(())
        }

        fn save_refresh_token(&self, refresh_token: &Secret) -> Result<(), KeychainError> {
            self.writable()?;
            if let Some(session) = self.stored.lock().unwrap().as_mut() {
                session.refresh_token = refresh_token.clone();
            }
            Ok(())
        }

        fn clear(&self) -> Result<(), KeychainError> {
            *self.stored.lock().unwrap() = None;
            Ok(())
        }
    }
}
