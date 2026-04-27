import { useEffect, useMemo, useRef, useState } from "react";
import {
  getRuleConfigs,
  getSimulationActivity,
  getSimulationControl,
  getSystemHealth,
  publishSimulationAlerts,
  replaySimulationAlerts,
  updateRuleConfigActive,
  updateSimulationControl
} from "../services/alertService";
import type { AlertLifecycle, RuleConfig, SimulationActivity, SimulationControl, SystemHealth } from "../services/alertService";
import { getSession } from "../services/auth";
import { formatCurrency, maskAccount } from "../utils/security";
import { useAppSettings } from "../context/AppSettingsContext";

type HistoryItem = { title: string; detail: string; time: string };

const PRESETS = [
  {
    key: "CARD_TESTING",
    label: "Card Testing",
    description: "Low-value attempts from the same account/device.",
    patch: { throughputPerMinute: 260, burstSize: 80, riskMultiplier: 0.95, highAmountShare: 6, scamMerchantShare: 4, deviceReuseShare: 20 }
  },
  {
    key: "ACCOUNT_TAKEOVER",
    label: "Account Takeover",
    description: "Fresh device, unusual location, rapid high-risk activity.",
    patch: { throughputPerMinute: 180, burstSize: 45, riskMultiplier: 1.45, highAmountShare: 18, scamMerchantShare: 8, deviceReuseShare: 35 }
  },
  {
    key: "VELOCITY_ATTACK",
    label: "Velocity Attack",
    description: "Burst of transactions within a short time window.",
    patch: { throughputPerMinute: 320, burstSize: 120, burstIntervalMinutes: 3, burstDurationSeconds: 4, riskMultiplier: 1.25, highAmountShare: 12, scamMerchantShare: 10, deviceReuseShare: 18 }
  },
  {
    key: "GEO_LOCATION_MISMATCH",
    label: "Geo Mismatch",
    description: "Location and IP country do not align.",
    patch: { throughputPerMinute: 150, burstSize: 35, riskMultiplier: 1.15, indiaShare: 42, usaShare: 38, highAmountShare: 9, scamMerchantShare: 6, deviceReuseShare: 12 }
  }
] as const;

export default function Simulation() {
  const { settings } = useAppSettings();
  const session = getSession();
  const workspaceKey = session?.email || session?.userName || "GLOBAL";
  const storageKey = `detectiq-simulation-${workspaceKey}`;
  const importRef = useRef<HTMLInputElement | null>(null);
  const simulationDefaults = settings?.simulation || {};

  const [simulation, setSimulation] = useState<SimulationControl>(() => defaultSimulation(workspaceKey, simulationDefaults));
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [rules, setRules] = useState<RuleConfig[]>([]);
  const [alerts, setAlerts] = useState<AlertLifecycle[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedResult, setSelectedResult] = useState<AlertLifecycle | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyRule, setBusyRule] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [remoteSimulation, remoteHealth, remoteRules, remoteReplay] = await Promise.all([
        getSimulationControl(),
        getSystemHealth(),
        getRuleConfigs(),
        replaySimulationAlerts().catch(() => [])
      ]);
      const saved = loadSaved(storageKey);
      setSimulation(mergeSimulation(remoteSimulation, saved, workspaceKey, simulationDefaults));
      setHealth(remoteHealth);
      setRules(remoteRules);
      setAlerts(remoteReplay);
      const remoteActivity = await getSimulationActivity().catch(() => []);
      setHistory(mapHistory(remoteActivity));
    };
    void load();
  }, [storageKey, workspaceKey, simulationDefaults]);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const sync = window.setInterval(() => {
      void getSystemHealth().then(setHealth).catch(() => setHealth(null));
    }, simulation.running ? 4000 : 10000);
    return () => window.clearInterval(sync);
  }, [simulation.running]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(simulation));
  }, [simulation, storageKey]);

  const runtimeSeconds = useMemo(() => {
    if (!simulation.running || !simulation.activatedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(simulation.activatedAt).getTime()) / 1000));
  }, [simulation.activatedAt, simulation.running, tick]);

  const metrics = useMemo(() => {
    const tx = simulation.running ? (health?.projectedTransactions || Math.max(0, Math.round((simulation.throughputPerMinute || 0) * Math.max(1, runtimeSeconds / 60)))) : (health?.totalTransactions || 0);
    const fraud = simulation.running ? (health?.projectedFraudDetected || Math.max(0, Math.round(tx * clampPercent((simulation.riskMultiplier || 1) * 0.12)))) : (health?.totalAlerts || 0);
    const alertsTriggered = simulation.running ? (health?.projectedAlertsTriggered || Math.max(fraud, Math.round(fraud * 1.1))) : (health?.totalAlerts || 0);
    const rate = simulation.running ? (health?.projectedFraudRate || (tx > 0 ? (fraud / tx) * 100 : 0)) : (health?.totalTransactions ? ((health.totalAlerts / health.totalTransactions) * 100) : 0);
    const load = health?.estimatedLoad || Math.min(100, (simulation.throughputPerMinute || 0) / 2 + (simulation.burstSize || 0) + (simulation.riskMultiplier || 1) * 10);
    const latency = health?.estimatedLatencyMs || Math.round(70 + load * 6);
    return { tx, fraud, alertsTriggered, rate, load, latency };
  }, [health, runtimeSeconds, simulation]);

  const persist = async (next: SimulationControl) => {
    setSaving(true);
    setError("");
    try {
      const updated = await updateSimulationControl({
        ...next,
        workspaceKey: next.workspaceKey || workspaceKey,
        profileName: next.profileName || "Custom Profile"
      });
      setSimulation(mergeSimulation(updated, null, workspaceKey));
      setHealth(await getSystemHealth());
      setMessage(`Saved ${next.profileName || "simulation"} in ${workspaceKey}.`);
      const remoteActivity = await getSimulationActivity().catch(() => []);
      setHistory(mapHistory(remoteActivity));
    } catch {
      setError("Unable to save simulation configuration.");
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = async (key: string) => {
    const preset = PRESETS.find((item) => item.key === key);
    if (!preset) return;
    const next = mergeSimulation(simulation, { scenario: preset.key, ...preset.patch }, workspaceKey, simulationDefaults);
    setSimulation(next);
    await persist(next);
  };

  const runAlertBatch = async () => {
    setSaving(true);
    setError("");
    try {
      const currentWorkspace = simulation.workspaceKey || workspaceKey;
      const batch = await publishSimulationAlerts({
        count: clampCount(simulation.alertsBatchSize || simulation.burstSize || 10),
        scenario: simulation.scenario,
        workspaceKey: currentWorkspace,
        profileName: simulation.profileName || workspaceKey
      });
      setAlerts(batch);
      setSelectedResult(batch[0] || null);
      setMessage(`Published ${batch.length} synthetic alerts.`);
      window.dispatchEvent(new Event("fraud:sync"));
      setHealth(await getSystemHealth());
      const remoteActivity = await getSimulationActivity().catch(() => []);
      setHistory(mapHistory(remoteActivity));
    } catch {
      setError("Unable to publish synthetic alerts.");
    } finally {
      setSaving(false);
    }
  };

  const replayLast = async () => {
    setSaving(true);
    setError("");
    try {
      const batch = await replaySimulationAlerts();
      setAlerts(batch);
      setSelectedResult(batch[0] || null);
      setMessage(`Replayed ${batch.length} alerts.`);
      const remoteActivity = await getSimulationActivity().catch(() => []);
      setHistory(mapHistory(remoteActivity));
    } catch {
      setError("No replay data available yet.");
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule: RuleConfig) => {
    setBusyRule(rule.ruleName);
    setError("");
    try {
      await updateRuleConfigActive(rule.ruleName, !rule.active);
      setRules(await getRuleConfigs());
      setHealth(await getSystemHealth());
      setHistory((prev) => [
        { title: "Rule toggled", detail: `${rule.ruleName} turned ${rule.active ? "off" : "on"}.`, time: new Date().toLocaleString() },
        ...prev
      ].slice(0, 12));
    } catch {
      setError(`Unable to update ${rule.ruleName}.`);
    } finally {
      setBusyRule(null);
    }
  };

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(simulation, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${simulation.profileName || "simulation-profile"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Simulation profile exported.");
  };

  const importConfig = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<SimulationControl>;
      const next = mergeSimulation(simulation, parsed, workspaceKey, simulationDefaults);
      setSimulation(next);
      await persist(next);
      setMessage("Simulation profile imported.");
    } catch {
      setError("Unable to import the selected file.");
    }
  };

  const patch = (partial: Partial<SimulationControl>) => setSimulation((prev) => ({ ...prev, ...partial }));
  return (
    <div className="simulation-page">
      <div className="simulation-hero">
        <div className="simulation-hero-copy">
          <p className="simulation-kicker">Transaction Simulation Engine</p>
          <h2>Advanced Simulation Console</h2>
          <p className="simulation-hero-copy-text">
            Build custom fraud scenarios, push alert batches to the live websocket, and tune rules and load without leaving the dashboard.
          </p>
        </div>
        <div className="simulation-hero-status">
          <span className={`chip ${simulation.running ? "high" : "approved"}`}>{simulation.running ? "Running" : "Stopped"}</span>
          <span className="chip medium">User ID: {simulation.userId || "-"}</span>
          <span className="chip medium">Workspace: {simulation.workspaceKey || workspaceKey}</span>
          <span className="chip approved">Context: {simulation.profileName || "Custom Profile"}</span>
        </div>
      </div>

      <div className="cards-grid" style={{ marginTop: 16 }}>
        <MetricCard label="Transactions Generated" value={formatInteger(metrics.tx)} tone="#23b0ff" />
        <MetricCard label="Fraud Detected" value={formatInteger(metrics.fraud)} tone="#f54b64" />
        <MetricCard label="Alerts Triggered" value={formatInteger(metrics.alertsTriggered)} tone="#f0ad4e" />
        <MetricCard label="Fraud Rate" value={`${metrics.rate.toFixed(1)}%`} tone="#20c997" />
        <MetricCard label="System Load" value={`${metrics.load.toFixed(1)}%`} />
        <MetricCard label="Latency" value={`${metrics.latency} ms`} />
      </div>

      <div className="simulation-dual-grid">
        <div className="simulation-panel">
          <div className="simulation-panel-head">
            <div>
              <div className="simulation-panel-kicker">Batch Simulation</div>
              <h3>Run presets and load bursts</h3>
              <p>Switch quickly between curated scenarios, then fine-tune traffic intensity and burst shape.</p>
            </div>
            <span className="chip approved">Live load</span>
          </div>
          <div className="card-list">
            {PRESETS.map((preset) => (
              <button key={preset.key} type="button" className={`rule-card simulation-scenario${simulation.scenario === preset.key ? " active" : ""}`} onClick={() => void applyPreset(preset.key)} style={{ width: "100%", textAlign: "left" }}>
                <div style={{ flex: 1 }}>
                  <div className="rule-title">{preset.label}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{preset.description}</div>
                </div>
                <span className="chip approved">Preset</span>
              </button>
            ))}
          </div>

          <div className="mini-panel" style={{ marginTop: 14 }}>
            <div className="muted">Transactions / Minute</div>
            <input type="range" min={20} max={600} step={10} value={simulation.throughputPerMinute || 0} onChange={(e) => patch({ throughputPerMinute: Number(e.target.value) })} style={rangeStyle} />
            <div className="range-meta"><span>20</span><strong>{simulation.throughputPerMinute || 0}</strong><span>600</span></div>
          </div>

          <div className="form-grid" style={{ marginTop: 14 }}>
            <label className="field"><span>Burst Size</span><input type="number" value={simulation.burstSize || 0} onChange={(e) => patch({ burstSize: Number(e.target.value) })} /></label>
            <label className="field"><span>Burst Interval (min)</span><input type="number" value={simulation.burstIntervalMinutes || 0} onChange={(e) => patch({ burstIntervalMinutes: Number(e.target.value) })} /></label>
            <label className="field"><span>Burst Duration (sec)</span><input type="number" value={simulation.burstDurationSeconds || 0} onChange={(e) => patch({ burstDurationSeconds: Number(e.target.value) })} /></label>
            <label className="field"><span>Alert Batch Size</span><input type="number" value={simulation.alertsBatchSize || 0} onChange={(e) => patch({ alertsBatchSize: Number(e.target.value) })} /></label>
          </div>

          <div className="action-row" style={{ marginTop: 14 }}>
            <button className="btn-accent" disabled={saving} onClick={() => void persist({ ...simulation, running: true, activatedAt: simulation.activatedAt || new Date().toISOString() })}>Start Simulation</button>
            <button className="pill" disabled={saving} onClick={() => void persist({ ...simulation, running: false })}>Stop Simulation</button>
            <button className="pill" disabled={saving} onClick={runAlertBatch}>Simulate Alerts</button>
            <button className="pill" disabled={saving} onClick={replayLast}>Replay Last Batch</button>
          </div>
          {message ? <div className="success-box" style={{ marginTop: 12 }}>{message}</div> : null}
          {error ? <div className="error-box" style={{ marginTop: 12 }}>{error}</div> : null}
        </div>

        <div className="simulation-panel">
          <div className="simulation-panel-head">
            <div>
              <div className="simulation-panel-kicker">Custom Scenario Builder</div>
              <h3>Shape the transaction mix</h3>
              <p>Design your own geography, merchant, and device distributions for edge-case testing.</p>
            </div>
            <span className="chip medium">Builder</span>
          </div>
          <div className="form-grid">
            <label className="field"><span>Profile Name</span><input value={simulation.profileName || ""} onChange={(e) => patch({ profileName: e.target.value })} /></label>
            <label className="field"><span>Workspace Key</span><input value={simulation.workspaceKey || workspaceKey} onChange={(e) => patch({ workspaceKey: e.target.value })} /></label>
            <label className="field"><span>India Share (%)</span><input type="number" min={0} max={100} value={simulation.indiaShare || 0} onChange={(e) => patch({ indiaShare: Number(e.target.value) })} /></label>
            <label className="field"><span>USA Share (%)</span><input type="number" min={0} max={100} value={simulation.usaShare || 0} onChange={(e) => patch({ usaShare: Number(e.target.value) })} /></label>
            <label className="field"><span>High Amount Share (%)</span><input type="number" min={0} max={100} value={simulation.highAmountShare || 0} onChange={(e) => patch({ highAmountShare: Number(e.target.value) })} /></label>
            <label className="field"><span>Scam Merchant Share (%)</span><input type="number" min={0} max={100} value={simulation.scamMerchantShare || 0} onChange={(e) => patch({ scamMerchantShare: Number(e.target.value) })} /></label>
            <label className="field"><span>Device Reuse Share (%)</span><input type="number" min={0} max={100} value={simulation.deviceReuseShare || 0} onChange={(e) => patch({ deviceReuseShare: Number(e.target.value) })} /></label>
            <label className="field"><span>Fraud Multiplier</span><input type="number" step="0.1" value={simulation.riskMultiplier || 0} onChange={(e) => patch({ riskMultiplier: Number(e.target.value) })} /></label>
          </div>

          <div className="mini-panel" style={{ marginTop: 14 }}>
            <div className="muted">Distribution Preview</div>
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              <ProgressRow label="India" value={simulation.indiaShare || 0} tone="#20c997" />
              <ProgressRow label="USA" value={simulation.usaShare || 0} tone="#4361ee" />
              <ProgressRow label="High-value tx" value={simulation.highAmountShare || 0} tone="#f0ad4e" />
              <ProgressRow label="Scam merchants" value={simulation.scamMerchantShare || 0} tone="#f54b64" />
              <ProgressRow label="Device reuse" value={simulation.deviceReuseShare || 0} tone="#8ddcff" />
            </div>
          </div>

          <div className="action-row" style={{ marginTop: 14 }}>
            <button className="pill" disabled={saving} onClick={() => void persist(simulation)}>Save Config</button>
            <button className="pill" disabled={saving} onClick={exportConfig}>Export Config</button>
            <button className="pill" disabled={saving} onClick={() => importRef.current?.click()}>Import Config</button>
            <input ref={importRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) void importConfig(file); e.currentTarget.value = ""; }} />
          </div>
        </div>
      </div>

      <div className="simulation-dual-grid">
        <div className="simulation-panel">
          <div className="simulation-panel-head">
            <div>
              <div className="simulation-panel-kicker">Rule Config Integration</div>
              <h3>Toggle detection rules on the fly</h3>
              <p>Compare rule behavior live while simulation traffic is running.</p>
            </div>
            <span className="chip approved">Rules</span>
          </div>
          <div className="card-list">
            {rules.map((rule) => (
              <div key={rule.id} className="mini-panel" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{rule.ruleName}</div>
                  <div className="muted" style={{ fontSize: 12 }}>Threshold: {rule.thresholdValue ?? "-"} | Weight: {rule.weight ?? "-"}</div>
                </div>
                <button className={`pill ${rule.active ? "logout" : ""}`} disabled={busyRule === rule.ruleName} onClick={() => void toggleRule(rule)}>
                  {rule.active ? "Turn Off" : "Turn On"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="simulation-panel">
          <div className="simulation-panel-head">
            <div>
              <div className="simulation-panel-kicker">Health Monitoring</div>
              <h3>Observe load and latency</h3>
              <p>See the engine respond as throughput, burst pressure, and rule activity change.</p>
            </div>
            <span className="chip medium">Health</span>
          </div>
          <div className="cards-inline">
            <span className={`chip ${health?.apiStatus === "HEALTHY" ? "approved" : "high"}`}>{health?.apiStatus || "UNKNOWN"}</span>
            <span className={`chip ${health?.ingestionStatus === "LIVE" ? "approved" : "medium"}`}>{health?.ingestionStatus || "UNKNOWN"}</span>
            <span className="chip approved">Context: {health?.simulationContext || simulation.profileName || "Default Demo"}</span>
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <ProgressRow label="System Load" value={metrics.load} tone="#23b0ff" />
            <ProgressRow label="Fraud Rate" value={metrics.rate} tone="#f54b64" />
            <ProgressRow label="Alert Pressure" value={metrics.alertsTriggered > 0 ? (metrics.alertsTriggered / Math.max(1, metrics.tx)) * 100 : 0} tone="#f0ad4e" />
          </div>
          <div className="mini-panel" style={{ marginTop: 14 }}>
            <div className="muted">Recent activity</div>
            <div className="detail-activity-list" style={{ marginTop: 10 }}>
              {health?.recentActivity?.length ? health.recentActivity.map((item) => (
                <div key={`${item.endpoint}-${item.timestamp}`} className="detail-activity-item">
                  <div>
                    <strong>{item.endpoint}</strong>
                    <div className="muted">{item.detail}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className={`chip ${item.status === "HEALTHY" || item.status === "READY" ? "approved" : item.status === "ATTENTION" ? "medium" : "high"}`}>{item.status}</span>
                    <div className="muted" style={{ marginTop: 6 }}>{item.timestamp ? new Date(item.timestamp).toLocaleString() : "-"}</div>
                  </div>
                </div>
              )) : <div className="muted">No operational activity yet.</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="simulation-bottom-grid">
        <div className="simulation-panel">
          <div className="simulation-panel-head">
            <div>
              <div className="simulation-panel-kicker">Generated Alerts Preview</div>
              <h3>Inspect the latest simulated outcomes</h3>
              <p>Review transaction IDs, risk levels, locations, and rules triggered by the current run.</p>
            </div>
            <span className="chip high">Preview</span>
          </div>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Amount</th>
                  <th>Risk</th>
                  <th>Location</th>
                  <th>Rule</th>
                  <th>Time</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {alerts.length ? alerts.map((alert) => (
                  <tr key={`${alert.transactionId}-${alert.evaluatedAt}`}>
                    <td>{alert.transactionId}</td>
                    <td>{alert.amount != null ? formatCurrency(Number(alert.amount)) : "-"}</td>
                    <td><span className={`chip ${priorityClass(alert.priority || alert.riskLevel)}`}>{alert.priority || alert.riskLevel || "-"}</span></td>
                    <td>{alert.location || "-"}</td>
                    <td>{alert.ruleTriggered || "-"}</td>
                    <td>{alert.evaluatedAt ? new Date(alert.evaluatedAt).toLocaleString() : "-"}</td>
                    <td>
                      <button className="pill" style={{ padding: "8px 12px" }} onClick={() => setSelectedResult(alert)}>
                        View Result
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center" }}>No synthetic alerts published yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="simulation-panel">
          <div className="simulation-panel-head">
            <div>
              <div className="simulation-panel-kicker">Replay Timeline</div>
              <h3>Track the last actions</h3>
              <p>Keep a short history of presets, alert batches, rule toggles, and imports.</p>
            </div>
            <span className="chip approved">Timeline</span>
          </div>
          <div className="detail-activity-list">
            {history.length ? history.map((item, index) => (
              <div key={`${item.time}-${index}`} className="detail-activity-item">
                <div>
                  <strong>{item.title}</strong>
                  <div className="muted">{item.detail}</div>
                </div>
                <div className="muted">{item.time}</div>
              </div>
            )) : <div className="muted">No replay actions captured yet.</div>}
          </div>
        </div>
      </div>

      {selectedResult ? (
        <SimulationResultModal
          alert={selectedResult}
          simulation={simulation}
          onClose={() => setSelectedResult(null)}
        />
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value" style={tone ? { color: tone, fontSize: value.length > 12 ? 22 : 28 } : { fontSize: value.length > 12 ? 22 : 28 }}>
        {value}
      </div>
    </div>
  );
}

function ProgressRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  const percent = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <span>{label}</span>
        <strong>{percent.toFixed(1)}%</strong>
      </div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%`, background: tone }} /></div>
    </div>
  );
}

function defaultSimulation(workspaceKey: string, defaults: Record<string, any> = {}): SimulationControl {
  const preferredMode = String(defaults.defaultSimulationMode || "Continuous").toUpperCase();
  const preferredScenario = resolveScenarioKey(defaults.defaultScenario);
  return {
    running: false,
    scenario: preferredScenario,
    profileName: preferredMode === "BATCH" ? "Batch Profile" : preferredMode === "SINGLE" ? "Single Transaction Profile" : "Default Demo",
    workspaceKey,
    throughputPerMinute: Number(defaults.defaultTransactionsPerMinute || 120),
    burstSize: 25,
    riskMultiplier: Number(defaults.riskMultiplier || 1.2),
    indiaShare: 70,
    usaShare: 20,
    highAmountShare: 10,
    scamMerchantShare: 5,
    deviceReuseShare: 15,
    burstIntervalMinutes: 5,
    burstDurationSeconds: 2,
    alertsBatchSize: 5,
    replayMode: false,
    autoStopAfter: defaults.autoStopAfter || "5000 transactions",
    activatedAt: null,
    updatedAt: new Date().toISOString()
  };
}

function mergeSimulation(base: SimulationControl, overlay: Partial<SimulationControl> | null, workspaceKey: string, defaults: Record<string, any> = {}): SimulationControl {
  return {
    ...defaultSimulation(workspaceKey, defaults),
    ...base,
    ...overlay,
    workspaceKey: (overlay?.workspaceKey || base.workspaceKey || workspaceKey),
    profileName: overlay?.profileName || base.profileName || "Custom Profile"
  };
}

function resolveScenarioKey(value: unknown) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized.includes("ACCOUNT")) return "ACCOUNT_TAKEOVER";
  if (normalized.includes("VELOCITY")) return "VELOCITY_ATTACK";
  if (normalized.includes("GEO")) return "GEO_LOCATION_MISMATCH";
  if (normalized.includes("CUSTOM")) return "CUSTOM";
  return "CARD_TESTING";
}

function loadSaved(storageKey: string): Partial<SimulationControl> | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Partial<SimulationControl>) : null;
  } catch {
    return null;
  }
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(0.95, value));
}

function clampCount(value: number) {
  return Math.max(1, Math.min(25, Math.round(value)));
}

function formatInteger(value: number) {
  return Number(value || 0).toLocaleString();
}

function priorityClass(priority?: string | null) {
  const value = (priority || "").toUpperCase();
  if (value.includes("CRITICAL") || value.includes("HIGH")) return "high";
  if (value.includes("MEDIUM")) return "medium";
  return "low";
}

function mapHistory(entries: SimulationActivity[]): HistoryItem[] {
  return entries.map((entry) => ({
    title: entry.actionType || "Activity",
    detail: entry.detail || `${entry.profileName || "Profile"} | ${entry.workspaceKey || "GLOBAL"}`,
    time: entry.createdAt ? new Date(entry.createdAt).toLocaleString() : new Date().toLocaleString()
  }));
}

function SimulationResultModal({
  alert,
  simulation,
  onClose
}: {
  alert: AlertLifecycle;
  simulation: SimulationControl;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const profile = buildSimulationResult(alert, simulation);

  return (
    <div
      className="simulation-result-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Simulation result"
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className="simulation-result-card">
        <div className="simulation-result-header">
          <div>
            <p className="simulation-kicker">Simulation Result</p>
            <h3>{alert.transactionId}</h3>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Detailed transaction snapshot for the latest generated alert.
            </p>
          </div>
          <div className="cards-inline" style={{ justifyContent: "flex-end" }}>
            <span className={`chip ${priorityClass(alert.priority || alert.riskLevel)}`}>{(alert.priority || alert.riskLevel || "LOW").toUpperCase()}</span>
            <span className="chip medium">{simulation.profileName || "Custom Profile"}</span>
            <span className="chip approved">{profile.status}</span>
          </div>
        </div>

        <div className="simulation-result-scroll">
          <div className="simulation-result-grid">
            <ResultSection title="General Information" accent="#20c997" rows={profile.general} />
            <ResultSection title="Sender Profile" accent="#4361ee" rows={profile.sender} />
            <ResultSection title="Security Analysis" accent="#f54b64" rows={profile.security} />
            <ResultSection title="Receiver Profile" accent="#f0ad4e" rows={profile.receiver} />
          </div>
        </div>

        <div className="simulation-result-footer">
          <div className="muted">
            Evaluated at {alert.evaluatedAt ? new Date(alert.evaluatedAt).toLocaleString() : "Unknown time"}
          </div>
          <button className="pill" onClick={onClose}>Close Details</button>
        </div>
      </div>
    </div>
  );
}

function ResultSection({
  title,
  rows,
  accent
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
  accent: string;
}) {
  return (
    <div className="simulation-result-section">
      <div className="detail-title" style={{ color: accent, textTransform: "uppercase", letterSpacing: "0.16em", fontSize: 12, marginBottom: 12 }}>
        {title}
      </div>
      <div className="detail-list">
        {rows.map((row) => (
          <DetailRow key={`${title}-${row.label}`} label={row.label} value={row.value} />
        ))}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildSimulationResult(alert: AlertLifecycle, simulation: SimulationControl) {
  const seed = `${alert.transactionId || "sim"}:${alert.evaluatedAt || ""}:${simulation.workspaceKey || ""}`;
  const riskLabel = (alert.priority || alert.riskLevel || "LOW").toUpperCase();
  const riskScore = Number(alert.riskScore || 0);
  const riskDisplay = riskScore > 1 ? `${riskScore.toFixed(2)}%` : `${(riskScore * 100).toFixed(1)}%`;
  const status = alert.fraudDetected || riskLabel.includes("CRITICAL") || riskLabel.includes("HIGH") ? "BLOCKED" : "APPROVED";
  const merchant = deriveMerchant(alert, simulation);
  const bank = pickFrom(["SBI", "HDFC", "ICICI", "AXIS", "PNB"], seed);

  return {
    status,
    general: [
      { label: "Date/Time", value: alert.evaluatedAt ? new Date(alert.evaluatedAt).toLocaleString() : "Unknown" },
      { label: "Amount", value: formatCurrency(alert.amount) },
      { label: "Type", value: alert.transactionType || "TRANSFER" },
      { label: "Merchant", value: merchant },
      { label: "IP Address", value: synthesizeIp(seed) }
    ],
    sender: [
      { label: "Full Name", value: "BatchSender" },
      { label: "Account No", value: maskAccount(synthesizeAccount(seed, "sender")) },
      { label: "Bank", value: bank },
      { label: "IFSC Code", value: synthesizeIfsc(seed, bank) },
      { label: "Mobile", value: synthesizePhone(seed, "sender") },
      { label: "Location", value: alert.location || "Unknown" }
    ],
    security: [
      { label: "Risk Score", value: riskDisplay },
      { label: "Detection Status", value: status },
      { label: "Fraud Flag", value: alert.fraudDetected ? "TRUE" : "FALSE" },
      { label: "Rule Triggered", value: alert.ruleTriggered || "None" },
      { label: "Risk Level", value: riskLabel }
    ],
    receiver: [
      { label: "Full Name", value: "BatchReceiver" },
      { label: "Account No", value: maskAccount(synthesizeAccount(seed, "receiver")) },
      { label: "Bank", value: pickFrom(["SBI", "HDFC", "ICICI", "AXIS", "PNB"], `${seed}:receiver`) },
      { label: "IFSC Code", value: synthesizeIfsc(`${seed}:receiver`, bank) },
      { label: "Mobile", value: synthesizePhone(seed, "receiver") },
      { label: "Location", value: alert.location || "Unknown" }
    ]
  };
}

function deriveMerchant(alert: AlertLifecycle, simulation: SimulationControl) {
  const source = `${alert.ruleTriggered || ""} ${simulation.scenario || ""}`.toUpperCase();
  if (source.includes("SCAM")) return "ScamMart";
  if (source.includes("VELOCITY")) return "RapidPay";
  if (source.includes("GEO")) return "GlobalCart";
  if ((Number(alert.amount || 0) > 100000) || (simulation.highAmountShare || 0) >= 15) return "LuxuryHub";
  return pickFrom(["Amazon", "Starbucks", "Flipkart", "Myntra", "Walmart"], `${alert.transactionId}:${simulation.profileName || ""}`);
}

function synthesizeAccount(seed: string, prefix: string) {
  const digits = String(Math.abs(hashSeed(`${seed}:${prefix}`))).padStart(12, "0");
  return digits.slice(0, 12);
}

function synthesizePhone(seed: string, prefix: string) {
  const digits = String(7000000000 + (Math.abs(hashSeed(`${seed}:${prefix}`)) % 2999999999)).slice(0, 10);
  return digits;
}

function synthesizeIfsc(seed: string, bank: string) {
  const suffix = String(Math.abs(hashSeed(seed))).padStart(3, "0").slice(0, 3);
  return `${bank.slice(0, 4).toUpperCase()}${suffix}`;
}

function synthesizeIp(seed: string) {
  const base = Math.abs(hashSeed(seed));
  return `10.${base % 255}.${Math.floor(base / 255) % 255}.${Math.floor(base / 65025) % 255}`;
}

function pickFrom<T>(items: T[], seed: string) {
  return items[Math.abs(hashSeed(seed)) % items.length];
}

function hashSeed(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 2147483647;
  }
  return hash;
}

const rangeStyle: React.CSSProperties = {
  width: "100%",
  accentColor: "#20c997",
  marginTop: 10
};
