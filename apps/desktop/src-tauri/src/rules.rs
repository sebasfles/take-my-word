use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use crate::api::{ApiFailure, AppRuleList, PasteKeystroke};

const STALE_AFTER: Duration = Duration::from_secs(5 * 60);

pub trait RuleSource {
    fn app_rules(&self) -> Result<AppRuleList, ApiFailure>;
}

pub trait Keystrokes {
    fn for_app(&self, app_id: Option<&str>) -> PasteKeystroke;
}

#[derive(Default)]
pub struct RuleCache(Mutex<State>);

#[derive(Default)]
struct State {
    keystrokes: HashMap<String, PasteKeystroke>,
    loaded_at: Option<Instant>,
    refreshing: bool,
}

impl RuleCache {
    fn state(&self) -> MutexGuard<'_, State> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn load(&self, source: &impl RuleSource) {
        let started = Instant::now();
        let loaded = source.app_rules();
        let mut state = self.state();
        state.refreshing = false;
        match loaded {
            Ok(list) => {
                state.keystrokes = list
                    .rules
                    .into_iter()
                    .map(|rule| (rule.app_id.to_lowercase(), rule.keystroke))
                    .collect();
                state.loaded_at = Some(started);
                log::info!("loaded {} app rules", state.keystrokes.len());
            }
            Err(failure) => log::warn!("loading the app rules failed: {failure}"),
        }
    }

    pub fn claim_refresh(&self, now: Instant) -> bool {
        let mut state = self.state();
        let stale = state
            .loaded_at
            .is_none_or(|loaded| now.duration_since(loaded) >= STALE_AFTER);
        if !stale || state.refreshing {
            return false;
        }
        state.refreshing = true;
        true
    }

    pub fn clear(&self) {
        let mut state = self.state();
        state.keystrokes.clear();
        state.loaded_at = None;
    }
}

impl Keystrokes for RuleCache {
    fn for_app(&self, app_id: Option<&str>) -> PasteKeystroke {
        app_id
            .and_then(|app_id| self.state().keystrokes.get(&app_id.to_lowercase()).copied())
            .unwrap_or_default()
    }
}

impl<K: Keystrokes + ?Sized> Keystrokes for std::sync::Arc<K> {
    fn for_app(&self, app_id: Option<&str>) -> PasteKeystroke {
        (**self).for_app(app_id)
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use super::*;
    use crate::api::AppRule;

    struct Source(Result<Vec<(&'static str, PasteKeystroke)>, ()>, Cell<u32>);

    impl RuleSource for Source {
        fn app_rules(&self) -> Result<AppRuleList, ApiFailure> {
            self.1.set(self.1.get() + 1);
            let rules = self
                .0
                .clone()
                .map_err(|()| ApiFailure::Network("offline".into()))?;
            Ok(AppRuleList {
                rules: rules
                    .into_iter()
                    .map(|(app_id, keystroke)| AppRule {
                        id: app_id.into(),
                        app_id: app_id.into(),
                        style_id: None,
                        keystroke,
                    })
                    .collect(),
            })
        }
    }

    fn source(rules: Vec<(&'static str, PasteKeystroke)>) -> Source {
        Source(Ok(rules), Cell::new(0))
    }

    #[test]
    fn the_target_app_gets_its_rule_keystroke_and_any_other_app_ctrl_v() {
        let cache = RuleCache::default();
        cache.load(&source(vec![
            ("notepad.exe", PasteKeystroke::ShiftInsert),
            ("windowsterminal.exe", PasteKeystroke::CtrlShiftV),
        ]));
        assert_eq!(
            cache.for_app(Some("Notepad.exe")),
            PasteKeystroke::ShiftInsert
        );
        assert_eq!(
            cache.for_app(Some("windowsterminal.exe")),
            PasteKeystroke::CtrlShiftV
        );
        assert_eq!(cache.for_app(Some("code.exe")), PasteKeystroke::CtrlV);
        assert_eq!(cache.for_app(None), PasteKeystroke::CtrlV);
    }

    #[test]
    fn a_failed_reload_keeps_the_rules_already_known() {
        let cache = RuleCache::default();
        cache.load(&source(vec![("notepad.exe", PasteKeystroke::ShiftInsert)]));
        cache.load(&Source(Err(()), Cell::new(0)));
        assert_eq!(
            cache.for_app(Some("notepad.exe")),
            PasteKeystroke::ShiftInsert
        );
    }

    #[test]
    fn signing_out_forgets_the_rules() {
        let cache = RuleCache::default();
        cache.load(&source(vec![("notepad.exe", PasteKeystroke::ShiftInsert)]));
        cache.clear();
        assert_eq!(cache.for_app(Some("notepad.exe")), PasteKeystroke::CtrlV);
    }

    #[test]
    fn a_refresh_is_claimed_once_and_only_when_the_rules_are_old() {
        let cache = RuleCache::default();
        let start = Instant::now();
        assert!(cache.claim_refresh(start));
        assert!(!cache.claim_refresh(start), "a second hold while loading");
        cache.load(&source(vec![]));
        assert!(!cache.claim_refresh(Instant::now() + Duration::from_secs(60)));
        assert!(cache.claim_refresh(Instant::now() + STALE_AFTER));
    }

    #[test]
    fn a_failed_refresh_can_be_claimed_again() {
        let cache = RuleCache::default();
        assert!(cache.claim_refresh(Instant::now()));
        cache.load(&Source(Err(()), Cell::new(0)));
        assert!(cache.claim_refresh(Instant::now()));
    }
}
