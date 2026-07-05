# ⚡ TrustEscrow

<div align="center">

**A Decentralized Escrow and Dispute Arbitration Platform on Stellar**

*Trustless milestone payments secured by Stellar Soroban smart contracts and ICC arbitration*

[![Live Demo](https://img.shields.io/badge/Live_Demo-trustescrow--stellar.netlify.app-6366f1?style=for-the-badge&logo=netlify)](https://trustescrow-stellar.netlify.app/)
[![GitHub](https://img.shields.io/badge/Source_Code-praveengarakot%2FTrustEscrow-181717?style=for-the-badge&logo=github)](https://github.com/praveengarakot/TrustEscrow)
[![Network](https://img.shields.io/badge/Network-Stellar_Testnet-00B4D8?style=for-the-badge&logo=stellar)](https://stellar.expert/explorer/testnet)
[![Built for RiseIn](https://img.shields.io/badge/Built_for-RiseIn_Level_4-f59e0b?style=for-the-badge)](https://www.risein.com/)

</div>

---

## 📋 Table of Contents

1. [Problem Statement](#-problem-statement)
2. [Why Stellar?](#-why-stellar)
3. [Live Deployment](#-live-deployment)
4. [Contract Addresses & Transactions](#-contract-addresses--transactions)
5. [User Onboarding & Feedback](#-user-onboarding--feedback)
6. [Architecture](#-architecture)
7. [Smart Contracts](#-smart-contracts)
8. [Production Hardening (Level 4)](#-production-hardening-level-4)
9. [Tech Stack](#-tech-stack)
10. [Project Structure](#-project-structure)
11. [Testing](#-testing)
12. [CI/CD Pipeline](#-cicd-pipeline)
13. [Local Development](#-local-development)
14. [Roadmap](#-roadmap)
15. [Author](#-author)

---

## 🔴 Problem Statement

The global freelance economy is structurally fragmented and carries high payment and trust friction for remote workers and project owners.

| Issue | Impact |
|-------|--------|
| **Platform Extractions** | Centrally managed platforms extract 10–20% in intermediary commissions directly from worker payouts. |
| **Payment Defaults** | Freelancers frequently deliver milestones only to face client defaults, delayed payouts, or payment refusal. |
| **Cross-Border Friction** | Traditional international bank transfers take 5–14 business days and incur high wire fees. |
| **Opaque Arbitrations** | Disputes resolved by centralized support agents are slow, subjective, and completely non-auditable. |

**TrustEscrow** removes the intermediary risk entirely. Using programmable, auditable Soroban smart contracts, clients lock budget funds on-chain into a secure escrow vault. Funds are automatically released to the provider immediately upon milestone approval — eliminating platform fees, settlement delays, and counterparty risks.

---

## 🌟 Why Stellar?

TrustEscrow is designed specifically to utilize the native advantages of the Stellar network:

| Stellar Property | TrustEscrow Benefit |
|-----------------|-------------------|
| **~5 Second Finality** | Speeds up settlement times so developers receive milestone payouts instantly. |
| **Micro-fees ($0.00001)** | Makes micro-payout structures (e.g. $10 tasks) feasible — which is economically unviable on high-gas networks. |
| **Soroban Smart Contracts** | Supports robust Inter-Contract Communication (ICC) to transition payment escrow states automatically. |
| **Sponsorship Capabilities** | Path to gas-sponsored onboarding, allowing clients to cover fee-bump costs for freelancers. |

---

## 🌐 Live Deployment

| Resource | Link |
|----------|------|
| 🌍 **Live dApp** | [trustescrow-stellar.netlify.app](https://trustescrow-stellar.netlify.app/) |
| 🎬 **Demo Video** | [Google Drive — Walkthrough Recording](https://drive.google.com/file/d/1dOVVA3A3U-OrmAC22FFON_RBe6q4ycMa/view?usp=sharing) |
| 💻 **GitHub Repo** | [praveengarakot/TrustEscrow](https://github.com/praveengarakot/TrustEscrow) |
| 📋 **User Feedback Form** | [TrustEscrow Usability Survey — Google Forms](https://forms.gle/mHik3thtzZtxCfYg9) |
| 📊 **Onboarded Users & Wallet Interactions** | [Responses Tracker — Google Sheets](https://docs.google.com/spreadsheets/d/1o6dMJz0YSV-a3YyS15c8atqz_9Msq5qfzIUp3X_nKjk/edit?resourcekey=&gid=111961890#gid=111961890) |

---

## 🔗 Contract Addresses & Transactions

All contracts are deployed and cross-initialized on the **Stellar Testnet** using the `praveen` developer identity.

### Deployed Contract IDs

| Contract | Address |
|----------|---------|
| **Escrow Main Contract** | `CB5DJ2W5RYFQXVUMONNWUKTXMK7FINUKJI4RVMAPMPZ4OK4ADNO7SXLB` |
| **Arbitration Dispute Contract** | `CBPTXWCNCRZC53SV2J2DC5EZKF4VMGSBMVAIQTPRGR57QQPQ553T6W3X` |

### On-Chain Deployment Transactions

| Action | Transaction Hash |
|--------|-----------------|
| **Arbitration Contract — Upload & Deploy** | [`4f2c1ce347f2f501bd4867d64767ae0b0e7a974cf977c7161c95001a08cdca64`](https://stellar.expert/explorer/testnet/tx/4f2c1ce347f2f501bd4867d64767ae0b0e7a974cf977c7161c95001a08cdca64) |
| **Escrow Contract — Upload & Deploy** | [`4ae85dfca86d7700208d5f16ea06257991cc4c741993f410e7e0e973141b0a35`](https://stellar.expert/explorer/testnet/tx/4ae85dfca86d7700208d5f16ea06257991cc4c741993f410e7e0e973141b0a35) |
| **Arbitration Contract — Initialize** | [`5c48b37559807d2308b2dc177248879513c7603965c51319bc6d0de26d550de2`](https://stellar.expert/explorer/testnet/tx/5c48b37559807d2308b2dc177248879513c7603965c51319bc6d0de26d550de2) |
| **Escrow Contract — Initialize** | [`4385e4a1fee493c338712e2be3034f6c75a19bad68c976d6909a85adc2f3224a`](https://stellar.expert/explorer/testnet/tx/4385e4a1fee493c338712e2be3034f6c75a19bad68c976d6909a85adc2f3224a) |

---

## 👥 User Onboarding & Feedback

As part of the Level 4 production MVP requirements, we onboarded real users to validate the complete milestone escrow lifecycle on the Stellar Testnet.

**Onboarding Journey:**

```
1. User installs Freighter Wallet → Funds testnet account via Friendbot
2. Client deploys and funds a new milestone agreement
3. Contractor accepts terms and checks active deliverables
4. Contractor submits milestone work proof URL
5. Client reviews and approves → Escrow contract releases payment to contractor
6. Alternatively, disputes lock funds into Arbitration for resolution
7. Users submit feedback via the Google Form
```

| Resource | Link |
|----------|------|
| 📋 **Feedback Form** | [Submit Feedback](https://forms.gle/mHik3thtzZtxCfYg9) |
| 📊 **User Responses & Wallet Proof** | [View Spreadsheet](https://docs.google.com/spreadsheets/d/1o6dMJz0YSV-a3YyS15c8atqz_9Msq5qfzIUp3X_nKjk/edit?resourcekey=&gid=111961890#gid=111961890) |

---

## 🏗️ Architecture

TrustEscrow consists of two Soroban smart contracts communicating via Inter-Contract Calls (ICC), and a React frontend that builds and submits signed transactions via Freighter.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          React Frontend                             │
│                                                                     │
│  Landing │ Dashboard │ New Agreement │ Provider Desk │ Client Desk  │
│                                                                     │
│                         Freighter API                               │
└──────────────────┬─────────────────────────────┬───────────────────┘
                   │ TypeScript Contract Clients  │
          ┌────────▼─────────┐         ┌─────────▼────────┐
          │ Escrow Contract  │──ICC──→ │Arbitration Desk  │
          │                  │         │                  │
          │  create_project()│         │ escalate_dispute()│
          │  submit_proof()  │         │ resolve_dispute()│
          │  approve_milestone│        │ get_dispute()    │
          │  dispute_milestone│        │                  │
          │  execute_        │         │                  │
          │    resolution()  │         │                  │
          └──────────────────┘         └──────────────────┘
                            Stellar Testnet
```

### Inter-Contract Communication (ICC) Flow

Escrow funding, deliverables tracking, and payments are managed atomically on-chain. If a client disputes a milestone, the escrow contract uses ICC to escalate the dispute to the arbitration desk contract, locking the funds until resolution.

```
Step 1: Client calls create_project()      → Project is funded and active.
Step 2: Provider calls submit_proof()      → Milestone is marked as Submitted.
Step 3a: Client calls approve_milestone()  → Funds are released directly to Provider.
Step 3b: Client calls dispute_milestone()  → Escrow contract calls escalate_dispute()
                                             on Arbitration contract via ICC.
Step 4: Arbiter calls resolve_dispute()    → Arbitration contract calls back to main
                                             Escrow contract via ICC execute_resolution().
                                             Funds are paid out or refunded.
```

---

## 📜 Smart Contracts

### Escrow Main Contract (`CB5DJ2W5RYFQXVUMONNWUKTXMK7FINUKJI4RVMAPMPZ4OK4ADNO7SXLB`)

Manages projects setup, deposits, proof submissions, and payout executions.

| Function | Access | Description |
|----------|--------|-------------|
| `create_project()` | Client | Fund a new milestone-locked agreement budget |
| `submit_milestone_proof()` | Provider | Attach a deliverable URL to a pending milestone |
| `approve_milestone()` | Client | Release locked funds for a completed milestone |
| `dispute_milestone()` | Client/Provider | Dispute a milestone → ICC escalates to Arbitration |
| `execute_resolution()` | Arbitration Contract only | Settles dispute payouts based on arbitration decision |
| `get_project()` | Public (read) | Retrieve active project configuration |
| `get_milestone()` | Public (read) | Query individual milestone status |
| `get_user_projects()` | Public (read) | List projects associated with a user wallet |
| `get_global_stats()` | Public (read) | Fetch platform aggregate stats |

### Arbitration Contract (`CBPTXWCNCRZC53SV2J2DC5EZKF4VMGSBMVAIQTPRGR57QQPQ553T6W3X`)

Handles dispute records and resolves payout distributions.

| Function | Access | Description |
|----------|--------|-------------|
| `escalate_dispute()` | Escrow Contract only | Register new dispute records via ICC |
| `resolve_dispute()` | Authorized Arbiter | Settle dispute → ICC calls `execute_resolution()` on main contract |
| `get_dispute()` | Public (read) | Query dispute details |

---

## 🛡️ Production Hardening (Level 4)

We implemented robust validation checks, error-handling schemes, and telemetry integrations for our production-ready Level 4 release:

### Smart Contract Security
*   **ICC Caller Authorization Constraints**: Restricted `execute_resolution()` on the main contract to only accept calls originating from the Arbitration contract address.
*   **Initialization Guards**: Prevented double initialization on deployed instances.
*   **Validation Checks**: Enforce positive milestone bounds, non-empty titles, and correct sum matching total budgets.

### Frontend Production Quality
*   **Light-Editorial Theme**: Transformed the UI layout using the `ui-ux-pro-max` design system with warm paper backgrounds (`#f5f4f0`), clean card segments (`#ffffff`), and contrast typography.
*   **Top Navigation Layout**: Converted the sidebar into a sticky frosted-glass top navigation bar.
*   **Deploy Button Fix**: Corrected deployment flags allowing the app to launch agreements using default fallback settings when environment variables are uninitialized.
*   **SPA Falling Handler**: Configured Netlify routing redirection to handle sub-route refreshes successfully.

### Monitoring & Analytics
*   **PostHog**: Integrated product analytics tracking for `wallet_connected` and `create_project_initiated` events.
*   **Sentry**: Added React-based error boundaries and exception monitoring.

---

## 📸 Submission Screenshots

### 🖥️ Desktop UI

<p align="center">
  <img src="SUBMISSION%20ASSETS/ui2.png" width="800" alt="TrustEscrow Desktop UI Screenshot" />
</p>

### 📊 Analytics Desk

<p align="center">
  <img src="SUBMISSION%20ASSETS/analytics.png" width="800" alt="TrustEscrow Analytics Screenshot" />
</p>

### 📱 Mobile Responsive UI

<p align="center">
  <img src="SUBMISSION%20ASSETS/mobui.png" width="375" alt="TrustEscrow Mobile UI Screenshot" />
</p>

### 🔄 CI/CD Pipeline

<p align="center">
  <img src="SUBMISSION%20ASSETS/cicd.png" width="800" alt="TrustEscrow CI/CD Pipeline" />
</p>

---

## 🧪 Testing

### Test Summary

| Suite | Tests | Status |
|-------|-------|--------|
| Frontend (Vitest) | 1 test | ✅ Passing |
| Escrow Contract (Rust) | 8 tests | ✅ Passing |
| **Total** | **9 tests** | ✅ **9/9 Passing** |

### Running Tests

```bash
# Frontend Tests
npm --workspace frontend run test

# Rust Contracts Tests
cargo test
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend Framework** | React + Vite | Fast, responsive single page application |
| **Language** | JavaScript / TypeScript | Interactive components and contract calls |
| **Styling** | Vanilla CSS | Custom light-editorial theme matching `credport` |
| **Smart Contracts** | Soroban (Rust) | On-chain escrow and dispute logic |
| **Wallet Integration** | Freighter API | Secure transaction building and signing |
| **Error Monitoring** | Sentry | Production crash reporting |
| **Analytics** | PostHog | User event tracking |
| **Hosting** | Netlify | Frontend hosting |

---

## 📁 Project Structure

```
TrustEscrow/
├── .github/
│   └── workflows/
│       └── ci.yml             # Automated contract build and frontend check
├── contracts/
│   ├── focus_forge/           # Main Escrow contract source code
│   └── focus_forge_rewards/   # Arbitration contract source code
├── deployments/
│   └── testnet.json           # Deployed contract records
├── frontend/
│   ├── public/
│   │   └── _redirects         # Netlify SPA routing redirects fallback
│   ├── src/
│   │   ├── components/        # Panel, Metric, and Status UI widgets
│   │   ├── lib/
│   │   │   ├── skillSprint.js # Freighter connection interface and RPC helpers
│   │   │   └── contract-config.js
│   │   ├── App.jsx            # Main app routing, dashboard, and marketing page
│   │   ├── main.jsx           # Entrypoint with Sentry/PostHog initialized
│   │   └── styles.css         # Warm light-editorial style definitions
│   └── package.json
└── package.json
```

---

## 🚀 Local Development

### Prerequisites
- Node.js 18+
- Rust stable toolchain
- Freighter wallet browser extension

### Installation

```bash
# Clone the repository
git clone https://github.com/praveengarakot/TrustEscrow.git
cd TrustEscrow

# Install dependencies
npm install

# Start local dev server
npm run dev
```

---

## 🗺️ Roadmap

### ✅ Level 3 (Complete)
- Main Escrow contract with project funding and milestone payouts.
- Event stream synchronization polling from Soroban RPC.
- Vitest configuration.

### ✅ Level 4 (Complete)
- Secondary Arbitration contract with Inter-Contract Communication (ICC).
- Complete UI redesign matching `credport` light-editorial theme tokens.
- Fully featured landing page for disconnected Freighter users.
- Telemetry integrations: PostHog event logging + Sentry exception tracking.
- Automated Netlify fallback routes configuration.

### 🔜 Level 5 (Planned)
- Reputation Scoring contract tracking client/provider history.
- Multi-token support linking to custom Stellar Asset Contracts (SAC).
- Project metrics dashboard and advanced search filters.

---

## 👨💻 Author

**Barsha Saha** — [@barish245](https://github.com/barish245)

*Built for the RiseIn Stellar dApp Development Program — Level 4*
