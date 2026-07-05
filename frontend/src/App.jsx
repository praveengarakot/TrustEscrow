import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WatchWalletChanges } from "@stellar/freighter-api";
import {
  configuredContractId,
  configuredNetworkPassphrase,
  connectWallet,
  discoverWalletState,
  getExplorerLink,
  getNetworkLabel,
  hasContractConfig,
  shortAddress,
  parseError,
  readContractEvents,
  readGlobalStats,
  readUserProjects,
  createProject,
  submitMilestoneProof,
  approveMilestone,
  disputeMilestone,
  resolveDispute
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
  const [page, setPage] = useState("dashboard"); // "dashboard", "create", "provider", "client", "arbitration", "history"

  // Create Project Form State
  const [newProjectForm, setNewProjectForm] = useState({
    provider: "",
    title: "",
    budget: "100",
    milestones: [
      { title: "Design Phase", amount: "40" },
      { title: "Development Phase", amount: "60" }
    ]
  });

  // Proof Submission State
  const [proofForms, setProofForms] = useState({});

  useEffect(() => {
    let isMounted = true;
    let watcher = null;

    async function syncWallet() {
      try {
        const nextState = await discoverWalletState();
        if (!isMounted) return;

        setWallet((current) => ({
          ...current,
          ...nextState,
          isConnecting: false,
          error: ""
        }));
      } catch (error) {
        if (!isMounted) return;

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

  // Queries
  const globalStatsQuery = useQuery({
    queryKey: ["global-stats", configuredContractId],
    queryFn: () => readGlobalStats(),
    enabled: contractReady,
    refetchInterval: 15_000
  });

  const contractEventsQuery = useQuery({
    queryKey: ["contract-events", configuredContractId],
    queryFn: () => readContractEvents(6),
    enabled: contractReady,
    refetchInterval: 15_000
  });

  const userProjectsQuery = useQuery({
    queryKey: ["user-projects", wallet.account, wallet.networkPassphrase],
    queryFn: () => readUserProjects(wallet.account),
    enabled: readyForReads,
    refetchInterval: 15_000
  });

  const projects = useMemo(() => userProjectsQuery.data || [], [userProjectsQuery.data]);
  const globalStats = globalStatsQuery.data;

  // Split projects into client and provider roles
  const clientProjects = useMemo(() => {
    return projects.filter((p) => p.client === wallet.account);
  }, [projects, wallet.account]);

  const providerProjects = useMemo(() => {
    return projects.filter((p) => p.provider === wallet.account);
  }, [projects, wallet.account]);

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
        queryClient.invalidateQueries({ queryKey: ["user-projects", wallet.account] }),
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

  // Mutations
  const createProjectMutation = useMutation({
    mutationFn: ({ provider, title, budget, milestoneTitles, milestoneAmounts }) =>
      runLedgerAction(
        () => createProject(wallet.account, provider, title, budget, milestoneTitles, milestoneAmounts),
        "Deploying milestone project to Stellar...",
        "Escrow project funded & created successfully."
      )
  });

  const submitProofMutation = useMutation({
    mutationFn: ({ projectId, milestoneIndex, proofUrl }) =>
      runLedgerAction(
        () => submitMilestoneProof(wallet.account, projectId, milestoneIndex, proofUrl),
        "Submitting milestone work proof to the contract...",
        "Deliverable proof submitted."
      )
  });

  const approveMilestoneMutation = useMutation({
    mutationFn: ({ projectId, milestoneIndex }) =>
      runLedgerAction(
        () => approveMilestone(wallet.account, projectId, milestoneIndex),
        "Authorizing milestone payment release...",
        "Milestone approved and payout released."
      )
  });

  const disputeMilestoneMutation = useMutation({
    mutationFn: ({ projectId, milestoneIndex }) =>
      runLedgerAction(
        () => disputeMilestone(wallet.account, projectId, milestoneIndex),
        "Escalating milestone to dispute arbitration...",
        "Dispute raised. Funds locked under arbitration."
      )
  });

  const resolveDisputeMutation = useMutation({
    mutationFn: ({ projectId, milestoneIndex, payout }) =>
      runLedgerAction(
        () => resolveDispute(wallet.account, projectId, milestoneIndex, payout),
        "Submitting resolution decision to arbitration contract...",
        "Dispute resolved and callback settlement executed."
      )
  });

  const anyMutationPending =
    createProjectMutation.isPending ||
    submitProofMutation.isPending ||
    approveMilestoneMutation.isPending ||
    disputeMilestoneMutation.isPending ||
    resolveDisputeMutation.isPending;

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

  // Form Handlers
  function handleCreateProject(e) {
    e.preventDefault();
    const provider = newProjectForm.provider.trim();
    const title = newProjectForm.title.trim();
    const budget = Number(newProjectForm.budget);
    const milestoneTitles = newProjectForm.milestones.map((m) => m.title.trim());
    const milestoneAmounts = newProjectForm.milestones.map((m) => Number(m.amount));

    if (!provider || !title || !budget) {
      setTxState({ status: "error", message: "All fields are required.", hash: "" });
      return;
    }

    const sumAmounts = milestoneAmounts.reduce((a, b) => a + b, 0);
    if (sumAmounts !== budget) {
      setTxState({ status: "error", message: `Milestones sum (${sumAmounts}) must match total budget (${budget}).`, hash: "" });
      return;
    }

    createProjectMutation.mutate({
      provider,
      title,
      budget,
      milestoneTitles,
      milestoneAmounts
    });
  }

  function handleAddMilestoneInput() {
    setNewProjectForm((prev) => ({
      ...prev,
      milestones: [...prev.milestones, { title: "", amount: "0" }]
    }));
  }

  function handleRemoveMilestoneInput(index) {
    setNewProjectForm((prev) => ({
      ...prev,
      milestones: prev.milestones.filter((_, i) => i !== index)
    }));
  }

  function handleMilestoneInputChange(index, field, value) {
    const updated = [...newProjectForm.milestones];
    updated[index][field] = value;
    setNewProjectForm((prev) => ({ ...prev, milestones: updated }));
  }

  const txExplorerLink = getExplorerLink(wallet.networkPassphrase, txState.hash);

  const statusMessage =
    wallet.error ||
    (wrongNetwork
      ? `Connected to ${getNetworkLabel(wallet.networkPassphrase)}. Switch Freighter to ${getNetworkLabel(configuredNetworkPassphrase)}.`
      : txState.message ||
        (contractReady
          ? "TrustEscrow is ready to secure milestone agreements."
          : "Deploy the Soroban contracts and export config before using the app."));

  const milestoneStatusLabels = {
    0: { text: "Pending", class: "status-pending" },
    1: { text: "Submitted", class: "status-submitted" },
    2: { text: "Approved", class: "status-approved" },
    3: { text: "Disputed", class: "status-disputed" },
    4: { text: "Refunded", class: "status-refunded" }
  };

  const projectStatusLabels = {
    0: { text: "Active", class: "proj-active" },
    1: { text: "Completed", class: "proj-completed" },
    2: { text: "Disputed", class: "proj-disputed" }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <h2>TrustEscrow</h2>
        </div>
        <nav className="nav-links">
          <button className={`nav-item ${page === "dashboard" ? "active" : ""}`} onClick={() => setPage("dashboard")}>
            📊 Dashboard
          </button>
          <button className={`nav-item ${page === "create" ? "active" : ""}`} onClick={() => setPage("create")}>
            🤝 New Agreement
          </button>
          <button className={`nav-item ${page === "provider" ? "active" : ""}`} onClick={() => setPage("provider")}>
            ⏱️ Provider Hub
          </button>
          <button className={`nav-item ${page === "client" ? "active" : ""}`} onClick={() => setPage("client")}>
            👤 Client Hub
          </button>
          <button className={`nav-item ${page === "arbitration" ? "active" : ""}`} onClick={() => setPage("arbitration")}>
            ⚖️ Arbitration Desk
          </button>
          <button className={`nav-item ${page === "history" ? "active" : ""}`} onClick={() => setPage("history")}>
            📜 Events Stream
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
                label="Global Projects"
                value={globalStats ? String(globalStats.projectCount) : "0"}
                note="Agreements Created"
                loading={globalStatsQuery.isLoading}
              />
              <MetricCard
                label="Total Funded"
                value={globalStats ? `$${globalStats.totalBudget}` : "$0"}
                note="Locked volume history"
                loading={globalStatsQuery.isLoading}
              />
              <MetricCard
                label="Active Escrow"
                value={globalStats ? `$${globalStats.active_escrow || globalStats.activeEscrow}` : "$0"}
                note="Currently secured funds"
                loading={globalStatsQuery.isLoading}
              />
              <MetricCard
                label="My Active Roles"
                value={projects.length ? String(projects.length) : "0"}
                note={`${clientProjects.length} client / ${providerProjects.length} provider`}
                loading={userProjectsQuery.isLoading}
              />
            </section>

            <div style={{ marginTop: '1.5rem' }}>
              <Panel eyebrow="Overview" title="Decentralized Trust Platform" tone="mint">
                <p className="lead" style={{ color: '#64748b', fontSize: '1rem', marginTop: 0 }}>
                  Deploy secure milestone-locked client escrow accounts, submit verified deliverables, and handle arbitration resolutions transparently on the Stellar network.
                </p>
              </Panel>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <Panel eyebrow="Agreements" title="Active Agreements Overview" tone="ink">
                {userProjectsQuery.isLoading ? (
                  <ActivitySkeleton />
                ) : projects.length ? (
                  <div className="session-list">
                    {projects.map((p) => (
                      <article className="session-card" key={p.id}>
                        <div>
                          <span className={`network-pill ${projectStatusLabels[p.status]?.class || "status-pending"}`} style={{ marginRight: '8px' }}>
                            {projectStatusLabels[p.status]?.text || "Unknown"}
                          </span>
                          <h3 style={{ display: 'inline-block' }}>{p.title}</h3>
                          <p style={{ marginTop: '4px' }}>
                            Client: <span style={{ fontFamily: 'monospace' }}>{shortAddress(p.client)}</span> | Provider: <span style={{ fontFamily: 'monospace' }}>{shortAddress(p.provider)}</span>
                          </p>
                        </div>
                        <div className="session-meta">
                          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>${p.budget} USD</span>
                          <span>{p.milestoneCount} milestones</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">No agreements associated with this wallet. Go to "New Agreement" to launch one.</p>
                )}
              </Panel>
            </div>
          </div>
        )}

        {page === "create" && (
          <div className="page-fade">
            <Panel eyebrow="Escrow" title="Fund Milestone Agreement" tone="ink">
              <form className="form-grid" onSubmit={handleCreateProject}>
                <label>
                  <span>Project Title</span>
                  <input type="text" required placeholder="Build Soroban Smart Escrow Dashboard" value={newProjectForm.title} onChange={(e) => setNewProjectForm(curr => ({ ...curr, title: e.target.value }))} />
                </label>
                <label>
                  <span>Service Provider (Freelancer Wallet Address)</span>
                  <input type="text" required placeholder="G..." value={newProjectForm.provider} onChange={(e) => setNewProjectForm(curr => ({ ...curr, provider: e.target.value }))} />
                </label>
                <label>
                  <span>Total Escrow Budget (USD Credits)</span>
                  <input type="number" required placeholder="500" value={newProjectForm.budget} onChange={(e) => setNewProjectForm(curr => ({ ...curr, budget: e.target.value }))} />
                </label>

                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3>Milestones Breakdown</h3>
                    <button className="button button-header" type="button" onClick={handleAddMilestoneInput}>+ Add Milestone</button>
                  </div>

                  {newProjectForm.milestones.map((milestone, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        required
                        placeholder="Deliverable Name"
                        value={milestone.title}
                        onChange={(e) => handleMilestoneInputChange(idx, "title", e.target.value)}
                        style={{ flex: 2 }}
                      />
                      <input
                        type="number"
                        required
                        placeholder="Amount"
                        value={milestone.amount}
                        onChange={(e) => handleMilestoneInputChange(idx, "amount", e.target.value)}
                        style={{ flex: 1 }}
                      />
                      {newProjectForm.milestones.length > 1 && (
                        <button
                          className="button button-header"
                          type="button"
                          onClick={() => handleRemoveMilestoneInput(idx)}
                          style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button className="button button-primary" type="submit" disabled={anyMutationPending || !wallet.account || !contractReady}>
                  {createProjectMutation.isPending ? "Locking & Deploying..." : "Deploy & Lock Escrow Funds"}
                </button>
              </form>
            </Panel>
          </div>
        )}

        {page === "provider" && (
          <div className="page-fade">
            <Panel eyebrow="Freelancer" title="Provider Deliverables Desk" tone="ink">
              {userProjectsQuery.isLoading ? (
                <ActivitySkeleton />
              ) : providerProjects.length ? (
                <div style={{ display: 'grid', gap: '2rem' }}>
                  {providerProjects.map((p) => (
                    <div key={p.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3>{p.title} (Project #{p.id})</h3>
                        <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Total Budget: ${p.budget}</span>
                      </div>
                      <div className="session-list">
                        {p.milestones.map((m, idx) => (
                          <div className="session-card" key={idx} style={{ flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                              <h4 style={{ margin: '0 0 4px 0' }}>{m.title}</h4>
                              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                                Amount: <strong style={{ color: 'var(--text-primary)' }}>${m.amount}</strong>
                              </p>
                              {m.proofUrl && (
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                                  Proof: <a href={m.proofUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'var(--text-primary)' }}>{m.proofUrl}</a>
                                </p>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <span className={`network-pill ${milestoneStatusLabels[m.status]?.class || "status-pending"}`}>
                                {milestoneStatusLabels[m.status]?.text || "Pending"}
                              </span>

                              {m.status === 0 && (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const proof = proofForms[`${p.id}-${idx}`] || "";
                                    if (!proof) return;
                                    submitProofMutation.mutate({ projectId: p.id, milestoneIndex: idx, proofUrl: proof });
                                  }}
                                  style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                                >
                                  <input
                                    type="text"
                                    placeholder="GitHub URL / Proof URL"
                                    required
                                    value={proofForms[`${p.id}-${idx}`] || ""}
                                    onChange={(e) => setProofForms(prev => ({ ...prev, [`${p.id}-${idx}`]: e.target.value }))}
                                    style={{ width: '180px', padding: '0.5rem' }}
                                  />
                                  <button className="button button-header" type="submit" disabled={anyMutationPending}>
                                    Submit
                                  </button>
                                </form>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">No projects found where you are the Service Provider.</p>
              )}
            </Panel>
          </div>
        )}

        {page === "client" && (
          <div className="page-fade">
            <Panel eyebrow="Client" title="Client Escrow Approvals Desk" tone="ink">
              {userProjectsQuery.isLoading ? (
                <ActivitySkeleton />
              ) : clientProjects.length ? (
                <div style={{ display: 'grid', gap: '2rem' }}>
                  {clientProjects.map((p) => (
                    <div key={p.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3>{p.title} (Project #{p.id})</h3>
                        <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Budget Secured: ${p.budget}</span>
                      </div>
                      <div className="session-list">
                        {p.milestones.map((m, idx) => (
                          <div className="session-card" key={idx} style={{ flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                              <h4 style={{ margin: '0 0 4px 0' }}>{m.title}</h4>
                              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                                Amount: <strong style={{ color: 'var(--text-primary)' }}>${m.amount}</strong>
                              </p>
                              {m.proofUrl && (
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                                  Proof submitted: <a href={m.proofUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'var(--text-primary)' }}>{m.proofUrl}</a>
                                </p>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span className={`network-pill ${milestoneStatusLabels[m.status]?.class || "status-pending"}`} style={{ marginRight: '8px' }}>
                                {milestoneStatusLabels[m.status]?.text || "Pending"}
                              </span>

                              {(m.status === 0 || m.status === 1 || m.status === 3) && (
                                <>
                                  <button
                                    className="button button-header"
                                    onClick={() => approveMilestoneMutation.mutate({ projectId: p.id, milestoneIndex: idx })}
                                    disabled={anyMutationPending}
                                    style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}
                                  >
                                    Release
                                  </button>
                                  {(m.status === 0 || m.status === 1) && (
                                    <button
                                      className="button button-header"
                                      onClick={() => disputeMilestoneMutation.mutate({ projectId: p.id, milestoneIndex: idx })}
                                      disabled={anyMutationPending}
                                      style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}
                                    >
                                      Dispute
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">No projects found where you are the Client.</p>
              )}
            </Panel>
          </div>
        )}

        {page === "arbitration" && (
          <div className="page-fade">
            <Panel eyebrow="Resolution" title="Dispute Arbitration Desk" tone="ember">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Arbitration desk allows simulated third-party validators or admins to resolve active disputes by triggering the callback resolution sequence via Inter-Contract Communication (ICC).
              </p>

              <form
                className="form-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target;
                  const projectId = Number(target.projectId.value);
                  const milestoneIndex = Number(target.milestoneIndex.value);
                  const payout = target.payout.value === "provider";
                  resolveDisputeMutation.mutate({ projectId, milestoneIndex, payout });
                }}
              >
                <label>
                  <span>Project ID</span>
                  <input type="number" name="projectId" required placeholder="0" />
                </label>
                <label>
                  <span>Milestone Index</span>
                  <input type="number" name="milestoneIndex" required placeholder="0" />
                </label>
                <label>
                  <span>Arbitration Settlement Action</span>
                  <select name="payout" style={{ width: '100%', padding: '0.9rem 1.1rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'rgba(15, 23, 42, 0.6)' }}>
                    <option value="provider">Payout Escrow Funds to Freelancer (Provider)</option>
                    <option value="client">Refund Escrow Funds to Client</option>
                  </select>
                </label>

                <button className="button button-primary" type="submit" disabled={anyMutationPending || !wallet.account || !contractReady}>
                  {resolveDisputeMutation.isPending ? "Executing Resolution..." : "Execute Arbitration Payout"}
                </button>
              </form>
            </Panel>
          </div>
        )}

        {page === "history" && (
          <div className="page-fade">
            <div className="history-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
              <Panel eyebrow="RPC" title="Escrow Contract Event Stream" tone="ink">
                <div className="panel-toolbar" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                  <ActivityTicker active={contractEventsQuery.isFetching} />
                </div>
                {contractEventsQuery.isLoading ? (
                  <ActivitySkeleton />
                ) : contractEventsQuery.data?.length ? (
                  <div className="event-stream">
                    {contractEventsQuery.data.map((event) => (
                      <article className="event-card" key={event.id}>
                        <div>
                          <p className="event-kicker">{event.topics.join(" / ")}</p>
                          <h3>{event.summary}</h3>
                          <p style={{ fontFamily: 'monospace', fontSize: '0.82rem', marginTop: '4px' }}>
                            Transaction: <a href={getExplorerLink(wallet.networkPassphrase, event.txHash)} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{shortAddress(event.txHash)}</a>
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">No recent escrow contract events detected.</p>
                )}
              </Panel>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
