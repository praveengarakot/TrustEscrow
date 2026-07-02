#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, Address, Env, String};

const DAY_IN_SECONDS: u64 = 86_400;
const WEEK_IN_SECONDS: u64 = 604_800;

pub const MIN_SESSION_MINUTES: u32 = 5;
pub const MAX_SESSION_MINUTES: u32 = 480;
pub const MIN_GOAL_MINUTES: u32 = 30;
pub const MAX_GOAL_MINUTES: u32 = 5_000;

#[derive(Clone)]
#[contracttype]
pub struct LearnerProfile {
    pub display_name: String,
    pub created_at: u64,
    pub last_study_day: u64,
    pub active_week: u64,
    pub weekly_goal_minutes: u32,
    pub total_minutes: u32,
    pub minutes_this_week: u32,
    pub session_count: u32,
    pub current_streak: u32,
}

#[derive(Clone)]
#[contracttype]
pub struct StudySession {
    pub topic: String,
    pub minutes_spent: u32,
    pub timestamp: u64,
    pub streak_after_log: u32,
}

#[derive(Clone)]
#[contracttype]
pub struct Dashboard {
    pub display_name: String,
    pub weekly_goal_minutes: u32,
    pub total_minutes: u32,
    pub minutes_this_week: u32,
    pub session_count: u32,
    pub current_streak: u32,
    pub created_at: u64,
    pub goal_reached_this_week: bool,
}

#[contractevent]
#[derive(Clone)]
pub struct ProfileSaved {
    #[topic]
    pub learner: Address,
    pub display_name: String,
    pub weekly_goal_minutes: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct WeeklyGoalUpdated {
    #[topic]
    pub learner: Address,
    pub weekly_goal_minutes: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct StudySessionLogged {
    #[topic]
    pub learner: Address,
    pub topic: String,
    pub minutes_spent: u32,
    pub minutes_this_week: u32,
    pub current_streak: u32,
}

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Profile(Address),
    Session(Address, u32),
}

#[contract]
pub struct FocusForge;

#[contractimpl]
impl FocusForge {
    pub fn save_profile(env: Env, learner: Address, display_name: String, weekly_goal_minutes: u32) {
        learner.require_auth();
        validate_display_name(&display_name);
        validate_weekly_goal(weekly_goal_minutes);

        let now = env.ledger().timestamp();
        let current_week = current_week(&env);

        let mut profile = read_profile_optional(&env, &learner).unwrap_or(LearnerProfile {
            display_name: display_name.clone(),
            created_at: now,
            last_study_day: 0,
            active_week: current_week,
            weekly_goal_minutes,
            total_minutes: 0,
            minutes_this_week: 0,
            session_count: 0,
            current_streak: 0,
        });

        sync_week(&mut profile, current_week);
        profile.display_name = display_name.clone();
        profile.weekly_goal_minutes = weekly_goal_minutes;

        write_profile(&env, &learner, &profile);
        ProfileSaved {
            learner,
            display_name,
            weekly_goal_minutes,
        }
        .publish(&env);
    }

    pub fn update_weekly_goal(env: Env, learner: Address, new_goal_minutes: u32) {
        learner.require_auth();
        validate_weekly_goal(new_goal_minutes);

        let mut profile = read_profile_required(&env, &learner);
        sync_week(&mut profile, current_week(&env));
        profile.weekly_goal_minutes = new_goal_minutes;

        write_profile(&env, &learner, &profile);
        WeeklyGoalUpdated {
            learner,
            weekly_goal_minutes: new_goal_minutes,
        }
        .publish(&env);
    }

    pub fn log_session(env: Env, learner: Address, topic: String, minutes_spent: u32) {
        learner.require_auth();
        validate_topic(&topic);
        validate_session_minutes(minutes_spent);

        let mut profile = read_profile_required(&env, &learner);
        sync_week(&mut profile, current_week(&env));

        let current_day = current_day(&env);
        if profile.session_count == 0 {
            profile.current_streak = 1;
        } else if current_day == profile.last_study_day {
        } else if current_day == profile.last_study_day + 1 {
            profile.current_streak += 1;
        } else {
            profile.current_streak = 1;
        }

        profile.last_study_day = current_day;
        profile.total_minutes += minutes_spent;
        profile.minutes_this_week += minutes_spent;

        let session = StudySession {
            topic: topic.clone(),
            minutes_spent,
            timestamp: env.ledger().timestamp(),
            streak_after_log: profile.current_streak,
        };

        write_session(&env, &learner, profile.session_count, &session);
        profile.session_count += 1;
        write_profile(&env, &learner, &profile);

        StudySessionLogged {
            learner,
            topic,
            minutes_spent,
            minutes_this_week: profile.minutes_this_week,
            current_streak: profile.current_streak,
        }
        .publish(&env);
    }

    pub fn has_profile(env: Env, learner: Address) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Profile(learner))
    }

    pub fn get_dashboard(env: Env, learner: Address) -> Dashboard {
        let mut profile = read_profile_required(&env, &learner);
        if current_week(&env) > profile.active_week {
            profile.minutes_this_week = 0;
        }

        Dashboard {
            display_name: profile.display_name,
            weekly_goal_minutes: profile.weekly_goal_minutes,
            total_minutes: profile.total_minutes,
            minutes_this_week: profile.minutes_this_week,
            session_count: profile.session_count,
            current_streak: profile.current_streak,
            created_at: profile.created_at,
            goal_reached_this_week: profile.minutes_this_week >= profile.weekly_goal_minutes,
        }
    }

    pub fn get_session_count(env: Env, learner: Address) -> u32 {
        read_profile_optional(&env, &learner)
            .map(|profile| profile.session_count)
            .unwrap_or(0)
    }

    pub fn get_session(env: Env, learner: Address, index: u32) -> StudySession {
        let count = Self::get_session_count(env.clone(), learner.clone());
        assert!(index < count, "Session index out of bounds");

        env.storage()
            .persistent()
            .get(&DataKey::Session(learner, index))
            .unwrap_or_else(|| panic!("Session not found"))
    }
}

fn read_profile_optional(env: &Env, learner: &Address) -> Option<LearnerProfile> {
    env.storage()
        .persistent()
        .get(&DataKey::Profile(learner.clone()))
}

fn read_profile_required(env: &Env, learner: &Address) -> LearnerProfile {
    read_profile_optional(env, learner).unwrap_or_else(|| panic!("Profile not found"))
}

fn write_profile(env: &Env, learner: &Address, profile: &LearnerProfile) {
    env.storage()
        .persistent()
        .set(&DataKey::Profile(learner.clone()), profile);
}

fn write_session(env: &Env, learner: &Address, index: u32, session: &StudySession) {
    env.storage()
        .persistent()
        .set(&DataKey::Session(learner.clone(), index), session);
}

fn sync_week(profile: &mut LearnerProfile, current_week: u64) {
    if current_week > profile.active_week {
        profile.active_week = current_week;
        profile.minutes_this_week = 0;
    }
}

fn current_week(env: &Env) -> u64 {
    env.ledger().timestamp() / WEEK_IN_SECONDS
}

fn current_day(env: &Env) -> u64 {
    env.ledger().timestamp() / DAY_IN_SECONDS
}

fn validate_display_name(display_name: &String) {
    let length = display_name.len();
    assert!(length >= 3 && length <= 32, "Display name must be 3-32 chars");
}

fn validate_topic(topic: &String) {
    let length = topic.len();
    assert!(length >= 3 && length <= 48, "Topic must be 3-48 chars");
}

fn validate_session_minutes(minutes_spent: u32) {
    assert!(
        (MIN_SESSION_MINUTES..=MAX_SESSION_MINUTES).contains(&minutes_spent),
        "Session minutes out of range"
    );
}

fn validate_weekly_goal(weekly_goal_minutes: u32) {
    assert!(
        (MIN_GOAL_MINUTES..=MAX_GOAL_MINUTES).contains(&weekly_goal_minutes),
        "Weekly goal out of range"
    );
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};

    fn setup() -> (Env, FocusForgeClient<'static>, Address) {
        let env = Env::default();
        let contract_id = env.register(FocusForge, ());
        let client = FocusForgeClient::new(&env, &contract_id);
        let learner = Address::generate(&env);
        env.mock_all_auths();
        (env, client, learner)
    }

    fn text(env: &Env, value: &str) -> String {
        String::from_str(env, value)
    }

    #[test]
    fn creates_profile_and_reads_dashboard() {
        let (env, client, learner) = setup();

        client.save_profile(&learner, &text(&env, "Deep Builder"), &360);
        let dashboard = client.get_dashboard(&learner);

        assert_eq!(dashboard.display_name, text(&env, "Deep Builder"));
        assert_eq!(dashboard.weekly_goal_minutes, 360);
        assert_eq!(dashboard.total_minutes, 0);
        assert!(!dashboard.goal_reached_this_week);
    }

    #[test]
    fn logs_sessions_and_grows_streak_across_days() {
        let (env, client, learner) = setup();

        client.save_profile(&learner, &text(&env, "Protocol Pilot"), &300);
        client.log_session(&learner, &text(&env, "Rust basics"), &90);

        env.ledger().set_timestamp(DAY_IN_SECONDS + 90);
        client.log_session(&learner, &text(&env, "Soroban auth"), &45);

        let dashboard = client.get_dashboard(&learner);
        let session = client.get_session(&learner, &1);

        assert_eq!(dashboard.total_minutes, 135);
        assert_eq!(dashboard.minutes_this_week, 135);
        assert_eq!(dashboard.session_count, 2);
        assert_eq!(dashboard.current_streak, 2);
        assert_eq!(session.topic, text(&env, "Soroban auth"));
        assert_eq!(session.minutes_spent, 45);
    }

    #[test]
    fn resets_weekly_progress_after_boundary() {
        let (env, client, learner) = setup();

        client.save_profile(&learner, &text(&env, "Weekly Runner"), &240);
        client.log_session(&learner, &text(&env, "Storage design"), &120);

        env.ledger().set_timestamp(WEEK_IN_SECONDS + DAY_IN_SECONDS);
        let dashboard = client.get_dashboard(&learner);

        assert_eq!(dashboard.minutes_this_week, 0);
        assert_eq!(dashboard.total_minutes, 120);
    }

    #[test]
    #[should_panic(expected = "Profile not found")]
    fn rejects_missing_profile_session_logs() {
        let (env, client, learner) = setup();
        client.log_session(&learner, &text(&env, "No profile yet"), &60);
    }

    #[test]
    #[should_panic(expected = "Display name must be 3-32 chars")]
    fn rejects_short_display_names() {
        let (env, client, learner) = setup();
        client.save_profile(&learner, &text(&env, "AB"), &200);
    }

    #[test]
    #[should_panic(expected = "Session minutes out of range")]
    fn rejects_short_sessions() {
        let (env, client, learner) = setup();
        client.save_profile(&learner, &text(&env, "Focus Friend"), &200);
        client.log_session(&learner, &text(&env, "Edge case"), &4);
    }

    #[test]
    #[should_panic(expected = "Weekly goal out of range")]
    fn rejects_bad_goal_updates() {
        let (env, client, learner) = setup();
        client.save_profile(&learner, &text(&env, "Goal Guard"), &200);
        client.update_weekly_goal(&learner, &20);
    }
}
