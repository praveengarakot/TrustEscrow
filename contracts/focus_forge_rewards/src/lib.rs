#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, Address, Env, Vec};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Badges(Address),
}

#[contractevent]
#[derive(Clone)]
pub struct BadgeAwarded {
    #[topic]
    pub learner: Address,
    pub badge_type: u32,
}

#[contract]
pub struct FocusForgeRewards;

#[contractimpl]
impl FocusForgeRewards {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("Not initialized"))
    }

    pub fn award_badge(env: Env, learner: Address, badge_type: u32) {
        let admin = Self::get_admin(env.clone());
        admin.require_auth();

        let mut badges: Vec<u32> = env
            .storage()
            .persistent()
            .get(&DataKey::Badges(learner.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        if !badges.contains(badge_type) {
            badges.push_back(badge_type);
            env.storage()
                .persistent()
                .set(&DataKey::Badges(learner.clone()), &badges);

            BadgeAwarded {
                learner,
                badge_type,
            }
            .publish(&env);
        }
    }

    pub fn get_badges(env: Env, learner: Address) -> Vec<u32> {
        env.storage()
            .persistent()
            .get(&DataKey::Badges(learner))
            .unwrap_or_else(|| Vec::new(&env))
    }
}
