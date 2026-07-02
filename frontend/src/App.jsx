import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WatchWalletChanges } from "@stellar/freighter-api";
import {
  configuredContractId,
  configuredNetworkPassphrase,
  connectWallet,
  discoverWalletState,
  formatDate,
  formatMinutes,
  getExplorerLink,
  getNetworkLabel,
  hasContractConfig,
  logSession,
  parseError,
  readDashboard,
  readRecentSessions,
  saveProfile,
  shortAddress,
  updateWeeklyGoal
} from "./lib/skillSprint";

const emptyWallet = {
  account: "",
  network: "",
  networkPassphrase: "",
  rpcUrl: "",
  isConnecting: false,
  error: ""
};

const emptyTx = {
  status: "idle",
  message: "",
  hash: ""
};

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function Panel({ eyebrow, title, body, children, tone = "ember" }) {
  return (
    <section className={`panel panel-${tone}`}>
      <div className="panel-head">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {body ? <p className="panel-body">{body}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value, note, loading = false }) {
  return (
    <article className="metric-card">
      <p className="metric-label">{label}</p>
      <div className={loading ? "skeleton skeleton-metric" : "metric-value"}>
        {loading ? "" : value}
      </div>
      <p className="metric-note">{loading ? <span className="skeleton skeleton-note" /> : note}</p>
    </article>
  );
}

function ActivitySkeleton() {
  return (
    <div className="session-list">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="session-card session-skeleton" key={index}>
          <span className="skeleton skeleton-title" />
          <span className="skeleton skeleton-note" />
          <span className="skeleton skeleton-badge" />
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const queryClient = useQueryClient();
  const [wallet, setWallet] = useState(emptyWallet);
  const [txState, setTxState] = useState(emptyTx);
  const [profileForm, setProfileForm] = useState({
    displayName: "",
    weeklyGoalMinutes: "240"
  });
  const [goalForm, setGoalForm] = useState("300");
  const [sessionForm, setSessionForm] = useState({
    topic: "",
    minutesSpent: "45"
  });

  useEffect(() => {
    let isMounted = true;
    let watcher = null;

    async function syncWallet() {
      try {
        const nextState = await discoverWalletState();
        if (!isMounted) {
          return;
        }

        setWallet((current) => ({
          ...current,
          ...nextState,
          isConnecting: false,
          error: ""
        }));
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setWallet((current) => ({
          ...current,
          isConnecting: false,
          error: parseError(error)
        }));
      }
    }

    syncWallet();

    if (typeof window !== "undefined") {
      watcher = new WatchWalletChanges(3000);
      watcher.watch(() => {
        setTxState(emptyTx);
        syncWallet();
      });
    }

    return () => {
      isMounted = false;
      watcher?.stop?.();
    };
  }, []);

  const wrongNetwork =
    Boolean(wallet.networkPassphrase) && wallet.networkPassphrase !== configuredNetworkPassphrase;
  const readyForReads = Boolean(wallet.account) && hasContractConfig() && !wrongNetwork;

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", wallet.account, wallet.networkPassphrase],
    queryFn: () => readDashboard(wallet.account),
    enabled: readyForReads
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions", wallet.account, wallet.networkPassphrase, dashboardQuery.data?.sessionCount || 0],
    queryFn: () => readRecentSessions(wallet.account, 5),
    enabled: readyForReads && Boolean(dashboardQuery.data)
  });

  useEffect(() => {
    if (!dashboardQuery.data) {
      return;
    }

    setGoalForm(String(dashboardQuery.data.weeklyGoalMinutes));
    setProfileForm((current) => ({
      displayName: current.displayName || dashboardQuery.data.displayName,
      weeklyGoalMinutes: current.weeklyGoalMinutes || String(dashboardQuery.data.weeklyGoalMinutes)
    }));
  }, [dashboardQuery.data]);

  const dashboard = dashboardQuery.data;
  const weeklyProgress = useMemo(() => {
    if (!dashboard?.weeklyGoalMinutes) {
      return 0;
    }

    return Math.min(
      100,
      Math.round((dashboard.minutesThisWeek / dashboard.weeklyGoalMinutes) * 100)
    );
  }, [dashboard]);

  async function runLedgerAction(action, pendingMessage, successMessage) {
    if (!wallet.account) {
      throw new Error("Connect Freighter before sending a transaction.");
    }

    if (wrongNetwork) {
      throw new Error(`Switch Freighter to ${getNetworkLabel(configuredNetworkPassphrase)}.`);
    }

    setTxState({
      status: "pending",
      message: pendingMessage,
      hash: ""
    });

    try {
      const result = await action();

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard", wallet.account] }),
        queryClient.invalidateQueries({ queryKey: ["sessions", wallet.account] })
      ]);

      setTxState({
        status: "success",
        message: successMessage,
        hash: result.hash
      });
    } catch (error) {
      const message = parseError(error);
      setTxState({
        status: "error",
        message,
        hash: ""
      });
      throw error;
    }
  }

  const saveProfileMutation = useMutation({
    mutationFn: ({ displayName, weeklyGoalMinutes }) =>
      runLedgerAction(
        () => saveProfile(wallet.account, displayName, weeklyGoalMinutes),
        "Forging your operator profile on Stellar...",
        "Profile saved on Soroban."
      )
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ weeklyGoalMinutes }) =>
      runLedgerAction(
        () => updateWeeklyGoal(wallet.account, weeklyGoalMinutes),
        "Updating your weekly forge target...",
        "Weekly goal updated."
      )
  });

  const logSessionMutation = useMutation({
    mutationFn: ({ topic, minutesSpent }) =>
      runLedgerAction(
        () => logSession(wallet.account, topic, minutesSpent),
        "Writing your focus block to Stellar...",
        "Focus session logged."
      )
  });

  const anyMutationPending =
    saveProfileMutation.isPending || updateGoalMutation.isPending || logSessionMutation.isPending;

  async function handleConnectWallet() {
    setWallet((current) => ({
      ...current,
      isConnecting: true,
      error: ""
    }));

    try {
      const nextState = await connectWallet();
      setWallet({
        ...emptyWallet,
        ...nextState,
        isConnecting: false
      });
    } catch (error) {
      setWallet((current) => ({
        ...current,
        isConnecting: false,
        error: parseError(error)
      }));
    }
  }

  function handleProfileSubmit(event) {
    event.preventDefault();

    const displayName = profileForm.displayName.trim();
    const weeklyGoalMinutes = Number(profileForm.weeklyGoalMinutes);

    if (!displayName) {
      setTxState({
        status: "error",
        message: "Add a display name before saving your profile.",
        hash: ""
      });
      return;
    }

    if (Number.isNaN(weeklyGoalMinutes) || weeklyGoalMinutes < 30 || weeklyGoalMinutes > 5000) {
      setTxState({
        status: "error",
        message: "Weekly goal must stay between 30 and 5000 minutes.",
        hash: ""
      });
      return;
    }

    saveProfileMutation.mutate({
      displayName,
      weeklyGoalMinutes
    });
  }

  function handleGoalSubmit(event) {
    event.preventDefault();

    const weeklyGoalMinutes = Number(goalForm);
    if (Number.isNaN(weeklyGoalMinutes) || weeklyGoalMinutes < 30 || weeklyGoalMinutes > 5000) {
      setTxState({
        status: "error",
        message: "Pick a weekly goal between 30 and 5000 minutes.",
        hash: ""
      });
      return;
    }

    updateGoalMutation.mutate({
      weeklyGoalMinutes
    });
  }

  function handleSessionSubmit(event) {
    event.preventDefault();

    const topic = sessionForm.topic.trim();
    const minutesSpent = Number(sessionForm.minutesSpent);

    if (!topic) {
      setTxState({
        status: "error",
        message: "Give this focus block a topic so the chain record stays meaningful.",
        hash: ""
      });
      return;
    }

    if (Number.isNaN(minutesSpent) || minutesSpent < 5 || minutesSpent > 480) {
      setTxState({
        status: "error",
        message: "Focus sessions must be between 5 and 480 minutes.",
        hash: ""
      });
      return;
    }

    logSessionMutation.mutate({
      topic,
      minutesSpent
    });
  }

  const txExplorerLink = getExplorerLink(wallet.networkPassphrase, txState.hash);

  return (
    <div className="app-shell">
      <div className="glow glow-one" />
      <div className="glow glow-two" />
      <div className="glow glow-three" />

      <header className="hero">
        <div className="hero-main">
          <div className="brand-row">
            <BrandMark />
            <div>
              <p className="kicker">On-chain focus operating system</p>
              <h1>FocusForge</h1>
            </div>
          </div>

          <p className="lead">
            A focused on-chain workspace for makers, builders, and research teams who want deep
            work logged on Stellar with clean weekly targets and visible streak momentum.
          </p>

          <div className="hero-actions">
            <button
              className="button button-primary"
              onClick={handleConnectWallet}
              disabled={wallet.isConnecting}
            >
              {wallet.isConnecting
                ? "Connecting..."
                : wallet.account
                  ? "Wallet Connected"
                  : "Connect Freighter"}
            </button>
            <div className="hero-badges">
              <span className="pill">Soroban powered</span>
              <span className="pill">Freighter ready</span>
              <span className="pill">Weekly streaks</span>
            </div>
          </div>
        </div>

        <div className="hero-side">
          <div className="hero-side-top">
            <div>
              <p className="side-label">Operator</p>
              <strong>{wallet.account ? shortAddress(wallet.account) : "Wallet not connected"}</strong>
            </div>
            <div>
              <p className="side-label">Network</p>
              <strong>
                {wallet.networkPassphrase
                  ? getNetworkLabel(wallet.networkPassphrase)
                  : "Awaiting Freighter"}
              </strong>
            </div>
          </div>

          <div className="hero-side-stat">
            <span>Contract</span>
            <strong>{configuredContractId ? shortAddress(configuredContractId) : "Not deployed"}</strong>
          </div>

          <div className="progress-shell">
            <div className="progress-labels">
              <span>Forge completion</span>
              <span>{dashboard ? `${weeklyProgress}%` : "0%"}</span>
            </div>
            <div className="progress-track">
              <span className="progress-fill" style={{ width: `${weeklyProgress}%` }} />
            </div>
          </div>

          <p className="hero-note">
            Built for focused operators with a crisp dashboard, wallet-based actions, and direct
            Soroban writes on Stellar Testnet.
          </p>
        </div>
      </header>

      <section className="status-banner">
        <div>
          <p className="status-label">Live status</p>
          <p className="status-copy">
            {wallet.error ||
              (wrongNetwork
                ? `Connected to ${getNetworkLabel(wallet.networkPassphrase)}. Switch Freighter to ${getNetworkLabel(configuredNetworkPassphrase)}.`
                : txState.message ||
                  (hasContractConfig()
                    ? "Ready to read and write focus sessions on Stellar."
                    : "Deploy the Soroban contract and export the frontend config before using the app."))}
          </p>
        </div>
        {txExplorerLink ? (
          <a className="status-link" href={txExplorerLink} target="_blank" rel="noreferrer">
            View transaction
          </a>
        ) : null}
      </section>

      <section className="metrics-grid">
        <MetricCard
          label="Focus logged"
          value={dashboard ? formatMinutes(dashboard.totalMinutes) : "0m"}
          note={dashboard ? `${dashboard.sessionCount} chain-recorded sessions` : "Starts after your first session"}
          loading={dashboardQuery.isLoading}
        />
        <MetricCard
          label="This week"
          value={dashboard ? formatMinutes(dashboard.minutesThisWeek) : "0m"}
          note={
            dashboard
              ? `${Math.max(dashboard.weeklyGoalMinutes - dashboard.minutesThisWeek, 0)} minutes left to target`
              : "Set a weekly goal to begin"
          }
          loading={dashboardQuery.isLoading}
        />
        <MetricCard
          label="Streak heat"
          value={
            dashboard
              ? `${dashboard.currentStreak} day${dashboard.currentStreak === 1 ? "" : "s"}`
              : "0 days"
          }
          note={
            dashboard
              ? dashboard.goalReachedThisWeek
                ? "Weekly target already cleared"
                : "Keep the chain warm"
              : "Consecutive-day momentum tracker"
          }
          loading={dashboardQuery.isLoading}
        />
        <MetricCard
          label="Operator tag"
          value={dashboard?.displayName || "No profile"}
          note={wallet.account ? shortAddress(wallet.account) : "Connect to personalize"}
          loading={dashboardQuery.isLoading}
        />
      </section>

      {!hasContractConfig() ? (
        <Panel
          eyebrow="Deployment runway"
          title="Deploy the ledger and connect the app"
          body="The frontend is already wired. Build the Rust contract, deploy with Stellar CLI, and export the contract ID so the app can read and write on-chain."
          tone="mint"
        >
          <div className="code-stack">
            <code>stellar keys generate alice --network testnet --fund</code>
            <code>npm run contract:build</code>
            <code>npm run contract:deploy</code>
            <code>npm run export:frontend</code>
          </div>
        </Panel>
      ) : null}

      <section className="panel-grid">
        <Panel
          eyebrow="Operator setup"
          title="Create or refresh your focus identity"
          body="Save a public display name and the number of deep-work minutes you want to land each week."
          tone="ember"
        >
          <form className="form-grid" onSubmit={handleProfileSubmit}>
            <label>
              <span>Display name</span>
              <input
                type="text"
                placeholder="Signal Architect"
                value={profileForm.displayName}
                onChange={(event) =>
                  setProfileForm((current) => ({ ...current, displayName: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Weekly goal (minutes)</span>
              <input
                type="number"
                min="30"
                max="5000"
                step="5"
                value={profileForm.weeklyGoalMinutes}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    weeklyGoalMinutes: event.target.value
                  }))
                }
              />
            </label>
            <button
              className="button button-primary"
              type="submit"
              disabled={anyMutationPending || !wallet.account || !hasContractConfig()}
            >
              {saveProfileMutation.isPending ? "Saving..." : "Save profile"}
            </button>
          </form>
        </Panel>

        <Panel
          eyebrow="Target control"
          title="Retune the weekly forge"
          body="Adjust your target whenever your sprint cadence changes. The contract still resets weekly progress on the next on-chain week."
          tone="mint"
        >
          <form className="form-grid" onSubmit={handleGoalSubmit}>
            <label>
              <span>New weekly goal</span>
              <input
                type="number"
                min="30"
                max="5000"
                step="5"
                value={goalForm}
                onChange={(event) => setGoalForm(event.target.value)}
              />
            </label>
            <button
              className="button button-secondary"
              type="submit"
              disabled={anyMutationPending || !wallet.account || !dashboard || !hasContractConfig()}
            >
              {updateGoalMutation.isPending ? "Updating..." : "Update goal"}
            </button>
          </form>
        </Panel>

        <Panel
          eyebrow="Session log"
          title="Record a deep-work block"
          body="Capture the topic, duration, and resulting streak impact. The feed below refreshes after every confirmed Soroban write."
          tone="ink"
        >
          <form className="form-grid" onSubmit={handleSessionSubmit}>
            <label>
              <span>Focus topic</span>
              <input
                type="text"
                placeholder="Systems design review"
                value={sessionForm.topic}
                onChange={(event) =>
                  setSessionForm((current) => ({ ...current, topic: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Minutes invested</span>
              <input
                type="number"
                min="5"
                max="480"
                step="5"
                value={sessionForm.minutesSpent}
                onChange={(event) =>
                  setSessionForm((current) => ({
                    ...current,
                    minutesSpent: event.target.value
                  }))
                }
              />
            </label>
            <button
              className="button button-primary"
              type="submit"
              disabled={anyMutationPending || !wallet.account || !dashboard || !hasContractConfig()}
            >
              {logSessionMutation.isPending ? "Logging..." : "Log session"}
            </button>
          </form>
        </Panel>
      </section>

      <section className="panel-grid panel-grid-bottom">
        <Panel
          eyebrow="Ledger feed"
          title="Recent chain-confirmed focus sessions"
          body="The latest five sessions are pulled directly from the deployed contract for this connected wallet."
          tone="ink"
        >
          {sessionsQuery.isLoading ? (
            <ActivitySkeleton />
          ) : sessionsQuery.data?.length ? (
            <div className="session-list">
              {sessionsQuery.data.map((session) => (
                <article className="session-card" key={session.id}>
                  <div>
                    <h3>{session.topic}</h3>
                    <p>{formatDate(session.timestamp)}</p>
                  </div>
                  <div className="session-meta">
                    <span>{formatMinutes(session.minutesSpent)}</span>
                    <span>Streak {session.streakAfterLog}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {dashboard
                ? "Your feed will populate after the first logged focus block."
                : "Create a profile first, then the last five sessions will appear here."}
            </p>
          )}
        </Panel>

        <Panel
          eyebrow="Platform overview"
          title="How FocusForge works"
          body="FocusForge combines Freighter wallet access, Soroban contract writes, and a streamlined dashboard for tracking deep-work sessions on Stellar."
          tone="mint"
        >
          <ul className="check-list">
            <li>Connect a Freighter wallet on Stellar Testnet</li>
            <li>Create a profile and set a weekly focus target</li>
            <li>Log verified deep-work sessions on-chain</li>
            <li>Track weekly progress, totals, and streak momentum</li>
          </ul>
        </Panel>
      </section>
    </div>
  );
}
