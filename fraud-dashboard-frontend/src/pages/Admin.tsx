import { useEffect, useState } from "react";
import PasswordField from "../components/PasswordField";
import {
  createInvitationCode,
  createUser,
  deleteUser,
  getAdminRecipients,
  getDashboardOverview,
  getInvitationCodes,
  getModelAnalytics,
  getSimulationControl,
  getSystemHealth,
  getUsers,
  updateSimulationControl
} from "../services/alertService";
import type {
  DashboardOverview,
  InvitationCodeSummary,
  ModelAnalytics,
  SimulationControl,
  SystemHealth,
  UserRecord
} from "../services/alertService";
import { getSession } from "../services/auth";
import { validateAdminFields, validateEmailField } from "../utils/validation";
import { maskEmail, maskPhone } from "../utils/security";
import { useAppSettings } from "../context/AppSettingsContext";
import { shouldMaskSensitiveData, resolveApplicationName } from "../settings/appSettings";

type UserForm = {
  userName: string;
  phoneNumber: string;
  email: string;
  role: "ANALYTICS" | "ADMIN";
  password: string;
};

export default function Admin() {
  const { settings } = useAppSettings();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [model, setModel] = useState<ModelAnalytics | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [simulation, setSimulation] = useState<SimulationControl | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [invitationCodes, setInvitationCodes] = useState<InvitationCodeSummary[]>([]);
  const [invitationCode, setInvitationCode] = useState("");
  const [invitationRecipientEmail, setInvitationRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [opsMessage, setOpsMessage] = useState("");
  const [form, setForm] = useState<UserForm>({
    userName: "",
    phoneNumber: "",
    email: "",
    role: "ANALYTICS",
    password: ""
  });
  const appName = resolveApplicationName(settings);
  const maskSensitiveData = shouldMaskSensitiveData(settings);

  const load = async () => {
    const [ov, ml, rcpts, usrs, invites, sim, health] = await Promise.all([
      getDashboardOverview(),
      getModelAnalytics(),
      getAdminRecipients(),
      getUsers(),
      getInvitationCodes(),
      getSimulationControl(),
      getSystemHealth()
    ]);
    setOverview(ov);
    setModel(ml);
    setRecipients(rcpts);
    setUsers(usrs);
    setInvitationCodes(invites);
    setSimulation(sim);
    setSystemHealth(health);
  };

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  const handleCreateUser = async () => {
    const validationError = validateAdminFields(form);
    if (validationError) {
      setError(validationError);
      setMessage("");
      return;
    }
    setError("");
    try {
      await createUser(form);
      setMessage("User created successfully.");
      setForm({ userName: "", phoneNumber: "", email: "", role: "ANALYTICS", password: "" });
      await load();
    } catch (err) {
      setError(getFriendlyError(err, "Invalid field"));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteUser(id);
      setMessage("User removed successfully.");
      await load();
    } catch (err) {
      setError(getFriendlyError(err, "Unable to remove user."));
    }
  };

  const handleInvitation = async () => {
    setError("");
    const emailValidation = validateEmailField(invitationRecipientEmail);
    if (emailValidation) {
      setError(emailValidation);
      return;
    }
    const session = getSession();
    try {
      const code = await createInvitationCode(form.role, invitationRecipientEmail.trim());
      setInvitationCode(code.invitationCode);
      setMessage(`Invitation code created for ${invitationRecipientEmail.trim()}. Issued by ${session?.userName || session?.email || "System Admin"}.`);
      await load();
    } catch (err) {
      setError(getFriendlyError(err, "Unable to create invitation code."));
    }
  };

  const patchSimulation = async (changes: Partial<SimulationControl>) => {
    if (!simulation) return;
    const nextState = { ...simulation, ...changes };
    const updated = await updateSimulationControl(nextState);
    setSimulation(updated);
    setOpsMessage(`Simulation ${updated.running ? "started" : "updated"} for scenario ${updated.scenario}.`);
    setTimeout(() => setOpsMessage(""), 4000);
    setSystemHealth(await getSystemHealth());
  };

  return (
    <div className="section">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0 }}>{appName} Admin Console</h2>
          <p className="muted">Manage users, simulation controls, invitation codes, and operational health.</p>
        </div>
        <div className="cards-inline">
          <span className="chip approved">Recipients: {recipients.length}</span>
          <span className="chip high">Critical: {overview?.criticalAlerts ?? 0}</span>
          <span className="chip medium">High: {overview?.highAlerts ?? 0}</span>
          <span className={`chip ${(systemHealth?.apiStatus || "HEALTHY") === "HEALTHY" ? "approved" : "high"}`}>{systemHealth?.apiStatus || "HEALTHY"}</span>
        </div>
      </div>

      <div className="cards-grid" style={{ marginTop: 16 }}>
        <div className="stat-card"><div className="label">Notification Routing</div><div className="value" style={{ fontSize: 18 }}>Active</div></div>
        <div className="stat-card"><div className="label">Validation Accuracy</div><div className="value">{model?.validationAccuracy ?? 0}%</div></div>
        <div className="stat-card"><div className="label">Unread Alerts</div><div className="value">{overview?.unreadAlerts ?? 0}</div></div>
        <div className="stat-card"><div className="label">System Health</div><div className="value">{systemHealth?.healthScore ?? 0}</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16, marginTop: 16 }}>
        <div className="section" style={{ background: "#0f1a2b" }}>
          <h3 style={{ marginTop: 0 }}>Provision User</h3>
          <div className="form-grid">
            <label className="field">
              <span>User Name</span>
              <input value={form.userName} onChange={(e) => setForm((prev) => ({ ...prev, userName: e.target.value }))} />
            </label>
            <label className="field">
              <span>Phone Number</span>
              <input value={form.phoneNumber} onChange={(e) => setForm((prev) => ({ ...prev, phoneNumber: e.target.value }))} />
            </label>
            <label className="field">
              <span>Email</span>
              <input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
            </label>
            <label className="field">
              <span>Analyst Email for Invitation</span>
              <input value={invitationRecipientEmail} onChange={(e) => setInvitationRecipientEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>Role</span>
              <select value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as UserForm["role"] }))}>
                <option value="ANALYTICS">ANALYTICS</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </label>
            <label className="field">
              <span>Password</span>
              <PasswordField
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                autoComplete="new-password"
              />
            </label>
          </div>
          <div className="action-row" style={{ marginTop: 8 }}>
            <button className="btn-accent" onClick={handleCreateUser}>Create Account</button>
            <button className="pill" onClick={handleInvitation}>Generate Invitation Code</button>
          </div>
          {invitationCode ? <div className="success-box" style={{ marginTop: 12 }}>Invitation Code: {invitationCode}</div> : null}
          {error ? <div className="error-box" style={{ marginTop: 12 }}>{error}</div> : null}
          {message ? <div className="success-box" style={{ marginTop: 12 }}>{message}</div> : null}
          <div style={{ marginTop: 16 }}>
            <div className="muted" style={{ marginBottom: 8 }}>Active invitation codes</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {invitationCodes.length ? invitationCodes.map((code) => (
                <div key={code.invitationCode} className="mini-panel" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{code.invitationCode}</div>
                    <div className="muted" style={{ fontSize: 12 }}>Issued by: {code.issuedBy || "Unknown"}</div>
                    <div className="muted" style={{ fontSize: 12 }}>Sent to: {maskSensitiveData ? maskEmail(code.recipientEmail || "Unknown") : (code.recipientEmail || "Unknown")}</div>
                  </div>
                  <span className={`chip ${code.role === "ADMIN" ? "high" : "approved"}`}>{code.role || "ANALYTICS"}</span>
                </div>
              )) : <div className="muted">No active invitation codes.</div>}
            </div>
          </div>
        </div>

        <div className="section" style={{ background: "#0f1a2b" }}>
          <h3 style={{ marginTop: 0 }}>Simulation Control Panel</h3>
          {simulation ? (
            <>
              <div className="form-grid">
                <label className="field">
                  <span>Fraud Scenario</span>
                  <select value={simulation.scenario} onChange={(e) => setSimulation((prev) => prev ? { ...prev, scenario: e.target.value } : prev)}>
                    <option value="CARD_TESTING">Card Testing</option>
                    <option value="ACCOUNT_TAKEOVER">Account Takeover</option>
                    <option value="VELOCITY_ATTACK">Velocity Attack</option>
                    <option value="GEO_LOCATION_MISMATCH">Geo-Location Mismatch</option>
                  </select>
                </label>
                <label className="field">
                  <span>Transactions / Minute</span>
                  <input
                    type="number"
                    value={simulation.throughputPerMinute}
                    onChange={(e) => setSimulation((prev) => prev ? { ...prev, throughputPerMinute: Number(e.target.value) } : prev)}
                  />
                </label>
                <label className="field">
                  <span>Burst Size</span>
                  <input
                    type="number"
                    value={simulation.burstSize}
                    onChange={(e) => setSimulation((prev) => prev ? { ...prev, burstSize: Number(e.target.value) } : prev)}
                  />
                </label>
                <label className="field">
                  <span>Risk Multiplier</span>
                  <input
                    type="number"
                    step="0.1"
                    value={simulation.riskMultiplier}
                    onChange={(e) => setSimulation((prev) => prev ? { ...prev, riskMultiplier: Number(e.target.value) } : prev)}
                  />
                </label>
              </div>
              <div className="action-row">
                <button className="btn-accent" onClick={() => void patchSimulation({ running: true })}>Start Simulation</button>
                <button className="pill" onClick={() => void patchSimulation({ running: false })}>Stop Simulation</button>
                <button className="pill" onClick={() => simulation ? void patchSimulation(simulation) : undefined}>Apply Parameters</button>
              </div>
              <div className="cards-inline" style={{ marginTop: 12 }}>
                <span className={`chip ${simulation.running ? "high" : "approved"}`}>{simulation.running ? "Running" : "Stopped"}</span>
                <span className="chip medium">Updated: {simulation.updatedAt ? new Date(simulation.updatedAt).toLocaleString() : "-"}</span>
              </div>
              {opsMessage ? <div className="success-box" style={{ marginTop: 12 }}>{opsMessage}</div> : null}
            </>
          ) : <div className="muted">Loading simulation state...</div>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 16, marginTop: 16 }}>
        <div className="section" style={{ background: "#0f1a2b" }}>
          <h3 style={{ marginTop: 0 }}>System Health & Ingestion</h3>
          {systemHealth ? (
            <div className="detail-list">
              <div className="detail-row"><span className="muted">API Status</span><strong>{systemHealth.apiStatus}</strong></div>
              <div className="detail-row"><span className="muted">Ingestion Status</span><strong>{systemHealth.ingestionStatus}</strong></div>
              <div className="detail-row"><span className="muted">Health Score</span><strong>{systemHealth.healthScore}</strong></div>
              <div className="detail-row"><span className="muted">Total Transactions</span><strong>{systemHealth.totalTransactions}</strong></div>
              <div className="detail-row"><span className="muted">Total Alerts</span><strong>{systemHealth.totalAlerts}</strong></div>
              <div className="detail-row"><span className="muted">Unread Alerts</span><strong>{systemHealth.unreadAlerts}</strong></div>
              <div className="detail-row"><span className="muted">Active Rules</span><strong>{systemHealth.activeRules}</strong></div>
              <div className="detail-row"><span className="muted">Last Ingestion Time</span><strong>{systemHealth.lastTransactionAt ? new Date(systemHealth.lastTransactionAt).toLocaleString() : "-"}</strong></div>
            </div>
          ) : <div className="muted">Loading system health...</div>}
        </div>

        <div className="section" style={{ background: "#0f1a2b" }}>
          <h3 style={{ marginTop: 0 }}>API Activity Logs</h3>
          <div className="detail-activity-list">
            {systemHealth?.recentActivity?.length ? systemHealth.recentActivity.map((item) => (
              <div key={`${item.endpoint}-${item.timestamp}`} className="detail-activity-item">
                <div>
                  <strong>{item.endpoint}</strong>
                  <div className="muted">{item.detail}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className={`chip ${item.status === "HEALTHY" || item.status === "READY" || item.status === "LIVE" ? "approved" : item.status === "ATTENTION" ? "medium" : "high"}`}>
                    {item.status}
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>{item.timestamp ? new Date(item.timestamp).toLocaleString() : "-"}</div>
                </div>
              </div>
            )) : <div className="muted">No API activity captured yet.</div>}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <div className="section" style={{ background: "#0f1a2b" }}>
          <h3 style={{ marginTop: 0 }}>Notification Settings</h3>
          <div className="muted">Critical and high-risk alerts follow the configured notification policy.</div>
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {recipients.map((email) => (
              <span key={email} className="chip approved">{maskEmail(email)}</span>
            ))}
          </div>
        </div>
        <div className="section" style={{ background: "#0f1a2b" }}>
          <h3 style={{ marginTop: 0 }}>Model Snapshot</h3>
          <pre className="code-panel">{JSON.stringify(model, null, 2)}</pre>
        </div>
      </div>

      <div className="section" style={{ marginTop: 16, background: "#0f1a2b" }}>
        <h3 style={{ marginTop: 0 }}>Registered Users</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User ID</th>
                <th>User Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Role</th>
                <th>Active</th>
                <th>Created At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId}>
                  <td>{user.userId}</td>
                  <td>{user.userName}</td>
                  <td>{maskSensitiveData ? maskPhone(user.phoneNumber) : user.phoneNumber}</td>
                  <td>{maskSensitiveData ? maskEmail(user.email) : user.email}</td>
                  <td><span className={`chip ${user.role === "ADMIN" ? "high" : "approved"}`}>{user.role}</span></td>
                  <td>{user.active ? "Yes" : "No"}</td>
                  <td>{user.createdAt ? new Date(user.createdAt).toLocaleString() : "-"}</td>
                  <td>
                    {user.role === "ANALYTICS" ? (
                      <button className="pill logout" onClick={() => void handleDelete(user.userId)}>Delete</button>
                    ) : (
                      <span className="muted">Protected</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function getFriendlyError(err: unknown, fallback: string) {
  if (typeof err === "object" && err && "response" in err) {
    const response = (err as { response?: { data?: { message?: string } } }).response;
    const message = response?.data?.message;
    if (message) return message;
  }
  return fallback;
}
