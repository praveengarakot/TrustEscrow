import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WatchWalletChanges } from "@stellar/freighter-api";
import {
  configuredContractId,
  configuredRewardsContractId,
  configuredRpcUrl,
  configuredNetworkPassphrase,
  connectWallet,
  discoverWalletState,
  formatDate,
  formatDateTime,
  formatMinutes,
  getContractExplorerLink,
  getExplorerLink,
  getNetworkLabel,
  hasContractConfig,
  logSession,
  parseError,
  readContractEvents,
  readDashboard,
  readGlobalStats,
  readRecentSessions,
  readBadges,
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

const badgeDefinitions = {
  1: { name: "Bronze Operator", desc: "Forged 60+ minutes of total focus time", color: "#8a5a36", icon: "🥉" },
  2: { name: "Silver Operator", desc: "Forged 300+ minutes of total focus time", color: "#71717a", icon: "🥈" },
  3: { name: "Gold Operator", desc: "Forged 1000+ minutes of total focus time", color: "#b45309", icon: "🥇" }
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

function ActivityTicker({ active = false }) {
  return (
    <span className={`ticker ${active ? "ticker-live" : ""}`}>
      <span />
      {active ? "Polling live" : "Idle"}
    </span>
  );
}

export default function App() {
  const queryClient = useQueryClient();
  const [wallet, setWallet] = useState(emptyWallet);
  const [txState, setTxState] = useState(emptyTx);
  const [page, setPage] = useState("dashboard"); // "dashboard", "log", "profile", "badges", "history"
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
  const contractReady = hasContractConfig();
  const readyForReads = Boolean(wallet.account) && contractReady && !wrongNetwork;
  const contractExplorerLink = getContractExplorerLink(
    configuredNetworkPassphrase,
    configuredContractId
  );

  const globalStatsQuery = useQuery({
    queryKey: ["global-stats", configuredContractId],
    queryFn: () => readGlobalStats(),
    enabled: contractReady,
    refetchInterval: 20_000
  });

  const contractEventsQuery = useQuery({
    queryKey: ["contract-events", configuredContractId],
    queryFn: () => readContractEvents(6),
    enabled: contractReady,
    refetchInterval: 15_000
  });

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", wallet.account, wallet.networkPassphrase],
    queryFn: () => readDashboard(wallet.account),
    enabled: readyForReads,
    refetchInterval: 20_000
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions", wallet.account, wallet.networkPassphrase, dashboardQuery.data?.sessionCount || 0],
    queryFn: () => readRecentSessions(wallet.account, 5),
    enabled: readyForReads && Boolean(dashboardQuery.data),
    refetchInterval: 20_000
  });

  const badgesQuery = useQuery({
    queryKey: ["badges", wallet.account, wallet.networkPassphrase, dashboardQuery.data?.totalMinutes || 0],
    queryFn: () => readBadges(wallet.account),
    enabled: readyForReads && Boolean(dashboardQuery.data),
    refetchInterval: 20_000
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
  const globalStats = globalStatsQuery.data;
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
        queryClient.invalidateQueries({ queryKey: ["sessions", wallet.account] }),
        queryClient.invalidateQueries({ queryKey: ["badges", wallet.account] }),
        queryClient.invalidateQueries({ queryKey: ["global-stats", configuredContractId] }),
        queryClient.invalidateQueries({ queryKey: ["contract-events", configuredContractId] })
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

    setSessionForm({
      topic: "",
      minutesSpent: sessionForm.minutesSpent
    });
  }

  const txExplorerLink = getExplorerLink(wallet.networkPassphrase, txState.hash);

  const statusMessage =
    wallet.error ||
    (wrongNetwork
      ? `Connected to ${getNetworkLabel(wallet.networkPassphrase)}. Switch Freighter to ${getNetworkLabel(configuredNetworkPassphrase)}.`
      : txState.message ||
        (contractReady
          ? "ForgeMind is ready to log study blocks."
          : "Deploy the Soroban contract and export config before using the app."));

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <h2>ForgeMind</h2>
        </div>
        <nav className="nav-links">
          <button className={`nav-item ${page === "dashboard" ? "active" : ""}`} onClick={() => setPage("dashboard")}>
            📊 Dashboard
          </button>
          <button className={`nav-item ${page === "log" ? "active" : ""}`} onClick={() => setPage("log")}>
            ⏱️ Log Focus
          </button>
          <button className={`nav-item ${page === "profile" ? "active" : ""}`} onClick={() => setPage("profile")}>
            👤 Profile & Target
          </button>
          <button className={`nav-item ${page === "badges" ? "active" : ""}`} onClick={() => setPage("badges")}>
            🏆 Achievements
          </button>
          <button className={`nav-item ${page === "history" ? "active" : ""}`} onClick={() => setPage("history")}>
            📜 Chain History
          </button>
        </nav>
        <div className="sidebar-footer">
          <span className="network-pill">
            {wallet.networkPassphrase ? getNetworkLabel(wallet.networkPassphrase) : "Freighter offline"}
          </span>
        </div>
      </aside>

      <main className="main-content">
        <header className="main-header">
          <div className="header-status">
            <span className="live-dot-wrapper">
              <span className="live-dot" /> Live RPC
            </span>
            <span className="wallet-addr">{wallet.account ? shortAddress(wallet.account) : "No wallet connected"}</span>
          </div>
          <button className="button button-header" onClick={handleConnectWallet} disabled={wallet.isConnecting}>
            {wallet.isConnecting ? "Connecting..." : wallet.account ? "Wallet Linked" : "Link Wallet"}
          </button>
        </header>

        <section className="status-banner">
          <div>
            <p className="status-label">Status Info</p>
            <p className="status-copy">{statusMessage}</p>
          </div>
          {txExplorerLink ? (
            <a className="status-link" href={txExplorerLink} target="_blank" rel="noreferrer">
              View transaction
            </a>
          ) : null}
        </section>

        {page === "dashboard" && (
          <div className="page-fade">
            <section className="metrics-grid">
              <MetricCard
                label="Forge Time"
                value={dashboard ? formatMinutes(dashboard.totalMinutes) : "0m"}
                note={dashboard ? `${dashboard.sessionCount} deep blocks` : "No sessions logged"}
                loading={dashboardQuery.isLoading}
              />
              <MetricCard
                label="Target Status"
                value={dashboard ? formatMinutes(dashboard.minutesThisWeek) : "0m"}
                note={dashboard ? `${Math.max(dashboard.weeklyGoalMinutes - dashboard.minutesThisWeek, 0)}m remaining` : "No target set"}
                loading={dashboardQuery.isLoading}
              />
              <MetricCard
                label="Forge Streak"
                value={dashboard ? `${dashboard.currentStreak} day${dashboard.currentStreak === 1 ? "" : "s"}` : "0 days"}
                note={dashboard?.goalReachedThisWeek ? "Weekly target completed" : "Keep forging"}
                loading={dashboardQuery.isLoading}
              />
              <MetricCard
                label="Global Operators"
                value={globalStats ? String(globalStats.learnerCount) : "0"}
                note="Profiles registered"
                loading={globalStatsQuery.isLoading}
              />
            </section>

            <div className="dashboard-summary-panel" style={{ marginTop: '1.5rem' }}>
              <Panel eyebrow="Overview" title="ForgeMind Performance Dashboard" tone="mint">
                <p className="lead" style={{ color: '#64748b', fontSize: '1rem', marginTop: 0 }}>
                  Track your deep study effort, forge consecutive-day study streaks, and unlock cryptographic milestone badges on the Stellar blockchain.
                </p>
                <div className="progress-shell" style={{ marginTop: '2rem' }}>
                  <div className="progress-labels">
                    <span>Weekly Target Progress</span>
                    <span>{dashboard ? `${weeklyProgress}%` : "0%"}</span>
                  </div>
                  <div className="progress-track">
                    <span className="progress-fill" style={{ width: `${weeklyProgress}%` }} />
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {page === "log" && (
          <div className="page-fade">
            <Panel eyebrow="Action" title="Forge Focus Block" tone="ink">
              <form className="form-grid" onSubmit={handleSessionSubmit}>
                <label>
                  <span>Focus topic</span>
                  <input type="text" maxLength="48" required placeholder="Systems design review" value={sessionForm.topic} onChange={(e) => setSessionForm(curr => ({ ...curr, topic: e.target.value }))} />
                </label>
                <label>
                  <span>Minutes invested</span>
                  <input type="number" min="5" max="480" step="5" required value={sessionForm.minutesSpent} onChange={(e) => setSessionForm(curr => ({ ...curr, minutesSpent: e.target.value }))} />
                </label>
                <button className="button button-primary" type="submit" disabled={anyMutationPending || !wallet.account || !dashboard || !contractReady}>
                  {logSessionMutation.isPending ? "Logging..." : "Log focus session"}
                </button>
              </form>
            </Panel>
          </div>
        )}

        {page === "profile" && (
          <div className="page-fade">
            <div className="profile-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
              <Panel eyebrow="Setup" title="Operator Settings" tone="ember">
                <form className="form-grid" onSubmit={handleProfileSubmit}>
                  <label>
                    <span>Display name</span>
                    <input type="text" maxLength="32" required placeholder="Signal Architect" value={profileForm.displayName} onChange={(e) => setProfileForm(curr => ({ ...curr, displayName: e.target.value }))} />
                  </label>
                  <label>
                    <span>Weekly goal (minutes)</span>
                    <input type="number" min="30" max="5000" step="5" required value={profileForm.weeklyGoalMinutes} onChange={(e) => setProfileForm(curr => ({ ...curr, weeklyGoalMinutes: e.target.value }))} />
                  </label>
                  <button className="button button-primary" type="submit" disabled={anyMutationPending || !wallet.account || !contractReady}>
                    {saveProfileMutation.isPending ? "Saving..." : "Save profile"}
                  </button>
                </form>
              </Panel>

              <Panel eyebrow="Target" title="Retune target goal" tone="mint">
                <form className="form-grid" onSubmit={handleGoalSubmit}>
                  <label>
                    <span>New weekly goal</span>
                    <input type="number" min="30" max="5000" step="5" required value={goalForm} onChange={(e) => setGoalForm(e.target.value)} />
                  </label>
                  <button className="button button-secondary" type="submit" disabled={anyMutationPending || !wallet.account || !dashboard || !contractReady}>
                    {updateGoalMutation.isPending ? "Updating..." : "Update goal"}
                  </button>
                </form>
              </Panel>
            </div>
          </div>
        )}

        {page === "badges" && (
          <div className="page-fade">
            <Panel eyebrow="Achievements" title="Cryptographic Milestone Badges" tone="mint">
              {badgesQuery.isLoading ? (
                <ActivitySkeleton />
              ) : badgesQuery.data?.length ? (
                <div className="badge-grid">
                  {badgesQuery.data.map((badgeId) => {
                    const def = badgeDefinitions[badgeId] || { name: `Badge #${badgeId}`, desc: "Milestone unlocked", icon: "🏆" };
                    return (
                      <article className="badge-card" key={badgeId}>
                        <span className="badge-icon-wrapper">{def.icon}</span>
                        <h3>{def.name}</h3>
                        <p>{def.desc}</p>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-state">No badges earned yet. Forge focus blocks to unlock achievements on-chain.</p>
              )}
            </Panel>
          </div>
        )}

        {page === "history" && (
          <div className="page-fade">
            <div className="history-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem' }}>
              <Panel eyebrow="Ledger" title="Recent Sessions" tone="ink">
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
                  <p className="empty-state">No focus blocks recorded on-chain yet.</p>
                )}
              </Panel>

              <Panel eyebrow="RPC" title="Contract Events" tone="ember">
                <div className="panel-toolbar" style={{ marginBottom: '1rem' }}>
                  <ActivityTicker active={contractEventsQuery.isFetching} />
                </div>
                {contractEventsQuery.isLoading ? (
                  <ActivitySkeleton />
                ) : contractEventsQuery.data?.length ? (
                  <div className="event-stream">
                    {contractEventsQuery.data.map((event) => (
                      <article className="event-card" key={event.id}>
                        <div>
                          <p className="event-kicker">{event.summary}</p>
                          <h3>{event.topics.join(" / ")}</h3>
                          <p>{formatDateTime(event.closedAt)}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">No recent contract events detected.</p>
                )}
              </Panel>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
