const FALLBACK: &str = "es";

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Es,
    En,
}

pub fn system_locale() -> String {
    api_locale(sys_locale::get_locale().as_deref())
}

pub fn system_language() -> Language {
    language(&system_locale())
}

fn language(locale: &str) -> Language {
    if locale.starts_with("en") {
        Language::En
    } else {
        Language::Es
    }
}

fn api_locale(tag: Option<&str>) -> String {
    let mut parts = tag.unwrap_or_default().split(['-', '_']);
    let language = parts.next().unwrap_or_default().to_ascii_lowercase();
    if language != "es" && language != "en" {
        return FALLBACK.into();
    }
    let region =
        parts.find(|part| part.len() == 2 && part.chars().all(|c| c.is_ascii_alphabetic()));
    match region {
        Some(region) => format!("{language}-{}", region.to_ascii_uppercase()),
        None => language,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spanish_and_english_keep_their_region() {
        assert_eq!(api_locale(Some("es-CL")), "es-CL");
        assert_eq!(api_locale(Some("en_us")), "en-US");
        assert_eq!(api_locale(Some("EN-Latn-GB")), "en-GB");
    }

    #[test]
    fn regions_the_api_cannot_take_are_dropped() {
        assert_eq!(api_locale(Some("es-419")), "es");
        assert_eq!(api_locale(Some("en")), "en");
    }

    #[test]
    fn other_or_unknown_languages_fall_back_to_spanish() {
        assert_eq!(api_locale(Some("fr-FR")), "es");
        assert_eq!(api_locale(Some("")), "es");
        assert_eq!(api_locale(None), "es");
    }

    #[test]
    fn the_ui_language_follows_the_dictation_locale() {
        for (tag, expected) in [
            ("en-GB", Language::En),
            ("es-CL", Language::Es),
            ("fr-FR", Language::Es),
        ] {
            assert_eq!(language(&api_locale(Some(tag))), expected);
        }
    }
}
