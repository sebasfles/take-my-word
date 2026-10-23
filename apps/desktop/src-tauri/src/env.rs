#[cfg(all(feature = "dev", feature = "prd"))]
compile_error!("select one environment, the dev or the prd feature");

#[cfg(all(not(debug_assertions), not(any(feature = "dev", feature = "prd"))))]
compile_error!(
    "release builds need an environment: pnpm tauri:build:dev or pnpm tauri:build:prd in apps/desktop"
);

use crate::hotkey::HotkeyKey;
use crate::server::Server;

#[derive(Debug, PartialEq, Eq)]
pub struct Environment {
    pub identifier: &'static str,
    pub default_hotkey: &'static [HotkeyKey],
}

pub const DEV: Environment = Environment {
    identifier: "dev.fless.takemyword.dev",
    default_hotkey: &[HotkeyKey::Ctrl, HotkeyKey::Alt, HotkeyKey::Meta],
};

pub const PRD: Environment = Environment {
    identifier: "dev.fless.takemyword",
    default_hotkey: &[HotkeyKey::Ctrl, HotkeyKey::Meta],
};

fn parse_server(json: Option<&str>) -> Result<Server, String> {
    let json = json.ok_or(
        "this build has no official server; build with pnpm tauri:build:dev or pnpm tauri:build:prd in apps/desktop",
    )?;
    Server::from_json(json.as_bytes())
        .map_err(|error| format!("the official server of this build is not valid: {error}"))
}

pub fn official_server() -> Result<Server, String> {
    parse_server(option_env!("TAKE_MY_WORD_SERVER"))
}

pub const CURRENT: &Environment = if cfg!(feature = "prd") { &PRD } else { &DEV };

pub fn check_identifier(identifier: &str) -> Result<(), String> {
    if identifier == CURRENT.identifier {
        return Ok(());
    }
    Err(format!(
        "this build targets {} but its Tauri config says {identifier}; build with pnpm tauri:build:dev or pnpm tauri:build:prd",
        CURRENT.identifier
    ))
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    use super::*;

    fn config(text: &str) -> Value {
        serde_json::from_str(text).unwrap()
    }

    #[test]
    fn each_tauri_config_selects_the_environment_it_names() {
        for (text, environment, feature) in [
            (include_str!("../tauri.dev.conf.json"), &DEV, "dev"),
            (include_str!("../tauri.prd.conf.json"), &PRD, "prd"),
        ] {
            let config = config(text);
            assert_eq!(config["identifier"], environment.identifier);
            assert_eq!(config["build"]["features"], serde_json::json!([feature]));
        }
    }

    #[test]
    fn the_official_server_is_the_discovery_document_the_build_carries() {
        let json = r#"{"version":1,"apiUrl":"https://api.dictation.example.com","region":"eu-west-1","userPoolId":"eu-west-1_Pool1","clientId":"client1","later":true}"#;
        assert_eq!(
            parse_server(Some(json)),
            Ok(Server {
                version: 1,
                api_url: "https://api.dictation.example.com".into(),
                region: "eu-west-1".into(),
                user_pool_id: "eu-west-1_Pool1".into(),
                client_id: "client1".into(),
            })
        );
    }

    #[test]
    fn a_build_without_a_valid_server_refuses_to_start() {
        assert!(parse_server(None).unwrap_err().contains("pnpm tauri:build"));
        assert!(parse_server(Some("{}")).unwrap_err().contains("not valid"));
        let next = r#"{"version":2,"apiUrl":"a","region":"r","userPoolId":"p","clientId":"c"}"#;
        assert!(parse_server(Some(next)).unwrap_err().contains("version 2"));
    }

    #[test]
    fn debug_builds_without_a_config_overlay_are_the_dev_app() {
        let base = config(include_str!("../tauri.conf.json"));
        assert_eq!(base["identifier"], DEV.identifier);
        assert_eq!(CURRENT, &DEV);
        assert!(check_identifier(DEV.identifier).is_ok());
        assert!(check_identifier(PRD.identifier).is_err());
    }
}
