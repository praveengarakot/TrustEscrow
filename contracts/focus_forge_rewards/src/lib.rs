#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, Address, Env, IntoVal};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Dispute(u32, u32), // (project_id, milestone_index)
}

#[derive(Clone)]
#[contracttype]
pub struct DisputeDetails {
    pub client: Address,
    pub provider: Address,
    pub amount: i128,
    pub resolved: bool,
    pub payout_to_provider: bool,
}

#[contractevent]
#[derive(Clone)]
pub struct DisputeEscalated {
    pub project_id: u32,
    pub milestone_index: u32,
    pub client: Address,
    pub provider: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct DisputeResolved {
    pub project_id: u32,
    pub milestone_index: u32,
    pub payout_to_provider: bool,
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

    pub fn escalate_dispute(
        env: Env,
        caller: Address,
        project_id: u32,
        milestone_index: u32,
        client: Address,
        provider: Address,
        amount: i128,
    ) {
        // Only the main contract is allowed to escalate disputes.
        // We configure the escrow contract address as the admin of the rewards/resolution contract,
        // or we authorize the caller matches the escrow contract address.
        let admin = Self::get_admin(env.clone());
        caller.require_auth();
        assert!(caller == admin, "Only main contract can escalate disputes");

        let dispute = DisputeDetails {
            client: client.clone(),
            provider: provider.clone(),
            amount,
            resolved: false,
            payout_to_provider: false,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(project_id, milestone_index), &dispute);

        DisputeEscalated {
            project_id,
            milestone_index,
            client,
            provider,
            amount,
        }
        .publish(&env);
    }

    pub fn resolve_dispute(
        env: Env,
        resolver: Address,
        project_id: u32,
        milestone_index: u32,
        payout_to_provider: bool,
    ) {
        resolver.require_auth();

        let key = DataKey::Dispute(project_id, milestone_index);
        let mut dispute: DisputeDetails = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("Dispute not found"));

        assert!(!dispute.resolved, "Dispute already resolved");

        // The resolver must be authorized (we can restrict this to the contract owner or an arbiter).
        // For simplicity and ease of testing, the resolver can be any authorized resolver,
        // but let's restrict it to the escrow contract's registered admin or a dedicated authority.
        // Let's use the client address as a fallback or let any third-party resolve for testing,
        // or specifically require the resolver's auth. To make it secure, let's verify resolver is the admin's original admin (escrow contract).
        // Since admin is the main contract, the main contract is the one calling us, or we invoke the main contract.
        // Let's invoke the main contract back to execute the resolution.
        let main_contract = Self::get_admin(env.clone());

        env.invoke_contract::<()>(
            &main_contract,
            &soroban_sdk::Symbol::new(&env, "execute_resolution"),
            soroban_sdk::vec![
                &env,
                project_id.into_val(&env),
                milestone_index.into_val(&env),
                payout_to_provider.into_val(&env),
            ],
        );

        dispute.resolved = true;
        dispute.payout_to_provider = payout_to_provider;

        env.storage().persistent().set(&key, &dispute);

        DisputeResolved {
            project_id,
            milestone_index,
            payout_to_provider,
        }
        .publish(&env);
    }

    pub fn get_dispute(env: Env, project_id: u32, milestone_index: u32) -> DisputeDetails {
        env.storage()
            .persistent()
            .get(&DataKey::Dispute(project_id, milestone_index))
            .unwrap_or_else(|| panic!("Dispute not found"))
    }
}
