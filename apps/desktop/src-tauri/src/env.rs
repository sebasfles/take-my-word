#[cfg(all(feature = "dev", feature = "prd"))]
compile_error!("select one environment, the dev or the prd feature");

#[cfg(all(not(debug_assertions), not(any(feature = "dev", feature = "prd"))))]
compile_error!(
    "release builds need an environment: pnpm tauri:build:dev or pnpm tauri:build:prd in apps/desktop"
);

#[derive(Debug, PartialEq, Eq)]
pub struct Environment {
    pub identifier: &'static str,
    pub api_url: &'static str,
    pub user_pool_id: &'static str,
    pub client_id: &'static str,
}

impl Environment {
    pub fn region(&self) -> &'static str {
        self.user_pool_id
            .split_once('_')
            .map_or(self.user_pool_id, |(region, _)| region)
    }
}

pub const DEV: Environment = Environment {
    identifier: "dev.fless.takemyword.dev",
    api_url: "https://api.dev.takemyword.fless.dev",
    user_pool_id: "us-east-1_9g4xiMUfJ",
    client_id: "1tbtl9b2v17ikpo7aklr9829me",
};

pub const PRD: Environment = Environment {
    identifier: "dev.fless.takemyword",
    api_url: "https://api.takemyword.fless.dev",
    user_pool_id: "us-east-1_uekLYxWNc",
    client_id: "t8q0rn6p6efuemo46u2uchmgh",
};

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
    fn debug_builds_without_a_config_overlay_are_the_dev_app() {
        let base = config(include_str!("../tauri.conf.json"));
        assert_eq!(base["identifier"], DEV.identifier);
        assert_eq!(CURRENT, &DEV);
        assert!(check_identifier(DEV.identifier).is_ok());
        assert!(check_identifier(PRD.identifier).is_err());
    }
}
