import {
  getAddress,
  getNetworkDetails,
  isConnected,
  setAllowed,
  signTransaction
} from "@stellar/freighter-api";
import { focusForgeConfig } from "./contract-config.js";

const networkLabels = {
  "Public Global Stellar Network ; September 2015": "Stellar Mainnet",
  "Test SDF Network ; September 2015": "Stellar Testnet",
  standalone: "Stellar Local"
};

export const configuredContractId =
  import.meta.env.VITE_CONTRACT_ID || focusForgeConfig.fallbackContractId || "";
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

function normalizeDashboard(dashboard) {
  return {
    displayName: dashboard.display_name,
    weeklyGoalMinutes: Number(dashboard.weekly_goal_minutes),
    totalMinutes: Number(dashboard.total_minutes),
    minutesThisWeek: Number(dashboard.minutes_this_week),
    sessionCount: Number(dashboard.session_count),
    currentStreak: Number(dashboard.current_streak),
    createdAt: Number(dashboard.created_at),
    goalReachedThisWeek: Boolean(dashboard.goal_reached_this_week)
  };
}

function normalizeGlobalStats(stats) {
  return {
    learnerCount: Number(stats.learner_count || 0),
    totalSessions: Number(stats.total_sessions || 0),
    totalMinutes: Number(stats.total_minutes || 0),
    latestActivityAt: Number(stats.latest_activity_at || 0)
  };
}

function normalizeSession(index, session) {
  return {
    id: `${index}-${session.timestamp}`,
    topic: session.topic,
    minutesSpent: Number(session.minutes_spent),
    timestamp: Number(session.timestamp),
    streakAfterLog: Number(session.streak_after_log)
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

  if (payload.display_name) {
    return `${headline}: ${payload.display_name}`;
  }

  if (payload.topic) {
    return `${headline}: ${payload.topic}`;
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

export function formatMinutes(totalMinutes) {
  const minutes = Number(totalMinutes || 0);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (!hours) {
    return `${minutes}m`;
  }

  if (!remainder) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
}

export function formatDate(unixSeconds) {
  if (!unixSeconds) {
    return "No sessions logged yet";
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

export async function readDashboard(account) {
  const client = await buildClient();
  const hasProfileTx = await client.has_profile({ learner: account });

  if (!hasProfileTx.result) {
    return null;
  }

  const dashboardTx = await client.get_dashboard({ learner: account });
  return normalizeDashboard(dashboardTx.result);
}

export async function readGlobalStats() {
  const client = await buildClient();
  const statsTx = await client.get_global_stats();
  return normalizeGlobalStats(statsTx.result);
}

export async function readRecentSessions(account, limit = 5) {
  const client = await buildClient();
  const countTx = await client.get_session_count({ learner: account });
  const count = Number(countTx.result || 0);

  if (!count) {
    return [];
  }

  const indexes = Array.from({ length: Math.min(count, limit) }, (_, idx) => count - idx - 1);
  const sessionResults = await Promise.all(
    indexes.map(async (index) => {
      const sessionTx = await client.get_session({ learner: account, index });
      return normalizeSession(index, sessionTx.result);
    })
  );

  return sessionResults;
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

export async function saveProfile(account, displayName, weeklyGoalMinutes) {
  const client = await buildClient(account);
  const tx = await client.save_profile({
    learner: account,
    display_name: displayName,
    weekly_goal_minutes: Number(weeklyGoalMinutes)
  });

  return submitTransaction(tx);
}

export async function updateWeeklyGoal(account, weeklyGoalMinutes) {
  const client = await buildClient(account);
  const tx = await client.update_weekly_goal({
    learner: account,
    new_goal_minutes: Number(weeklyGoalMinutes)
  });

  return submitTransaction(tx);
}

export async function logSession(account, topic, minutesSpent) {
  const client = await buildClient(account);
  const tx = await client.log_session({
    learner: account,
    topic,
    minutes_spent: Number(minutesSpent)
  });

  return submitTransaction(tx);
}
