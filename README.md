# ForgeMind

[![CI](https://github.com/barish245/focusforge-ledger/actions/workflows/ci.yml/badge.svg)](https://github.com/barish245/focusforge-ledger/actions/workflows/ci.yml)

ForgeMind is a Stellar Soroban Level 4 submission for tracking deep-work sessions on-chain. Operators connect Freighter, create a public profile, set a weekly target, log verified sessions, and monitor both personal progress and contract-wide activity from a responsive production frontend.

## Live Submission Links

- Public repository: [GitHub Repository](https://github.com/barish245/focusforge-ledger)
- Live demo: [focusforge-ledger-ten.vercel.app](https://focusforge-ledger-ten.vercel.app)
- Vercel production deployment: [Vercel Deployment](https://focusforge-ledger-ten.vercel.app)
- MVP video: [Google Drive Link](https://drive.google.com/file/d/1xyK2LiGWx28mTAtYsqhwQx4VmmjJMb_0/view?usp=sharing)

## Screenshots

### Desktop UI

![ForgeMind desktop UI](./SUBMISSION%20ASSETS/UI.png)

### Mobile UI

![ForgeMind mobile UI](./SUBMISSION%20ASSETS/mobui.png)

### CI/CD

![ForgeMind CI/CD](./SUBMISSION%20ASSETS/cicd.png)

## Project Overview

ForgeMind helps a learner or builder prove focused work on-chain. Each wallet can:

- Create or update a profile with a public display name
- Set a weekly goal in minutes
- Log deep-work sessions on Soroban
- Track total minutes, minutes this week, session count, and streak momentum
- Inspect network-wide stats for the whole contract
- Watch recent contract activity pulled from Soroban RPC

## Architecture

### Smart contract

Location: [`contracts/focus_forge/src/lib.rs`](./contracts/focus_forge/src/lib.rs)

Contract methods:

- `save_profile(learner, display_name, weekly_goal_minutes)`
- `update_weekly_goal(learner, new_goal_minutes)`
- `log_session(learner, topic, minutes_spent)`
- `get_dashboard(learner)`
- `get_global_stats()`
- `get_session_count(learner)`
- `get_session(learner, index)`
- `has_profile(learner)`

Stored contract data:

- Per-wallet learner profile
- Per-wallet session history
- Weekly progress counters
- Consecutive-day streak data
- Global contract stats across all learners and sessions

Validation rules:

- Display name: `3-32` characters
- Topic: `3-48` characters
- Session length: `5-480` minutes
- Weekly goal: `30-5000` minutes

### Frontend

Location: [`frontend/src`](./frontend/src)

Frontend stack:

- React + Vite
- TanStack Query
- Freighter wallet integration
- Soroban RPC reads and writes through `@stellar/stellar-sdk`

Frontend production upgrades in this Level 4 pass:

- live contract-wide stats panel
- recent contract event polling from Soroban RPC
- deterministic contract config export for cleaner builds
- real ESLint setup
- better mobile layout handling
- clearer contract and RPC visibility for operators

## Contract Deployment

- Network: `Stellar Testnet`
- Ledger Contract ID: [CC3HYOJYCACHERMGLTXQZ433GUEFBQGZBKCFCFK7TODUQWG6VYVRXZHE](https://lab.stellar.org/r/testnet/contract/CC3HYOJYCACHERMGLTXQZ433GUEFBQGZBKCFCFK7TODUQWG6VYVRXZHE)
- Rewards Contract ID: [CDCO54FPIDLEPEM7QEM27I5G5W3TS6S3AWPF367ZU25CSBCX3SDUPUCA](https://lab.stellar.org/r/testnet/contract/CDCO54FPIDLEPEM7QEM27I5G5W3TS6S3AWPF367ZU25CSBCX3SDUPUCA)
- Deployment record: [deployments/testnet.json](./deployments/testnet.json)

Deployment transactions:

- Soroban Rewards Deploy TX: [94db394d4ff488e44c27faea513e8062fa3534678b759167857524d23e2e1110](https://stellar.expert/explorer/testnet/tx/94db394d4ff488e44c27faea513e8062fa3534678b759167857524d23e2e1110)
- Soroban Ledger Deploy TX: [1b962926b8baee8160786b0538ae043b2f9c0b842796320f772f8633d6f6bab9](https://stellar.expert/explorer/testnet/tx/1b962926b8baee8160786b0538ae043b2f9c0b842796320f772f8633d6f6bab9)
- Rewards Initialize TX: [f11d4df173e396f14dc2bea42032b5c36731d3481479fc9da5acd6b0686832e8](https://stellar.expert/explorer/testnet/tx/f11d4df173e396f14dc2bea42032b5c36731d3481479fc9da5acd6b0686832e8)
- Ledger Initialize TX: [de571228c5f7a1bd35b34c14c225b0c5f63b7574d365580203409a54bcb927a8](https://stellar.expert/explorer/testnet/tx/de571228c5f7a1bd35b34c14c225b0c5f63b7574d365580203409a54bcb927a8)

## CI/CD

GitHub Actions workflow: [`ci.yml`](./.github/workflows/ci.yml)

The pipeline runs:

- `npm ci`
- `cargo fmt --all --check`
- `cargo test`
- `cargo build --target wasm32v1-none --release -p focus_forge`
- `npm run lint`
- `npm run build:frontend`

CI badge:

[![CI](https://github.com/barish245/focusforge-ledger/actions/workflows/ci.yml/badge.svg)](https://github.com/barish245/focusforge-ledger/actions/workflows/ci.yml)

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

### 5. Optional environment file

Copy `.env.example` to `.env` if you want to override defaults:

```env
STELLAR_ACCOUNT=alice
STELLAR_NETWORK=testnet
STELLAR_CONTRACT_ALIAS=focus_forge
VITE_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
VITE_CONTRACT_ID=CC3HYOJYCACHERMGLTXQZ433GUEFBQGZBKCFCFK7TODUQWG6VYVRXZHE
VITE_REWARDS_CONTRACT_ID=CDCO54FPIDLEPEM7QEM27I5G5W3TS6S3AWPF367ZU25CSBCX3SDUPUCA
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
stellar contract invoke --id CAZBNW7LNKRGNYZVDUB4DCWSZHEFBICEJEFBY4XURGCHVNLOPLQPWEDZ --source-account alice --network testnet -- get_global_stats
stellar contract invoke --id CAZBNW7LNKRGNYZVDUB4DCWSZHEFBICEJEFBY4XURGCHVNLOPLQPWEDZ --source-account alice --network testnet -- get_dashboard --learner GAOIB7NPO2XP5AM3OXTQL3FR5WA444UPISMYZ2VZGOSGNGICSBWWO3MM
```

### Frontend verification

1. Open the live demo.
2. Confirm the contract snapshot shows the current testnet contract ID.
3. Connect Freighter on Stellar Testnet.
4. Save a profile or log a session.
5. Confirm the transaction link opens in Stellar Expert.
6. Confirm the recent contract activity panel refreshes with new events.

## Inter-contract Calls and Token/Pool Notes

- Inter-contract calls: `Fully implemented. Study sessions logged dynamically trigger badge awards on the rewards contract via ICC.`
- Transaction hashes for inter-contract calls: [de571228c5f7a1bd35b34c14c225b0c5f63b7574d365580203409a54bcb927a8](https://stellar.expert/explorer/testnet/tx/de571228c5f7a1bd35b34c14c225b0c5f63b7574d365580203409a54bcb927a8) (Ledger initialize with rewards contract) and [f11d4df173e396f14dc2bea42032b5c36731d3481479fc9da5acd6b0686832e8](https://stellar.expert/explorer/testnet/tx/f11d4df173e396f14dc2bea42032b5c36731d3481479fc9da5acd6b0686832e8) (Rewards initialize with ledger address)
- Custom token deployed: `No`
- Liquidity pool deployed: `No`
- Token or pool address: `Not applicable`

This submission is reinforced with dynamic inter-contract communication (ICC) and milestone achievements to provide high architecture complexity.

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
- Minimum 10+ meaningful commits: `Yes (22 commits on main branch)`
