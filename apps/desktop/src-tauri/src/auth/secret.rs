use std::fmt;

use serde::{Deserialize, Deserializer};
use zeroize::Zeroizing;

#[derive(Clone, PartialEq, Eq)]
pub struct Secret(Zeroizing<String>);

impl Secret {
    pub fn new(value: impl Into<String>) -> Self {
        Self(Zeroizing::new(value.into()))
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secret(redacted)")
    }
}

impl<'de> Deserialize<'de> for Secret {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        String::deserialize(deserializer).map(Self::new)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_output_never_shows_the_value() {
        let secret = Secret::new("eyJraWQiOi.refresh-token-value");
        let wrapped = Some(vec![secret.clone()]);
        assert!(!format!("{secret:?} {wrapped:?} {wrapped:#?}").contains("refresh-token-value"));
        assert_eq!(secret.expose(), "eyJraWQiOi.refresh-token-value");
    }
}
