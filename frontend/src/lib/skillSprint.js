import {
  getAddress,
  getNetworkDetails,
  isConnected,
  setAllowed,
  signTransaction
} from "@stellar/freighter-api";
import { trustEscrowConfig } from "./contract-config.js";

const networkLabels = {
  "Public Global Stellar Network ; September 2015": "Stellar Mainnet",
  "Test SDF Network ; September 2015": "Stellar Testnet",
  standalone: "Stellar Local"
};

export const configuredContractId =
  import.meta.env.VITE_CONTRACT_ID || trustEscrowConfig.fallbackContractId || "";
export const configuredRewardsContractId =
  import.meta.env.VITE_REWARDS_CONTRACT_ID || trustEscrowConfig.fallbackRewardsContractId || "";
export const configuredNetworkPassphrase =
  import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ||
  "Test SDF Network ; September 2015";
export const configuredRpcUrl =
  import.meta.env.VITE_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";

let stellarSdkPromise;

async function loadStellarSdk() {
  if (!stellarSdkPromise) {
    stellarSdkPromise = import("@stellar/stellar-sdk");
  }
  return stellarSdkPromise;
}

function normalizeProject(id, proj) {
  return {
    id,
    client: proj.client,
    provider: proj.provider,
    title: proj.title,
    budget: Number(proj.budget),
    milestoneCount: Number(proj.milestone_count),
    status: Number(proj.status), // 0 = Active, 1 = Completed, 2 = Disputed
    createdAt: Number(proj.created_at)
  };
}

function normalizeMilestone(milestone) {
  return {
    title: milestone.title,
    amount: Number(milestone.amount),
    status: Number(milestone.status), // 0 = Pending, 1 = Submitted, 2 = Approved, 3 = Disputed, 4 = Refunded
    proofUrl: milestone.proof_url,
    completedAt: Number(milestone.completed_at)
  };
}

function normalizeGlobalStats(stats) {
  return {
    projectCount: Number(stats.project_count || 0),
    totalBudget: Number(stats.total_budget || 0),
    activeEscrow: Number(stats.active_escrow || 0)
  };
}

async function buildClient(account = "") {
  if (!hasContractConfig()) {
    throw new Error(
      "No contract ID is configured yet. Deploy the Soroban contract, then run `npm run export:frontend`."
    );
  }

  const { contract: StellarContract } = await loadStellarSdk();

  return StellarContract.Client.from({
    contractId: configuredContractId,
    rpcUrl: configuredRpcUrl,
    networkPassphrase: configuredNetworkPassphrase,
    publicKey: account || undefined,
    signTransaction
  });
}

async function buildRewardsClient(account = "") {
  if (!configuredRewardsContractId) {
    throw new Error("No rewards contract ID is configured yet.");
  }

  const { contract: StellarContract } = await loadStellarSdk();

  return StellarContract.Client.from({
    contractId: configuredRewardsContractId,
    rpcUrl: configuredRpcUrl,
    networkPassphrase: configuredNetworkPassphrase,
    publicKey: account || undefined,
    signTransaction
  });
}

async function buildRpcServer() {
  const { rpc } = await loadStellarSdk();
  return new rpc.Server(configuredRpcUrl);
}

function serializeEventValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeEventValue);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeEventValue(entry)])
    );
  }
  return value;
}

async function scValToDisplay(value) {
  const { scValToNative } = await loadStellarSdk();
  return serializeEventValue(scValToNative(value));
}

function eventSummary(topics, payload) {
  const headline = topics[0] || "Contract event";
  if (!payload || typeof payload !== "object") {
    return headline;
  }
  if (payload.title) {
    return `${headline}: ${payload.title}`;
  }
  if (payload.project_id !== undefined) {
    return `${headline} (Project #${payload.project_id})`;
  }
  return headline;
}

async function normalizeEvent(event) {
  const topics = await Promise.all((event.topic || []).map(async (entry) => {
    const value = await scValToDisplay(entry);
    return typeof value === "string" ? value : JSON.stringify(value);
  }));
  const payload = await scValToDisplay(event.value);

  return {
    id: event.id,
    txHash: event.txHash,
    ledger: Number(event.ledger),
    closedAt: event.ledgerClosedAt,
    topics,
    summary: eventSummary(topics, payload),
    payload
  };
}

async function getWalletSnapshot() {
  const [addressResult, networkResult] = await Promise.all([getAddress(), getNetworkDetails()]);

  if (addressResult.error) {
    throw new Error(addressResult.error.message);
  }
  if (networkResult.error) {
    throw new Error(networkResult.error.message);
  }

  return {
    account: addressResult.address,
    network: networkResult.network,
    networkPassphrase: networkResult.networkPassphrase,
    rpcUrl: networkResult.sorobanRpcUrl || configuredRpcUrl
  };
}

export function hasContractConfig() {
  return Boolean(configuredContractId);
}

export function getNetworkLabel(networkPassphrase) {
  return networkLabels[networkPassphrase] || "Custom Stellar Network";
}

export function shortAddress(value = "") {
  if (!value) {
    return "Not connected";
  }
  if (value.length <= 14) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

export function formatDate(unixSeconds) {
  if (!unixSeconds) {
    return "N/A";
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(Number(unixSeconds) * 1000));
}

export function formatDateTime(value) {
  if (!value) {
    return "No activity yet";
  }
  const source =
    typeof value === "string" && value.includes("T")
      ? new Date(value)
      : new Date(Number(value) * 1000);

  if (Number.isNaN(source.getTime())) {
    return "No activity yet";
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(source);
}

export function getExplorerLink(networkPassphrase, hash) {
  if (!hash) {
    return "";
  }
  if (networkPassphrase === "Test SDF Network ; September 2015") {
    return `https://stellar.expert/explorer/testnet/tx/${hash}`;
  }
  if (networkPassphrase === "Public Global Stellar Network ; September 2015") {
    return `https://stellar.expert/explorer/public/tx/${hash}`;
  }
  return "";
}

export function getContractExplorerLink(networkPassphrase, contractId) {
  if (!contractId) {
    return "";
  }
  if (networkPassphrase === "Test SDF Network ; September 2015") {
    return `https://lab.stellar.org/r/testnet/contract/${contractId}`;
  }
  if (networkPassphrase === "Public Global Stellar Network ; September 2015") {
    return `https://lab.stellar.org/r/mainnet/contract/${contractId}`;
  }
  return "";
}

export function parseError(error) {
  const candidates = [
    error?.message,
    error?.error?.message,
    error?.response?.data?.detail,
    error?.toString?.()
  ].filter(Boolean);

  return candidates[0] || "Something unexpected happened.";
}

export async function discoverWalletState() {
  const connection = await isConnected();
  if (connection.error || !connection.isConnected) {
    return {
      account: "",
      network: "",
      networkPassphrase: "",
      rpcUrl: configuredRpcUrl
    };
  }
  return getWalletSnapshot();
}

export async function connectWallet() {
  const permission = await setAllowed();
  if (permission.error) {
    throw new Error(permission.error.message);
  }
  if (!permission.isAllowed) {
    throw new Error("Freighter did not grant access to this app.");
  }
  return getWalletSnapshot();
}

export async function readGlobalStats() {
  const client = await buildClient();
  const statsTx = await client.get_global_stats();
  return normalizeGlobalStats(statsTx.result);
}

export async function readUserProjects(account) {
  const client = await buildClient();
  const projectsTx = await client.get_user_projects({ user: account });
  const projectIds = Array.from(projectsTx.result || []);

  const projects = await Promise.all(
    projectIds.map(async (id) => {
      const projTx = await client.get_project({ project_id: id });
      const projNormalized = normalizeProject(id, projTx.result);

      // Fetch milestones details
      const milestones = [];
      for (let i = 0; i < projNormalized.milestoneCount; i++) {
        const milestoneTx = await client.get_milestone({ project_id: id, milestone_index: i });
        milestones.push(normalizeMilestone(milestoneTx.result));
      }

      return {
        ...projNormalized,
        milestones
      };
    })
  );

  return projects;
}

export async function readContractEvents(limit = 6) {
  if (!hasContractConfig()) {
    return [];
  }
  const server = await buildRpcServer();
  const latestLedger = await server.getLatestLedger();
  const latestSequence = Number(latestLedger.sequence || 0);
  const startLedger = Math.max(latestSequence - 5_000, 1);

  const response = await server.getEvents({
    startLedger,
    filters: [
      {
        type: "contract",
        contractIds: [configuredContractId]
      }
    ],
    limit
  });

  return Promise.all(response.events.slice().reverse().map(normalizeEvent));
}

async function submitTransaction(assembledTx) {
  const sentTx = await assembledTx.signAndSend();
  return {
    hash:
      sentTx.sendTransactionResponse?.hash ||
      sentTx.getTransactionResponse?.txHash ||
      "",
    result: sentTx.result
  };
}

export async function createProject(account, provider, title, budget, milestoneTitles, milestoneAmounts) {
  const client = await buildClient(account);
  const tx = await client.create_project({
    client: account,
    provider,
    title,
    budget: BigInt(budget),
    milestone_titles: milestoneTitles,
    milestone_amounts: milestoneAmounts.map(BigInt)
  });
  return submitTransaction(tx);
}

export async function submitMilestoneProof(account, projectId, milestoneIndex, proofUrl) {
  const client = await buildClient(account);
  const tx = await client.submit_milestone_proof({
    provider: account,
    project_id: projectId,
    milestone_index: milestoneIndex,
    proof_url: proofUrl
  });
  return submitTransaction(tx);
}

export async function approveMilestone(account, projectId, milestoneIndex) {
  const client = await buildClient(account);
  const tx = await client.approve_milestone({
    client: account,
    project_id: projectId,
    milestone_index: milestoneIndex
  });
  return submitTransaction(tx);
}

export async function disputeMilestone(account, projectId, milestoneIndex) {
  const client = await buildClient(account);
  const tx = await client.dispute_milestone({
    caller: account,
    project_id: projectId,
    milestone_index: milestoneIndex
  });
  return submitTransaction(tx);
}

export async function resolveDispute(account, projectId, milestoneIndex, payoutToProvider) {
  const client = await buildRewardsClient(account);
  const tx = await client.resolve_dispute({
    resolver: account,
    project_id: projectId,
    milestone_index: milestoneIndex,
    payout_to_provider: payoutToProvider
  });
  return submitTransaction(tx);
}

export async function readDisputeDetails(projectId, milestoneIndex) {
  try {
    const client = await buildRewardsClient();
    const disputeTx = await client.get_dispute({
      project_id: projectId,
      milestone_index: milestoneIndex
    });
    const res = disputeTx.result;
    return {
      client: res.client,
      provider: res.provider,
      amount: Number(res.amount),
      resolved: Boolean(res.resolved),
      payoutToProvider: Boolean(res.payout_to_provider)
    };
  } catch {
    return null;
  }
}
