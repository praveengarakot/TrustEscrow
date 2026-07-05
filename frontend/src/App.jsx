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

function ArrowRightIcon({ size = 16, className }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={size} height={size} className={className} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function CheckIcon({ size = 14, className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" width={size} height={size} className={className} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path d="M3.5 8.6l2.9 2.9L12.6 5" />
    </svg>
  );
}

function Panel({ eyebrow, title, body, children, n }) {
  return (
    <section className="panel">
      <div className="panel__top">
        {n && <span className="panel__n">{n}</span>}
        <p className="eyebrow kicker" style={{ margin: 0 }}>{eyebrow}</p>
        <h2 className="panel__title">{title}</h2>
      </div>
      {body ? <p className="panel__desc">{body}</p> : null}
      <div className="panel__content">{children}</div>
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
    <span className={`wchip ${active ? "ticker-live" : ""}`}>
      <span className="live" style={{ backgroundColor: active ? "var(--ok)" : "var(--ink-3)" }} />
      {active ? "Polling events..." : "Event stream idle"}
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

  // Simple scroll reveal simulation
  useEffect(() => {
    const reveals = document.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("shown");
        }
      });
    }, { threshold: 0.1 });
    reveals.forEach((r) => observer.observe(r));
    return () => observer.disconnect();
  }, [wallet.account, page]);

  const wrongNetwork =
    sidebarNetworkCheck(wallet.networkPassphrase);
  
  function sidebarNetworkCheck(passphrase) {
    return Boolean(passphrase) && passphrase !== configuredNetworkPassphrase;
  }

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
      // Return back to dashboard to view the newly created/updated agreement status
      setPage("dashboard");
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
    0: { text: "Pending", class: "tag warning" },
    1: { text: "Submitted", class: "tag ok" },
    2: { text: "Approved", class: "tag ok" },
    3: { text: "Disputed", class: "tag alert" },
    4: { text: "Refunded", class: "tag" }
  };

  const projectStatusLabels = {
    0: { text: "Active", class: "tag ok" },
    1: { text: "Completed", class: "tag ok" },
    2: { text: "Disputed", class: "tag alert" }
  };

  return (
    <>
      <header className="nav">
        <div className="nav__in wrap">
          <a className="brand" href="#top" aria-label="TrustEscrow Home" onClick={(e) => {
            e.preventDefault();
            setWallet(emptyWallet);
            setPage("dashboard");
          }}>
            <span className="brand__word">trustescrow</span>
          </a>
          
          {wallet.account && (
            <nav className="nav__links" aria-label="Primary Workspace Links">
              <button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}>Dashboard</button>
              <button className={page === "create" ? "active" : ""} onClick={() => setPage("create")}>New Agreement</button>
              <button className={page === "provider" ? "active" : ""} onClick={() => setPage("provider")}>Provider Desk</button>
              <button className={page === "client" ? "active" : ""} onClick={() => setPage("client")}>Client Desk</button>
              <button className={page === "arbitration" ? "active" : ""} onClick={() => setPage("arbitration")}>Arbitration Desk</button>
              <button className={page === "history" ? "active" : ""} onClick={() => setPage("history")}>Event Stream</button>
            </nav>
          )}

          <div>
            {wallet.account ? (
              <span className="wchip" title={wallet.account}>
                <span className="live" />
                {shortAddress(wallet.account)} · {wallet.network ? wallet.network : "Stellar"}
              </span>
            ) : (
              <button className="btn btn--primary btn--sm" onClick={handleConnectWallet} disabled={wallet.isConnecting}>
                {wallet.isConnecting ? <span className="spinner" /> : null}
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {wallet.account && (
        <nav className="mobile-nav" aria-label="Mobile Workspace Links">
          <button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}>Dashboard</button>
          <button className={page === "create" ? "active" : ""} onClick={() => setPage("create")}>Create</button>
          <button className={page === "provider" ? "active" : ""} onClick={() => setPage("provider")}>Provider</button>
          <button className={page === "client" ? "active" : ""} onClick={() => setPage("client")}>Client</button>
          <button className={page === "arbitration" ? "active" : ""} onClick={() => setPage("arbitration")}>Resolve</button>
          <button className={page === "history" ? "active" : ""} onClick={() => setPage("history")}>Events</button>
        </nav>
      )}

      <main className="wrap" style={{ paddingTop: '2.5rem' }}>

        {/* ----------------- LANDING PAGE / MARKETING STATE ----------------- */}
        {!wallet.account && (
          <div className="page-fade">
            {/* Hero Section */}
            <section className="hero" id="top">
              <div className="hero__grid">
                <div className="hero__copy" data-reveal>
                  <h1 className="display hero__title">
                    Milestone escrow.<br />
                    Show <span className="em">trustless</span> results.
                  </h1>
                  <p className="lede hero__lede">
                    Deploy secure milestone-locked escrow contracts, submit work proofs, and trigger settlements transparently on Stellar. Payouts release when milestones verify.
                  </p>
                  <div className="hero__cta">
                    <button className="btn btn--primary" onClick={handleConnectWallet}>
                      Connect Freighter Wallet
                    </button>
                  </div>
                </div>

                <div className="proofcard" data-reveal>
                  <div className="proofcard__inner">
                    <div className="pv-row">
                      <div className="pv-box">
                        <div className="pv-lbl">client funds</div>
                        <div className="pv-val">Locked Escrow</div>
                        <div className="pv-sub">Soroban smart contract</div>
                      </div>
                      <div className="pv-mid">
                        <ArrowRightIcon size={18} className="pv-arrow" />
                        <span>work verified</span>
                      </div>
                      <div className="pv-box">
                        <div className="pv-lbl">freelancer gets</div>
                        <div className="pv-val pv-check">
                          <CheckIcon size={15} /> Payout Released
                        </div>
                        <div className="pv-sub">milestone payout executed</div>
                      </div>
                    </div>
                  </div>
                  <p className="proofcard__cap">Arbitrated dispute resolutions are settled on-chain via ICC contracts.</p>
                </div>
              </div>
            </section>

            {/* How It Works Section */}
            <section className="section" id="how" style={{ borderTop: '1px solid var(--line-2)' }}>
              <div className="section__head center" data-reveal>
                <p className="kicker">How it works</p>
                <h2>Three roles, complete escrow flow, zero friction.</h2>
                <p>
                  Payments are locked in escrow, verified via deliverable proofs, and disputes are settled directly inside the smart contract without middleman risks.
                </p>
              </div>
              <div className="steps3" data-reveal>
                <div className="stepc">
                  <div className="stepc__hd">
                    <span className="stepc__n">01</span>
                    <span className="stepc__rule" />
                  </div>
                  <h3>Fund Milestones</h3>
                  <p>Client creates a project, defines milestone payouts, and deposits total funds into the Soroban contract escrow.</p>
                  <div className="stepc__meta">Client deposits funds</div>
                </div>
                <div className="stepc">
                  <div className="stepc__hd">
                    <span className="stepc__n">02</span>
                    <span className="stepc__rule" />
                  </div>
                  <h3>Submit Deliverables</h3>
                  <p>Freelancer completes work and attaches proof URLs directly to milestones on the decentralized ledger.</p>
                  <div className="stepc__meta">Provider registers proofs</div>
                </div>
                <div className="stepc">
                  <div className="stepc__hd">
                    <span className="stepc__n">03</span>
                    <span className="stepc__rule" />
                  </div>
                  <h3>payout or dispute</h3>
                  <p>Client verifies deliverables to release funds. If disputes occur, designated arbiters settle payouts dynamically.</p>
                  <div className="stepc__meta">Ledger settles balances</div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ----------------- WORKSPACE / INNER DASHBOARD STATE ----------------- */}
        {wallet.account && (
          <div className="page-fade">
            {page === "dashboard" && (
              <div className="page-fade">
                <section className="metrics-grid" data-reveal>
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

                <div style={{ marginTop: '1.5rem' }} data-reveal>
                  <Panel eyebrow="Overview" title="Decentralized Trust Platform" n="01">
                    <p style={{ margin: 0, color: 'var(--ink-2)' }}>
                      Deploy secure milestone-locked client escrow accounts, submit verified deliverables, and handle arbitration resolutions transparently on the Stellar network.
                    </p>
                  </Panel>
                </div>

                <div style={{ marginTop: '1.5rem' }} data-reveal>
                  <Panel eyebrow="Agreements" title="Active Agreements Overview" n="02">
                    {userProjectsQuery.isLoading ? (
                      <ActivitySkeleton />
                    ) : projects.length ? (
                      <div className="session-list">
                        {projects.map((p) => (
                          <article className="session-card" key={p.id}>
                            <div>
                              <span className={`${projectStatusLabels[p.status]?.class || "tag warning"}`} style={{ marginRight: '8px' }}>
                                {projectStatusLabels[p.status]?.text || "Unknown"}
                              </span>
                              <h3 style={{ display: 'inline-block', margin: 0 }}>{p.title}</h3>
                              <p style={{ marginTop: '4px', fontSize: '0.86rem', color: 'var(--ink-3)' }}>
                                Client: <span style={{ fontFamily: 'var(--mono)' }}>{shortAddress(p.client)}</span> | Provider: <span style={{ fontFamily: 'var(--mono)' }}>{shortAddress(p.provider)}</span>
                              </p>
                            </div>
                            <div className="session-meta">
                              <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--ink)' }}>${p.budget} USD</span>
                              <span>{p.milestoneCount} milestones</span>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--ink-3)' }}>No agreements associated with this wallet. Go to "New Agreement" to launch one.</p>
                    )}
                  </Panel>
                </div>
              </div>
            )}

            {page === "create" && (
              <div className="page-fade">
                <Panel eyebrow="Escrow Setup" title="Fund Milestone Agreement" n="01">
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

                    <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--line-2)', paddingTop: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                        <h3 style={{ margin: 0 }}>Milestones Breakdown</h3>
                        <button className="btn btn--secondary btn--sm" type="button" onClick={handleAddMilestoneInput}>+ Add Milestone</button>
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
                              className="btn btn--secondary"
                              type="button"
                              onClick={() => handleRemoveMilestoneInput(idx)}
                              style={{ color: 'var(--alert)', borderColor: 'var(--line-2)' }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button className="btn btn--primary btn--block" type="submit" disabled={anyMutationPending || !wallet.account}>
                      {createProjectMutation.isPending ? <span className="spinner" /> : null}
                      {createProjectMutation.isPending ? "Locking & Deploying..." : "Deploy & Lock Escrow Funds"}
                    </button>
                  </form>
                </Panel>
              </div>
            )}

            {page === "provider" && (
              <div className="page-fade">
                <Panel eyebrow="Freelancer Desk" title="Provider Deliverables Desk" n="01">
                  {userProjectsQuery.isLoading ? (
                    <ActivitySkeleton />
                  ) : providerProjects.length ? (
                    <div style={{ display: 'grid', gap: '2rem' }}>
                      {providerProjects.map((p) => (
                        <div key={p.id} style={{ borderBottom: '1px solid var(--line-2)', paddingBottom: '1.5rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                            <h3 style={{ margin: 0 }}>{p.title} (Project #{p.id})</h3>
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Total Budget: ${p.budget}</span>
                          </div>
                          <div className="session-list">
                            {p.milestones.map((m, idx) => (
                              <div className="session-card" key={idx} style={{ flexWrap: 'wrap', gap: '1rem' }}>
                                <div>
                                  <h4 style={{ margin: '0 0 4px 0' }}>{m.title}</h4>
                                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--ink-2)' }}>
                                    Amount: <strong style={{ color: 'var(--ink)' }}>${m.amount}</strong>
                                  </p>
                                  {m.proofUrl && (
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', fontFamily: 'var(--mono)' }}>
                                      Proof: <a href={m.proofUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{m.proofUrl}</a>
                                    </p>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                  <span className={`${milestoneStatusLabels[m.status]?.class || "tag warning"}`}>
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
                                      <button className="btn btn--secondary btn--sm" type="submit" disabled={anyMutationPending}>
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
                    <p style={{ color: 'var(--ink-3)' }}>No projects found where you are the Service Provider.</p>
                  )}
                </Panel>
              </div>
            )}

            {page === "client" && (
              <div className="page-fade">
                <Panel eyebrow="Client Approvals" title="Client Escrow Approvals Desk" n="01">
                  {userProjectsQuery.isLoading ? (
                    <ActivitySkeleton />
                  ) : clientProjects.length ? (
                    <div style={{ display: 'grid', gap: '2rem' }}>
                      {clientProjects.map((p) => (
                        <div key={p.id} style={{ borderBottom: '1px solid var(--line-2)', paddingBottom: '1.5rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                            <h3 style={{ margin: 0 }}>{p.title} (Project #{p.id})</h3>
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Budget Secured: ${p.budget}</span>
                          </div>
                          <div className="session-list">
                            {p.milestones.map((m, idx) => (
                              <div className="session-card" key={idx} style={{ flexWrap: 'wrap', gap: '1rem' }}>
                                <div>
                                  <h4 style={{ margin: '0 0 4px 0' }}>{m.title}</h4>
                                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--ink-2)' }}>
                                    Amount: <strong style={{ color: 'var(--ink)' }}>${m.amount}</strong>
                                  </p>
                                  {m.proofUrl && (
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', fontFamily: 'var(--mono)' }}>
                                      Proof submitted: <a href={m.proofUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{m.proofUrl}</a>
                                    </p>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span className={`${milestoneStatusLabels[m.status]?.class || "tag warning"}`} style={{ marginRight: '8px' }}>
                                    {milestoneStatusLabels[m.status]?.text || "Pending"}
                                  </span>

                                  {(m.status === 0 || m.status === 1 || m.status === 3) && (
                                    <>
                                      <button
                                        className="btn btn--secondary btn--sm"
                                        onClick={() => approveMilestoneMutation.mutate({ projectId: p.id, milestoneIndex: idx })}
                                        disabled={anyMutationPending}
                                        style={{ color: 'var(--ok)', borderColor: 'rgba(28,122,76,0.2)' }}
                                      >
                                        Release
                                      </button>
                                      {(m.status === 0 || m.status === 1) && (
                                        <button
                                          className="btn btn--secondary btn--sm"
                                          onClick={() => disputeMilestoneMutation.mutate({ projectId: p.id, milestoneIndex: idx })}
                                          disabled={anyMutationPending}
                                          style={{ color: 'var(--alert)', borderColor: 'rgba(178,59,75,0.2)' }}
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
                    <p style={{ color: 'var(--ink-3)' }}>No projects found where you are the Client.</p>
                  )}
                </Panel>
              </div>
            )}

            {page === "arbitration" && (
              <div className="page-fade">
                <Panel eyebrow="Resolution Desk" title="Dispute Arbitration Desk" n="01">
                  <p style={{ color: 'var(--ink-2)', marginBottom: '1.5rem' }}>
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
                      <select name="payout">
                        <option value="provider">Payout Escrow Funds to Freelancer (Provider)</option>
                        <option value="client">Refund Escrow Funds to Client</option>
                      </select>
                    </label>

                    <button className="btn btn--primary btn--block" type="submit" disabled={anyMutationPending || !wallet.account || !contractReady}>
                      {resolveDisputeMutation.isPending ? <span className="spinner" /> : null}
                      {resolveDisputeMutation.isPending ? "Executing Resolution..." : "Execute Arbitration Payout"}
                    </button>
                  </form>
                </Panel>
              </div>
            )}

            {page === "history" && (
              <div className="page-fade">
                <Panel eyebrow="Stellar RPC" title="Escrow Contract Event Stream" n="01">
                  <div style={{ marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                            <h3 style={{ margin: 0 }}>{event.summary}</h3>
                            <p style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem', marginTop: '4px', color: 'var(--ink-2)' }}>
                              Transaction: <a href={getExplorerLink(wallet.networkPassphrase, event.txHash)} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{shortAddress(event.txHash)}</a>
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--ink-3)' }}>No recent escrow contract events detected.</p>
                  )}
                </Panel>
              </div>
            )}
          </div>
        )}
      </main>
      
      <footer className="foot wrap">
        <div className="foot__in">
          <span>trustescrow, milestone-locked escrow agreements secured on Stellar Soroban</span>
          <span>testnet, Apache 2.0</span>
        </div>
      </footer>

      <a 
        href="https://forms.gle/4PRxsnXBNGUrtvrB9" 
        target="_blank" 
        rel="noreferrer" 
        className="floating-feedback-btn"
      >
        💬 Submit Feedback
      </a>
    </>
  );
}
