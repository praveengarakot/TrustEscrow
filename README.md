# TrustEscrow

[![CI](https://github.com/barish245/ForgeMind/actions/workflows/ci.yml/badge.svg)](https://github.com/barish245/ForgeMind/actions/workflows/ci.yml)

TrustEscrow is a Stellar Soroban milestone-based escrow and decentralized dispute arbitration platform. Freelancers and clients lock up deliverable payments securely in escrow accounts, submit verified milestones proofs, and resolve disputes transparently through a secondary arbitration contract via Inter-Contract Communication (ICC).

### 🔴 The Problem
In the Web2 gig economy, freelancers and remote workers face significant financial friction:
- **Payment Default & Delay**: Freelancers frequently experience clients who default on payments, delay payouts, or refuse to pay after the work is delivered.
- **High Intermediary Fees**: Established platforms like Upwork or Fiverr charge exorbitant fees (10% to 20%), cutting deep into freelancer profits.
- **Counterparty Risk**: Clients are hesitant to pay upfront due to quality concerns, while freelancers are reluctant to start work without financial assurance.

### 🟢 The Solution
TrustEscrow solves these issues by establishing a trustless, milestone-based escrow system utilizing Stellar's ultra-low transaction costs and Soroban's smart contracts:
- **Secure Milestone Locking**: Clients fund the agreement budget directly into the smart contract's escrow vault, guaranteeing the freelancer that funds are secured.
- **Permissionless Payments**: Payouts are organized in stages (milestones) and released immediately upon client approval.
- **Decentralized Dispute Resolution**: If work is disputed, funds are locked under arbitration. A secondary Resolution contract settles the dispute and executes settlement payouts back to the main contract using Inter-Contract Communication (ICC).
- **Fractional Costs**: Transactions cost fractions of a cent, allowing freelancers to keep 99.9% of their earnings.


## Live Submission Links

- Public repository: [GitHub Repository](https://github.com/barish245/ForgeMind)
- Live demo: [trust-escrow-stellar.vercel.app](https://trust-escrow-stellar.vercel.app/)
- Vercel production deployment: [Vercel Deployment](https://trust-escrow-stellar.vercel.app/)
- MVP video: [Google Drive Link](https://drive.google.com/file/d/1iRB13e5epj26x_lZseANvQrTQveuI1LT/view?usp=sharing)

## Screenshots

### Desktop UI

![TrustEscrow desktop UI](./SUBMISSION%20ASSETS/UI.png)

### Mobile UI

![TrustEscrow mobile UI](./SUBMISSION%20ASSETS/mobui.png)

### CI/CD

![TrustEscrow CI/CD](./SUBMISSION%20ASSETS/cicd.png)

## Project Overview

TrustEscrow secures freelancing gig payments on-chain. Each wallet can:

- **New Agreement**: Clients define provider wallets, titles, total budgets, and create custom milestone breakdowns with locking funds.
- **Provider Hub**: Freelancers inspect project requirements, trace deliverables status, and submit proof URLs to lock in milestones for review.
- **Client Hub**: Clients review submitted deliverables, release milestone payouts, or raise disputes to lock funds under arbitration.
- **Arbitration Desk**: Community validators or designated admins vote and settle disputed milestones to execute callback payouts via ICC.
- **RPC Event Streaming**: Real-time polling for project creation, proof submissions, approvals, and dispute actions directly from Soroban RPC.

## Architecture

### Smart Contracts

#### Main Escrow Contract: `contracts/focus_forge`
Handles agreements setup, escrow deposits, deliverable logging, and releases.
Methods:
- `create_project(client, provider, title, budget, milestone_titles, milestone_amounts)`
- `submit_milestone_proof(provider, project_id, milestone_index, proof_url)`
- `approve_milestone(client, project_id, milestone_index)`
- `dispute_milestone(caller, project_id, milestone_index)`
- `execute_resolution(project_id, milestone_index, payout_to_provider)` (called via ICC from the arbitration contract)
- `get_project(project_id)`
- `get_milestone(project_id, milestone_index)`
- `get_user_projects(user)`
- `get_global_stats()`

#### Arbitration Contract: `contracts/focus_forge_rewards`
Manages dispute escalation records and executes settlements.
Methods:
- `escalate_dispute(caller, project_id, milestone_index, client, provider, amount)` (called via ICC from main contract)
- `resolve_dispute(resolver, project_id, milestone_index, payout_to_provider)`
- `get_dispute(project_id, milestone_index)`

### Frontend

Location: [`frontend/src`](./frontend/src)
- React + Vite + TanStack Query + Freighter Wallet.
- Responsive, swipeable dark monochromatic UI built with pure vanilla CSS.

## Contract Deployment

- Network: `Stellar Testnet`
- Escrow Contract ID: [CB5DJ2W5RYFQXVUMONNWUKTXMK7FINUKJI4RVMAPMPZ4OK4ADNO7SXLB](https://lab.stellar.org/r/testnet/contract/CB5DJ2W5RYFQXVUMONNWUKTXMK7FINUKJI4RVMAPMPZ4OK4ADNO7SXLB)
- Arbitration Contract ID: [CBPTXWCNCRZC53SV2J2DC5EZKF4VMGSBMVAIQTPRGR57QQPQ553T6W3X](https://lab.stellar.org/r/testnet/contract/CBPTXWCNCRZC53SV2J2DC5EZKF4VMGSBMVAIQTPRGR57QQPQ553T6W3X)
- Deployment record: [deployments/testnet.json](./deployments/testnet.json)

Deployment transactions:
- Soroban Arbitration Deploy TX: [4f2c1ce347f2f501bd4867d64767ae0b0e7a974cf977c7161c95001a08cdca64](https://stellar.expert/explorer/testnet/tx/4f2c1ce347f2f501bd4867d64767ae0b0e7a974cf977c7161c95001a08cdca64)
- Soroban Escrow Deploy TX: [4ae85dfca86d7700208d5f16ea06257991cc4c741993f410e7e0e973141b0a35](https://stellar.expert/explorer/testnet/tx/4ae85dfca86d7700208d5f16ea06257991cc4c741993f410e7e0e973141b0a35)
- Arbitration Initialize TX: [5c48b37559807d2308b2dc177248879513c7603965c51319bc6d0de26d550de2](https://stellar.expert/explorer/testnet/tx/5c48b37559807d2308b2dc177248879513c7603965c51319bc6d0de26d550de2)
- Escrow Initialize TX: [4385e4a1fee493c338712e2be3034f6c75a19bad68c976d6909a85adc2f3224a](https://stellar.expert/explorer/testnet/tx/4385e4a1fee493c338712e2be3034f6c75a19bad68c976d6909a85adc2f3224a)

## CI/CD

GitHub Actions workflow: [`ci.yml`](./.github/workflows/ci.yml)
The pipeline runs:
- `npm ci`
- `cargo fmt --all --check`
- `cargo test`
- `cargo build --target wasm32v1-none --release -p focus_forge`
- `npm run lint`
- `npm run build:frontend`

## Local Setup

### 1. Install dependencies
```powershell
npm install
```

### 2. Run contract validation
```powershell
npm run contract:check
```

### 3. Build the frontend bundle
```powershell
npm run build:frontend
```

### 4. Start the app locally
```powershell
npm run dev
```

## Build, Test, and Deploy Commands

### Contract build
```powershell
npm run contract:build
```

### Contract deploy
```powershell
$env:STELLAR_ACCOUNT='alice'
$env:STELLAR_NETWORK='testnet'
$env:STELLAR_CONTRACT_ALIAS='focus_forge'
npm run contract:deploy
```

### Export frontend config from the deployment record
```powershell
npm run export:frontend
```

### Frontend production build
```powershell
npm run build:frontend
```

### Vercel production deploy
```powershell
npx --yes --package vercel vercel deploy --prod --yes --logs
```

## Verification Steps

### Contract verification
```powershell
stellar contract invoke --id CB5DJ2W5RYFQXVUMONNWUKTXMK7FINUKJI4RVMAPMPZ4OK4ADNO7SXLB --source-account alice --network testnet -- get_global_stats
```

### Frontend verification
1. Open the live demo.
2. Connect Freighter on Stellar Testnet.
3. Lock funds and setup a new milestone agreement.
4. From the Provider/Client dashboard, submit proofs, release milestones, or trigger disputes.
5. Track events streaming live from the contract.

## Inter-contract Calls and Token/Pool Notes

- Inter-contract calls: `Fully implemented. Disputed milestones trigger automatic dispute escalation on the arbitration contract, and settling disputes calls the main escrow contract back via ICC callback.`
- Custom token deployed: `No (using virtual USD credit reserves for instant usability)`
- Liquidity pool deployed: `No`
- Token or pool address: `Not applicable`

## Submission Checklist

- Public GitHub repository: `Yes`
- Complete README: `Yes`
- Live demo link included: `Yes`
- Mobile responsive screenshot included: `Yes`
- CI badge included: `Yes`
- Contract address documented: `Yes`
- Deployment transaction hashes documented: `Yes`
- Inter-contract call note included: `Yes`
- Token/pool note included: `Yes`
- Live frontend deployed: `Yes`
- Minimum 10+ meaningful commits: `Yes`
