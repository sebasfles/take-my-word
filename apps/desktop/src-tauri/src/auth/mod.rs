pub mod account;
pub mod cognito;
mod secret;
mod srp;

pub use secret::Secret;

#[cfg(test)]
mod dev_pool {
    use time::OffsetDateTime;

    use super::Secret;
    use super::cognito::{Cognito, SignIn};
    use crate::env::official_server;

    #[test]
    #[ignore = "signs in to the dev pool with TMW_DEV_USERNAME and TMW_DEV_PASSWORD"]
    fn the_dev_pool_signs_in_confirms_refreshes_forgets_and_revokes() {
        let (Ok(username), Ok(password), Ok(server)) = (
            std::env::var("TMW_DEV_USERNAME"),
            std::env::var("TMW_DEV_PASSWORD"),
            official_server(),
        ) else {
            eprintln!(
                "skipped: TMW_DEV_USERNAME, TMW_DEV_PASSWORD and the build's TAKE_MY_WORD_SERVER are not all set"
            );
            return;
        };
        let password = Secret::new(password);
        let cognito = Cognito::for_server(&server).unwrap();
        let SignIn::Done(signed_in) = cognito
            .sign_in(&username, &password, OffsetDateTime::now_utc())
            .unwrap()
        else {
            panic!("the account asks for a new password");
        };
        drop(password);
        let device = signed_in.new_device.expect("device tracking is on");
        cognito
            .confirm_device(&signed_in.access_token, &device, "Take My Word cargo test")
            .unwrap();
        let renewed = cognito
            .refresh(&signed_in.refresh_token, &device.key)
            .unwrap();
        assert_ne!(renewed.refresh_token, signed_in.refresh_token);
        eprintln!(
            "bytes: access {}, refresh {}, device key {}, device group key {}",
            renewed.access_token.expose().len(),
            renewed.refresh_token.expose().len(),
            device.key.expose().len(),
            device.group_key.expose().len()
        );

        #[cfg(windows)]
        {
            use crate::keychain::{Keychain, StoredSession, SystemKeychain};
            let service = format!("dev.fless.takemyword.test.dev-pool.{}", std::process::id());
            let keychain = SystemKeychain::new(&service).unwrap();
            let stored = StoredSession {
                refresh_token: renewed.refresh_token.clone(),
                device_key: device.key.clone(),
                device_group_key: device.group_key.clone(),
            };
            let saved = keychain.save(&stored).and_then(|()| keychain.load());
            keychain.clear().unwrap();
            assert_eq!(saved.unwrap().unwrap().refresh_token, renewed.refresh_token);
        }

        cognito
            .forget_device(&renewed.access_token, &device.key)
            .unwrap();
        cognito.revoke_token(&renewed.refresh_token).unwrap();
        let revoked = cognito
            .refresh(&renewed.refresh_token, &device.key)
            .unwrap_err();
        assert!(revoked.ends_session(), "{revoked}");
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "signs in to the dev pool and calls the dev API with TMW_DEV_USERNAME and TMW_DEV_PASSWORD"]
    fn a_real_session_reads_styles_and_settings_from_the_dev_api_and_signs_out() {
        use std::sync::Arc;

        use super::account::{Account, CognitoProvider, SignInStep};
        use crate::api::{AuthedApi, HttpApi};
        use crate::keychain::{Keychain, SystemKeychain};

        let (Ok(username), Ok(password), Ok(server)) = (
            std::env::var("TMW_DEV_USERNAME"),
            std::env::var("TMW_DEV_PASSWORD"),
            official_server(),
        ) else {
            eprintln!(
                "skipped: TMW_DEV_USERNAME, TMW_DEV_PASSWORD and the build's TAKE_MY_WORD_SERVER are not all set"
            );
            return;
        };
        let service = format!("dev.fless.takemyword.test.api.{}", std::process::id());
        let provider = CognitoProvider {
            cognito: Cognito::for_server(&server).unwrap(),
            device_name: "Take My Word cargo test".into(),
        };
        let account = Arc::new(Account::restore(
            provider,
            SystemKeychain::new(&service).unwrap(),
            Box::new(|_| {}),
        ));
        let step = account.sign_in(&username, Secret::new(password)).unwrap();
        assert!(matches!(step, SignInStep::SignedIn(_)));
        let api = AuthedApi::new(HttpApi::new(server.api_url.clone()).unwrap(), Arc::clone(&account));
        let styles = api.styles().unwrap().styles;
        assert!(styles.iter().any(|style| style.id == "casual"));
        let settings = api.settings().unwrap();
        assert!(
            styles
                .iter()
                .any(|style| style.id == settings.default_style_id)
        );
        account.sign_out();
        assert!(
            SystemKeychain::new(&service)
                .unwrap()
                .load()
                .unwrap()
                .is_none()
        );
        assert!(!account.is_signed_in());
    }
}
