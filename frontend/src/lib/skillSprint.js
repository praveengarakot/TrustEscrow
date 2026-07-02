import {
  getAddress,
  getNetworkDetails,
  isConnected,
  setAllowed,
  signTransaction
} from "@stellar/freighter-api";
import { contract as StellarContract } from "@stellar/stellar-sdk";
import { focusForgeConfig } from "./contract-config";

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

  return StellarContract.Client.from({
    contractId: configuredContractId,
    rpcUrl: configuredRpcUrl,
    networkPassphrase: configuredNetworkPassphrase,
    publicKey: account || undefined,
    signTransaction
  });
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
