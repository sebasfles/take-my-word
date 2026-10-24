use std::fmt;
use std::time::{Duration, Instant};

pub const PAINT_DEADLINE: Duration = Duration::from_secs(1);
pub const READY_DEADLINE: Duration = Duration::from_secs(20);
const REPAIRS_WITHOUT_A_FRAME: u32 = 3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Repair {
    NoFrames,
    NeverReady,
    ProcessFailed,
}

impl fmt::Display for Repair {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::NoFrames => "a shown state painted no frame",
            Self::NeverReady => "its page never became ready",
            Self::ProcessFailed => "a WebView2 process failed",
        })
    }
}

#[derive(Debug)]
pub struct Health {
    created: Instant,
    ready: bool,
    unpainted: Option<(u64, Instant)>,
    failed: bool,
    repairs: u32,
}

impl Health {
    pub fn new(now: Instant) -> Self {
        Self {
            created: now,
            ready: false,
            unpainted: None,
            failed: false,
            repairs: 0,
        }
    }

    pub fn recreated(&mut self, now: Instant) {
        *self = Self {
            repairs: self.repairs + 1,
            ..Self::new(now)
        };
    }

    pub fn ready(&mut self) {
        self.ready = true;
    }

    pub fn is_ready(&self) -> bool {
        self.ready
    }

    pub fn shown(&mut self, seq: u64, now: Instant) {
        let since = self.unpainted.map_or(now, |(_, since)| since);
        self.unpainted = Some((seq, since));
    }

    pub fn hidden(&mut self) {
        self.unpainted = None;
    }

    pub fn painted(&mut self, seq: u64) {
        if self.unpainted.is_some_and(|(shown, _)| shown <= seq) {
            self.unpainted = None;
        }
        self.repairs = 0;
    }

    pub fn failed(&mut self) {
        self.failed = true;
    }

    pub fn gave_up(&self) -> bool {
        self.repairs >= REPAIRS_WITHOUT_A_FRAME
    }
}

pub fn verdict(health: &Health, now: Instant) -> Option<Repair> {
    if health.gave_up() {
        return None;
    }
    if health.failed {
        return Some(Repair::ProcessFailed);
    }
    if !health.ready {
        let waited = now.saturating_duration_since(health.created);
        return (waited >= READY_DEADLINE).then_some(Repair::NeverReady);
    }
    let (_, since) = health.unpainted?;
    (now.saturating_duration_since(since) >= PAINT_DEADLINE).then_some(Repair::NoFrames)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ready_at(start: Instant) -> Health {
        let mut health = Health::new(start);
        health.ready();
        health
    }

    #[test]
    fn a_shown_state_that_paints_no_frame_before_the_deadline_needs_a_new_overlay() {
        let start = Instant::now();
        let mut health = ready_at(start);
        health.shown(1, start);
        assert_eq!(verdict(&health, start + PAINT_DEADLINE / 2), None);
        assert_eq!(
            verdict(&health, start + PAINT_DEADLINE),
            Some(Repair::NoFrames)
        );
    }

    #[test]
    fn a_painted_state_keeps_the_overlay_however_long_it_stays_shown() {
        let start = Instant::now();
        let mut health = ready_at(start);
        health.shown(1, start);
        health.painted(1);
        assert_eq!(verdict(&health, start + PAINT_DEADLINE * 60), None);
    }

    #[test]
    fn later_states_do_not_postpone_the_deadline_of_an_unpainted_one() {
        let start = Instant::now();
        let mut health = ready_at(start);
        health.shown(1, start);
        health.shown(2, start + PAINT_DEADLINE / 2);
        assert_eq!(
            verdict(&health, start + PAINT_DEADLINE),
            Some(Repair::NoFrames)
        );
        health.painted(1);
        assert_eq!(
            verdict(&health, start + PAINT_DEADLINE),
            Some(Repair::NoFrames)
        );
        health.painted(2);
        assert_eq!(verdict(&health, start + PAINT_DEADLINE), None);
    }

    #[test]
    fn a_hidden_overlay_is_never_judged_on_its_frames() {
        let start = Instant::now();
        let mut health = ready_at(start);
        health.shown(1, start);
        health.hidden();
        assert_eq!(verdict(&health, start + PAINT_DEADLINE * 10), None);
    }

    #[test]
    fn a_page_still_loading_is_given_time_and_a_page_that_never_loads_is_replaced() {
        let start = Instant::now();
        let mut health = Health::new(start);
        health.shown(1, start);
        assert_eq!(verdict(&health, start + PAINT_DEADLINE * 5), None);
        assert_eq!(
            verdict(&health, start + READY_DEADLINE),
            Some(Repair::NeverReady)
        );
    }

    #[test]
    fn a_failed_webview2_process_replaces_the_overlay_even_while_hidden() {
        let start = Instant::now();
        let mut health = ready_at(start);
        health.failed();
        assert_eq!(verdict(&health, start), Some(Repair::ProcessFailed));
    }

    #[test]
    fn a_recreated_overlay_starts_over_and_waits_for_its_own_page() {
        let start = Instant::now();
        let mut health = ready_at(start);
        health.shown(1, start);
        health.failed();
        let later = start + PAINT_DEADLINE * 2;
        health.recreated(later);
        assert!(!health.is_ready());
        assert_eq!(verdict(&health, later + PAINT_DEADLINE * 5), None);
        health.ready();
        health.shown(2, later);
        assert_eq!(
            verdict(&health, later + PAINT_DEADLINE),
            Some(Repair::NoFrames)
        );
    }

    #[test]
    fn repairs_stop_after_three_overlays_without_a_frame_and_resume_once_one_paints() {
        let start = Instant::now();
        let mut health = ready_at(start);
        for seq in 1..=3 {
            health.shown(seq, start);
            assert_eq!(
                verdict(&health, start + PAINT_DEADLINE),
                Some(Repair::NoFrames)
            );
            health.recreated(start);
            health.ready();
        }
        health.shown(4, start);
        assert!(health.gave_up());
        assert_eq!(verdict(&health, start + PAINT_DEADLINE), None);
        health.painted(4);
        health.shown(5, start);
        assert_eq!(
            verdict(&health, start + PAINT_DEADLINE),
            Some(Repair::NoFrames)
        );
    }
}
