use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Es,
    En,
}

impl Language {
    pub fn code(self) -> &'static str {
        match self {
            Self::Es => "es",
            Self::En => "en",
        }
    }
}

pub fn system_language() -> Language {
    language_of(sys_locale::get_locale().as_deref())
}

fn language_of(tag: Option<&str>) -> Language {
    let language = tag
        .unwrap_or_default()
        .split(['-', '_'])
        .next()
        .unwrap_or_default();
    if language.eq_ignore_ascii_case("es") {
        Language::Es
    } else {
        Language::En
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spanish_and_english_windows_keep_their_language() {
        assert_eq!(language_of(Some("es-CL")), Language::Es);
        assert_eq!(language_of(Some("ES_mx")), Language::Es);
        assert_eq!(language_of(Some("en-GB")), Language::En);
    }

    #[test]
    fn any_other_or_unknown_language_falls_back_to_english() {
        assert_eq!(language_of(Some("fr-FR")), Language::En);
        assert_eq!(language_of(Some("pt-BR")), Language::En);
        assert_eq!(language_of(Some("")), Language::En);
        assert_eq!(language_of(None), Language::En);
    }
}
