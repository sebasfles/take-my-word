pub mod cognito;
mod secret;
mod srp;

pub use secret::Secret;

#[cfg(test)]
mod dev_pool {
    use time::OffsetDateTime;

    use super::Secret;
    use super::cognito::{Cognito, SignIn};
    use crate::env::DEV;

    #[test]
    #[ignore = "signs in to the dev pool with TMW_DEV_USERNAME and TMW_DEV_PASSWORD"]
    fn the_dev_pool_signs_in_confirms_refreshes_forgets_and_revokes() {
        let (Ok(username), Ok(password)) = (
            std::env::var("TMW_DEV_USERNAME"),
            std::env::var("TMW_DEV_PASSWORD"),
        ) else {
            eprintln!("skipped: TMW_DEV_USERNAME and TMW_DEV_PASSWORD are not set");
            return;
        };
        let password = Secret::new(password);
        let cognito = Cognito::for_environment(&DEV).unwrap();
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
}
