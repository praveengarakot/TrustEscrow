#![no_std]

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, Address, Env, IntoVal, String, Vec,
};

#[derive(Clone)]
#[contracttype]
pub struct Project {
    pub client: Address,
    pub provider: Address,
    pub title: String,
    pub budget: i128,
    pub milestone_count: u32,
    pub status: u32, // 0 = Active, 1 = Completed, 2 = Disputed
    pub created_at: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct Milestone {
    pub title: String,
    pub amount: i128,
    pub status: u32, // 0 = Pending, 1 = Submitted, 2 = Approved, 3 = Disputed, 4 = Refunded
    pub proof_url: String,
    pub completed_at: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct GlobalStats {
    pub project_count: u32,
    pub total_budget: i128,
    pub active_escrow: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct ProjectCreated {
    pub project_id: u32,
    pub client: Address,
    pub provider: Address,
    pub title: String,
    pub budget: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct MilestoneSubmitted {
    pub project_id: u32,
    pub milestone_index: u32,
    pub proof_url: String,
}

#[contractevent]
#[derive(Clone)]
pub struct MilestoneApproved {
    pub project_id: u32,
    pub milestone_index: u32,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct MilestoneDisputed {
    pub project_id: u32,
    pub milestone_index: u32,
}

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Project(u32),
    Milestone(u32, u32),
    UserProjects(Address),
    GlobalStats,
    Admin,
    RewardsContract,
}

#[contract]
pub struct FocusForge;

#[contractimpl]
impl FocusForge {
    pub fn initialize(env: Env, admin: Address, rewards_contract: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::RewardsContract, &rewards_contract);

        let initial_stats = GlobalStats {
            project_count: 0,
            total_budget: 0,
            active_escrow: 0,
        };
        env.storage()
            .persistent()
            .set(&DataKey::GlobalStats, &initial_stats);
    }

    pub fn get_rewards_contract(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::RewardsContract)
            .unwrap_or_else(|| panic!("Rewards contract not configured"))
    }

    pub fn create_project(
        env: Env,
        client: Address,
        provider: Address,
        title: String,
        budget: i128,
        milestone_titles: Vec<String>,
        milestone_amounts: Vec<i128>,
    ) -> u32 {
        client.require_auth();
        assert!(budget > 0, "Budget must be greater than zero");
        assert!(
            milestone_titles.len() == milestone_amounts.len(),
            "Milestones count mismatch"
        );
        assert!(
            milestone_titles.len() > 0,
            "At least one milestone is required"
        );

        let mut sum_amount: i128 = 0;
        for amt in milestone_amounts.iter() {
            assert!(amt > 0, "Milestone amount must be positive");
            sum_amount += amt;
        }
        assert!(
            sum_amount == budget,
            "Sum of milestone amounts must match total budget"
        );

        let mut stats: GlobalStats = env
            .storage()
            .persistent()
            .get(&DataKey::GlobalStats)
            .unwrap();

        let project_id = stats.project_count;
        stats.project_count += 1;
        stats.total_budget += budget;
        stats.active_escrow += budget;
        env.storage()
            .persistent()
            .set(&DataKey::GlobalStats, &stats);

        let project = Project {
            client: client.clone(),
            provider: provider.clone(),
            title: title.clone(),
            budget,
            milestone_count: milestone_titles.len(),
            status: 0,
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id), &project);

        for i in 0..milestone_titles.len() {
            let milestone = Milestone {
                title: milestone_titles.get(i).unwrap(),
                amount: milestone_amounts.get(i).unwrap(),
                status: 0, // Pending
                proof_url: String::from_str(&env, ""),
                completed_at: 0,
            };
            env.storage()
                .persistent()
                .set(&DataKey::Milestone(project_id, i), &milestone);
        }

        // Map project to both client and provider
        Self::add_user_project(&env, &client, project_id);
        Self::add_user_project(&env, &provider, project_id);

        ProjectCreated {
            project_id,
            client,
            provider,
            title,
            budget,
        }
        .publish(&env);

        project_id
    }

    pub fn submit_milestone_proof(
        env: Env,
        provider: Address,
        project_id: u32,
        milestone_index: u32,
        proof_url: String,
    ) {
        provider.require_auth();

        let project: Project = env
            .storage()
            .persistent()
            .get(&DataKey::Project(project_id))
            .unwrap_or_else(|| panic!("Project not found"));

        assert!(
            provider == project.provider,
            "Only the service provider can submit proof"
        );

        let m_key = DataKey::Milestone(project_id, milestone_index);
        let mut milestone: Milestone = env
            .storage()
            .persistent()
            .get(&m_key)
            .unwrap_or_else(|| panic!("Milestone not found"));

        assert!(milestone.status == 0, "Milestone is not in Pending state");
        assert!(proof_url.len() > 0, "Proof URL cannot be empty");

        milestone.status = 1; // Submitted
        milestone.proof_url = proof_url.clone();
        env.storage().persistent().set(&m_key, &milestone);

        MilestoneSubmitted {
            project_id,
            milestone_index,
            proof_url,
        }
        .publish(&env);
    }

    pub fn approve_milestone(env: Env, client: Address, project_id: u32, milestone_index: u32) {
        client.require_auth();

        let mut project: Project = env
            .storage()
            .persistent()
            .get(&DataKey::Project(project_id))
            .unwrap_or_else(|| panic!("Project not found"));

        assert!(
            client == project.client,
            "Only the client can approve milestones"
        );

        let m_key = DataKey::Milestone(project_id, milestone_index);
        let mut milestone: Milestone = env
            .storage()
            .persistent()
            .get(&m_key)
            .unwrap_or_else(|| panic!("Milestone not found"));

        // Can approve either from Pending (0) or Submitted (1) or Disputed (3)
        assert!(
            milestone.status == 0 || milestone.status == 1 || milestone.status == 3,
            "Cannot approve this milestone"
        );

        milestone.status = 2; // Approved
        milestone.completed_at = env.ledger().timestamp();
        env.storage().persistent().set(&m_key, &milestone);

        // Deduct active escrow
        let mut stats: GlobalStats = env
            .storage()
            .persistent()
            .get(&DataKey::GlobalStats)
            .unwrap();
        stats.active_escrow -= milestone.amount;
        env.storage()
            .persistent()
            .set(&DataKey::GlobalStats, &stats);

        MilestoneApproved {
            project_id,
            milestone_index,
            amount: milestone.amount,
        }
        .publish(&env);

        // Check if all milestones are approved to mark project as completed
        let mut all_completed = true;
        for i in 0..project.milestone_count {
            let m: Milestone = env
                .storage()
                .persistent()
                .get(&DataKey::Milestone(project_id, i))
                .unwrap();
            if m.status != 2 && m.status != 4 {
                all_completed = false;
                break;
            }
        }
        if all_completed {
            project.status = 1; // Completed
            env.storage()
                .persistent()
                .set(&DataKey::Project(project_id), &project);
        }
    }

    pub fn dispute_milestone(env: Env, caller: Address, project_id: u32, milestone_index: u32) {
        caller.require_auth();

        let mut project: Project = env
            .storage()
            .persistent()
            .get(&DataKey::Project(project_id))
            .unwrap_or_else(|| panic!("Project not found"));

        assert!(
            caller == project.client || caller == project.provider,
            "Only client or provider can raise a dispute"
        );

        let m_key = DataKey::Milestone(project_id, milestone_index);
        let mut milestone: Milestone = env
            .storage()
            .persistent()
            .get(&m_key)
            .unwrap_or_else(|| panic!("Milestone not found"));

        assert!(
            milestone.status == 1 || milestone.status == 0,
            "Can only dispute pending or submitted milestones"
        );

        milestone.status = 3; // Disputed
        env.storage().persistent().set(&m_key, &milestone);

        project.status = 2; // Disputed
        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id), &project);

        MilestoneDisputed {
            project_id,
            milestone_index,
        }
        .publish(&env);

        // Invoke the resolution/arbitration contract via ICC
        let rewards_contract = Self::get_rewards_contract(env.clone());
        env.invoke_contract::<()>(
            &rewards_contract,
            &soroban_sdk::Symbol::new(&env, "escalate_dispute"),
            soroban_sdk::vec![
                &env,
                env.current_contract_address().into_val(&env),
                project_id.into_val(&env),
                milestone_index.into_val(&env),
                project.client.into_val(&env),
                project.provider.into_val(&env),
                milestone.amount.into_val(&env),
            ],
        );
    }

    pub fn execute_resolution(
        env: Env,
        project_id: u32,
        milestone_index: u32,
        payout_to_provider: bool,
    ) {
        let rewards_contract = Self::get_rewards_contract(env.clone());
        rewards_contract.require_auth();

        let mut project: Project = env
            .storage()
            .persistent()
            .get(&DataKey::Project(project_id))
            .unwrap_or_else(|| panic!("Project not found"));

        let m_key = DataKey::Milestone(project_id, milestone_index);
        let mut milestone: Milestone = env
            .storage()
            .persistent()
            .get(&m_key)
            .unwrap_or_else(|| panic!("Milestone not found"));

        assert!(
            milestone.status == 3,
            "Milestone is not currently in dispute"
        );

        if payout_to_provider {
            milestone.status = 2; // Approved
        } else {
            milestone.status = 4; // Refunded
        }
        milestone.completed_at = env.ledger().timestamp();
        env.storage().persistent().set(&m_key, &milestone);

        // Deduct active escrow
        let mut stats: GlobalStats = env
            .storage()
            .persistent()
            .get(&DataKey::GlobalStats)
            .unwrap();
        stats.active_escrow -= milestone.amount;
        env.storage()
            .persistent()
            .set(&DataKey::GlobalStats, &stats);

        // Check if project status can return to Active (0) or Completed (1)
        let mut all_completed = true;
        let mut has_disputes = false;
        for i in 0..project.milestone_count {
            let m: Milestone = env
                .storage()
                .persistent()
                .get(&DataKey::Milestone(project_id, i))
                .unwrap();
            if m.status != 2 && m.status != 4 {
                all_completed = false;
            }
            if m.status == 3 {
                has_disputes = true;
            }
        }

        if all_completed {
            project.status = 1; // Completed
        } else if !has_disputes {
            project.status = 0; // Active (resolved)
        }

        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id), &project);
    }

    pub fn get_project(env: Env, project_id: u32) -> Project {
        env.storage()
            .persistent()
            .get(&DataKey::Project(project_id))
            .unwrap_or_else(|| panic!("Project not found"))
    }

    pub fn get_milestone(env: Env, project_id: u32, milestone_index: u32) -> Milestone {
        env.storage()
            .persistent()
            .get(&DataKey::Milestone(project_id, milestone_index))
            .unwrap_or_else(|| panic!("Milestone not found"))
    }

    pub fn get_user_projects(env: Env, user: Address) -> Vec<u32> {
        env.storage()
            .persistent()
            .get(&DataKey::UserProjects(user))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_global_stats(env: Env) -> GlobalStats {
        env.storage()
            .persistent()
            .get(&DataKey::GlobalStats)
            .unwrap_or_else(|| GlobalStats {
                project_count: 0,
                total_budget: 0,
                active_escrow: 0,
            })
    }

    fn add_user_project(env: &Env, user: &Address, project_id: u32) {
        let key = DataKey::UserProjects(user.clone());
        let mut list: Vec<u32> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(env));
        if !list.contains(project_id) {
            list.push_back(project_id);
            env.storage().persistent().set(&key, &list);
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    // A mock contract representing the arbitration/rewards contract to test the ICC escalation and callback
    #[contract]
    pub struct MockArbitrationContract;

    #[contractimpl]
    impl MockArbitrationContract {
        pub fn initialize(env: Env, admin: Address) {
            env.storage().instance().set(&DataKey::Admin, &admin);
        }

        pub fn get_admin(env: Env) -> Address {
            env.storage().instance().get(&DataKey::Admin).unwrap()
        }

        pub fn escalate_dispute(
            env: Env,
            caller: Address,
            project_id: u32,
            _milestone_index: u32,
            client: Address,
            provider: Address,
            amount: i128,
        ) {
            let admin = Self::get_admin(env.clone());
            caller.require_auth();
            assert!(caller == admin);

            // Record dispute
            let details = (client, provider, amount);
            env.storage()
                .persistent()
                .set(&DataKey::Project(project_id), &details);
        }

        // Helper test function to trigger the callback on the main contract
        pub fn force_resolve(
            env: Env,
            main_contract: Address,
            project_id: u32,
            milestone_index: u32,
            payout: bool,
        ) {
            env.invoke_contract::<()>(
                &main_contract,
                &soroban_sdk::Symbol::new(&env, "execute_resolution"),
                soroban_sdk::vec![
                    &env,
                    project_id.into_val(&env),
                    milestone_index.into_val(&env),
                    payout.into_val(&env),
                ],
            );
        }
    }

    #[test]
    fn test_complete_escrow_workflow() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let client = Address::generate(&env);
        let provider = Address::generate(&env);

        let main_id = env.register_contract(None, FocusForge);
        let arb_id = env.register_contract(None, MockArbitrationContract);

        let main_client = FocusForgeClient::new(&env, &main_id);
        let arb_client = MockArbitrationContractClient::new(&env, &arb_id);

        main_client.initialize(&admin, &arb_id);
        arb_client.initialize(&main_id);

        let title = String::from_str(&env, "Build Website");
        let mut milestone_titles = Vec::new(&env);
        milestone_titles.push_back(String::from_str(&env, "Design"));
        milestone_titles.push_back(String::from_str(&env, "Development"));

        let mut milestone_amounts = Vec::new(&env);
        milestone_amounts.push_back(200);
        milestone_amounts.push_back(300);

        // 1. Create Project
        let project_id = main_client.create_project(
            &client,
            &provider,
            &title,
            &500,
            &milestone_titles,
            &milestone_amounts,
        );

        assert_eq!(project_id, 0);

        let project = main_client.get_project(&project_id);
        assert_eq!(project.budget, 500);
        assert_eq!(project.status, 0); // Active

        let m1 = main_client.get_milestone(&project_id, &0);
        assert_eq!(m1.amount, 200);
        assert_eq!(m1.status, 0); // Pending

        // 2. Submit proof for milestone 1
        let proof = String::from_str(&env, "https://github.com/myproof");
        main_client.submit_milestone_proof(&provider, &project_id, &0, &proof);

        let m1_updated = main_client.get_milestone(&project_id, &0);
        assert_eq!(m1_updated.status, 1); // Submitted
        assert_eq!(m1_updated.proof_url, proof);

        // 3. Client approves milestone 1
        main_client.approve_milestone(&client, &project_id, &0);
        let m1_approved = main_client.get_milestone(&project_id, &0);
        assert_eq!(m1_approved.status, 2); // Approved

        let stats = main_client.get_global_stats();
        assert_eq!(stats.active_escrow, 300); // 500 - 200 approved

        // 4. Raise dispute on milestone 2 (index 1)
        main_client.dispute_milestone(&client, &project_id, &1);
        let m2_disputed = main_client.get_milestone(&project_id, &1);
        assert_eq!(m2_disputed.status, 3); // Disputed

        let project_disputed = main_client.get_project(&project_id);
        assert_eq!(project_disputed.status, 2); // Disputed

        // 5. Force resolve milestone 2 via mock arbitration (payout to provider)
        arb_client.force_resolve(&main_id, &project_id, &1, &true);

        let m2_resolved = main_client.get_milestone(&project_id, &1);
        assert_eq!(m2_resolved.status, 2); // Approved (paid out)

        let project_final = main_client.get_project(&project_id);
        assert_eq!(project_final.status, 1); // Completed
    }
}
