use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Clone, Default)]
pub struct Activity(Arc<AtomicUsize>);

pub struct Busy(Arc<AtomicUsize>);

impl Activity {
    pub fn start(&self) -> Busy {
        self.0.fetch_add(1, Ordering::SeqCst);
        Busy(Arc::clone(&self.0))
    }

    pub fn is_idle(&self) -> bool {
        self.0.load(Ordering::SeqCst) == 0
    }
}

impl Drop for Busy {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn busy_until_every_dictation_is_done() {
        let activity = Activity::default();
        assert!(activity.is_idle());
        let first = activity.start();
        let second = activity.start();
        drop(first);
        assert!(!activity.is_idle());
        drop(second);
        assert!(activity.is_idle());
    }
}
