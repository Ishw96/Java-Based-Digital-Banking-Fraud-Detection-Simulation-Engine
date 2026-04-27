import { useEffect, useMemo, useState } from "react";
import { getSession } from "../services/auth";
import { getSettingsHistory, getSettingsProfile, saveSettingsProfile, type SettingsHistoryEntry } from "../services/alertService";
import {
  cloneSettings,
  getSettingsDefaults,
  getSettingsStorageKey,
  loadStoredSettings,
  mergeDeep,
  type SettingsState
} from "../settings/appSettings";
import { downloadCsv, downloadExcel, downloadPdf } from "../utils/export";
import { formatPresetLabel, getReportTemplatesByRole, type ReportTemplate, type ReportScope } from "../utils/reporting";

type Role = "ADMIN" | "ANALYTICS";

export default function Settings() {
  const session = getSession();
  const role: Role = session?.role === "ADMIN" ? "ADMIN" : "ANALYTICS";
  const storageKey = useMemo(() => getSettingsStorageKey(role, session?.email), [role, session?.email]);
  const defaults = useMemo(() => getSettingsDefaults(role), [role]);
  const [settings, setSettings] = useState<SettingsState>(() => loadStoredSettings(storageKey, defaults));
  const [history, setHistory] = useState<SettingsHistoryEntry[]>([]);
  const [status, setStatus] = useState("");

  const loadHistory = async () => {
    if (role !== "ADMIN") {
      setHistory([]);
      return;
    }
    try {
      setHistory(await getSettingsHistory("ADMIN"));
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      const cached = loadStoredSettings(storageKey, defaults);
      if (active) {
        setSettings(cached);
      }

      try {
        const profile = await getSettingsProfile();
        if (!active) return;
        const merged = mergeDeep(cloneSettings(cached), profile.settings || {});
        setSettings(merged);
        localStorage.setItem(storageKey, JSON.stringify(merged));
      } catch {
        // Keep cached/default values when the backend is unavailable.
      }

      if (role === "ADMIN") {
        try {
          const items = await getSettingsHistory("ADMIN");
          if (active) {
            setHistory(items);
          }
        } catch {
          if (active) {
            setHistory([]);
          }
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [storageKey]);

  const update = (path: string, value: unknown) => {
    setSettings((prev) => setPathValue(prev, path, value));
  };

  const save = async () => {
    try {
      const saved = await saveSettingsProfile(settings);
      const merged = mergeDeep(cloneSettings(settings), saved.settings || {});
      localStorage.setItem(storageKey, JSON.stringify(merged));
      setSettings(merged);
      window.dispatchEvent(new Event("detectiq:settings-updated"));
      await loadHistory();
      setStatus(`Saved ${role === "ADMIN" ? "admin" : "analyst"} settings for DetectIQ.`);
    } catch {
      setStatus("Unable to save settings right now.");
    }
  };

  const reset = async () => {
    try {
      const saved = await saveSettingsProfile(defaults);
      const merged = mergeDeep(cloneSettings(defaults), saved.settings || {});
      localStorage.setItem(storageKey, JSON.stringify(merged));
      setSettings(merged);
      window.dispatchEvent(new Event("detectiq:settings-updated"));
      await loadHistory();
      setStatus("Restored system defaults and saved them to DetectIQ.");
    } catch {
      setSettings(defaults);
      localStorage.removeItem(storageKey);
      window.dispatchEvent(new Event("detectiq:settings-updated"));
      setStatus("Restored system defaults locally.");
    }
  };

  const restoreTemplateVersion = async (entry: SettingsHistoryEntry) => {
    try {
      const next = cloneSettings(settings);
      const historicalTemplates = (entry.settings as any)?.reporting?.roleTemplates;
      next.reporting = next.reporting || {};
      next.reporting.roleTemplates = historicalTemplates || {};
      const saved = await saveSettingsProfile(next);
      const merged = mergeDeep(cloneSettings(next), saved.settings || {});
      localStorage.setItem(storageKey, JSON.stringify(merged));
      setSettings(merged);
      window.dispatchEvent(new Event("detectiq:settings-updated"));
      await loadHistory();
      setStatus(`Restored template bundle version from ${entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "history"}.`);
    } catch {
      setStatus("Unable to restore that template version right now.");
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-hero">
        <div>
          <p className="simulation-kicker" style={{ marginBottom: 6 }}>{role === "ADMIN" ? "Advanced System Settings" : "Analyst Settings"}</p>
          <h1 style={{ margin: 0 }}>{role === "ADMIN" ? "DetectIQ Admin Settings" : "DetectIQ Analyst Settings"}</h1>
          <p className="muted" style={{ margin: "10px 0 0", maxWidth: 860 }}>
            {role === "ADMIN"
              ? "Tune the fraud engine, simulation controls, security policies, integrations, monitoring, and UI branding from one consolidated admin console."
              : "Adjust personal preferences, alerts, dashboard widgets, simulation defaults, and export behavior without changing global policy."}
          </p>
        </div>
        <div className="cards-inline" style={{ justifyContent: "flex-end" }}>
          <span className={`chip ${role === "ADMIN" ? "high" : "approved"}`}>{role}</span>
          <span className="chip medium">{session?.email || "Signed in"}</span>
          <span className="chip approved">DetectIQ</span>
        </div>
      </div>

      {status ? <div className="success-box">{status}</div> : null}

      <div className="settings-actions">
        <button className="btn-accent" onClick={() => void save()}>Save Changes</button>
        <button className="pill" onClick={() => void reset()}>Reset to Default</button>
        <span className="muted">Settings are persisted in DetectIQ and shared across the active role profile.</span>
      </div>

      <div className="settings-stack">
        {role === "ADMIN" ? (
          <>
            <Section title="General" description="Application identity and default presentation.">
              <Grid>
                <Row label="Application Name"><input value={settings.general.applicationName} onChange={(e) => update("general.applicationName", e.target.value)} /></Row>
                <Row label="Theme"><select value={settings.general.theme} onChange={(e) => update("general.theme", e.target.value)}><option>Light</option><option>Dark</option><option>System</option></select></Row>
                <Row label="Language"><select value={settings.general.language} onChange={(e) => update("general.language", e.target.value)}><option>English</option><option>Spanish</option><option>French</option></select></Row>
                <Row label="Time Zone"><input value={settings.general.timeZone} onChange={(e) => update("general.timeZone", e.target.value)} /></Row>
                <Row label="Date Format"><select value={settings.general.dateFormat} onChange={(e) => update("general.dateFormat", e.target.value)}><option>DD/MM/YYYY</option><option>YYYY-MM-DD</option></select></Row>
                <Row label="Default Dashboard"><select value={settings.general.defaultDashboard} onChange={(e) => update("general.defaultDashboard", e.target.value)}><option>Dashboard</option><option>Simulation</option><option>Analytics</option></select></Row>
              </Grid>
            </Section>

            <Section title="Fraud Detection Engine" description="Hybrid model and rule-control tuning.">
              <Grid>
                <Row label="Model Version"><input value={settings.engine.modelVersion} onChange={(e) => update("engine.modelVersion", e.target.value)} /></Row>
                <Row label="Fallback Mode"><Toggle value={settings.engine.fallbackMode} onChange={(value) => update("engine.fallbackMode", value)} /></Row>
                <Row label="Feature Engineering"><input value={settings.engine.featureEngineering} onChange={(e) => update("engine.featureEngineering", e.target.value)} /></Row>
                <Row label="Rule Activation"><Toggle value={settings.engine.defaultRuleActivation} onChange={(value) => update("engine.defaultRuleActivation", value)} /></Row>
                <Row label="Rule Tuning"><Toggle value={settings.engine.ruleTuning} onChange={(value) => update("engine.ruleTuning", value)} /></Row>
                <Row label="Fraud Threshold"><input value={settings.engine.fraudThreshold} onChange={(e) => update("engine.fraudThreshold", e.target.value)} /></Row>
                <Row label="Rule Weight"><input value={settings.engine.ruleWeight} onChange={(e) => update("engine.ruleWeight", e.target.value)} /></Row>
                <Row label="ML Weight"><input value={settings.engine.mlWeight} onChange={(e) => update("engine.mlWeight", e.target.value)} /></Row>
              </Grid>
            </Section>

            <Section title="Simulation Engine" description="Batch, burst, replay, and custom scenario control.">
              <Grid>
                <Row label="Default Transactions / Minute"><input type="number" value={settings.simulation.defaultTransactionsPerMinute} onChange={(e) => update("simulation.defaultTransactionsPerMinute", Number(e.target.value))} /></Row>
                <Row label="Burst Enabled"><Toggle value={settings.simulation.burstEnabled} onChange={(value) => update("simulation.burstEnabled", value)} /></Row>
                <Row label="Burst Size"><input type="number" value={settings.simulation.burstSize} onChange={(e) => update("simulation.burstSize", Number(e.target.value))} /></Row>
                <Row label="Burst Interval (min)"><input type="number" value={settings.simulation.burstInterval} onChange={(e) => update("simulation.burstInterval", Number(e.target.value))} /></Row>
                <Row label="Custom Scenarios"><Toggle value={settings.simulation.allowCustomScenarios} onChange={(value) => update("simulation.allowCustomScenarios", value)} /></Row>
                <Row label="Replay Retention"><input value={settings.simulation.replayStoreRetention} onChange={(e) => update("simulation.replayStoreRetention", e.target.value)} /></Row>
              </Grid>
            </Section>

            <Section title="Notifications & Alerts" description="Toast, sound, email, and webhook delivery controls.">
              <Grid>
                <Row label="Toast Popups"><Toggle value={settings.notifications.enableToastPopups} onChange={(value) => update("notifications.enableToastPopups", value)} /></Row>
                <Row label="Sound Alert"><Toggle value={settings.notifications.soundAlert} onChange={(value) => update("notifications.soundAlert", value)} /></Row>
                <Row label="SMTP Server"><input value={settings.notifications.smtpServer} onChange={(e) => update("notifications.smtpServer", e.target.value)} /></Row>
                <Row label="Sender Email"><input value={settings.notifications.senderEmail} onChange={(e) => update("notifications.senderEmail", e.target.value)} /></Row>
                <Row label="Alert Level"><select value={settings.notifications.alertLevel} onChange={(e) => update("notifications.alertLevel", e.target.value)}><option>HIGH, CRITICAL</option><option>MEDIUM, HIGH, CRITICAL</option><option>CRITICAL</option></select></Row>
              </Grid>
            </Section>

            <Section title="Report Template Bundles" description="Control the starter report templates used by Admin and Analyst reporting workspaces.">
              <TemplateBundleEditor
                title="Admin Dashboard Templates"
                templates={getTemplateBundle(settings, "ADMIN", "DASHBOARD")}
                onChange={(index, field, value) => updateTemplateBundle(setSettings, settings, "ADMIN", "DASHBOARD", index, field, value)}
                onReset={() => resetTemplateBundle(setSettings, settings, "ADMIN", "DASHBOARD")}
              />
              <TemplateBundleEditor
                title="Admin Case Templates"
                templates={getTemplateBundle(settings, "ADMIN", "CASES")}
                onChange={(index, field, value) => updateTemplateBundle(setSettings, settings, "ADMIN", "CASES", index, field, value)}
                onReset={() => resetTemplateBundle(setSettings, settings, "ADMIN", "CASES")}
              />
              <TemplateBundleEditor
                title="Analyst Dashboard Templates"
                templates={getTemplateBundle(settings, "ANALYTICS", "DASHBOARD")}
                onChange={(index, field, value) => updateTemplateBundle(setSettings, settings, "ANALYTICS", "DASHBOARD", index, field, value)}
                onReset={() => resetTemplateBundle(setSettings, settings, "ANALYTICS", "DASHBOARD")}
              />
              <TemplateBundleEditor
                title="Analyst Case Templates"
                templates={getTemplateBundle(settings, "ANALYTICS", "CASES")}
                onChange={(index, field, value) => updateTemplateBundle(setSettings, settings, "ANALYTICS", "CASES", index, field, value)}
                onReset={() => resetTemplateBundle(setSettings, settings, "ANALYTICS", "CASES")}
              />
              <TemplateHistoryPanel history={history} onRestore={restoreTemplateVersion} />
            </Section>

            <Section title="Security & Access Control" description="Authentication, roles, audit, and API policy.">
              <Grid>
                <Row label="Session Timeout (min)"><input type="number" value={settings.security.sessionTimeout} onChange={(e) => update("security.sessionTimeout", Number(e.target.value))} /></Row>
                <Row label="MFA Required"><Toggle value={settings.security.mfaRequired} onChange={(value) => update("security.mfaRequired", value)} /></Row>
                <Row label="Password Policy"><input value={settings.security.passwordPolicy} onChange={(e) => update("security.passwordPolicy", e.target.value)} /></Row>
                <Row label="Default Role"><select value={settings.security.defaultRole} onChange={(e) => update("security.defaultRole", e.target.value)}><option>Analyst</option><option>Admin</option><option>ReadOnly</option></select></Row>
                <Row label="Rate Limiting"><input type="number" value={settings.security.rateLimiting} onChange={(e) => update("security.rateLimiting", Number(e.target.value))} /></Row>
              </Grid>
            </Section>

            <Section title="Data Management" description="Retention, anonymization, and backups.">
              <Grid>
                <Row label="Transactions Retention (days)"><input type="number" value={settings.data.transactionsRetention} onChange={(e) => update("data.transactionsRetention", Number(e.target.value))} /></Row>
                <Row label="Fraud Results Retention (days)"><input type="number" value={settings.data.fraudResultsRetention} onChange={(e) => update("data.fraudResultsRetention", Number(e.target.value))} /></Row>
                <Row label="Anonymize Sensitive Fields"><Toggle value={settings.data.anonymizeSensitiveFields} onChange={(value) => update("data.anonymizeSensitiveFields", value)} /></Row>
                <Row label="Automatic Backup"><select value={settings.data.automaticBackup} onChange={(e) => update("data.automaticBackup", e.target.value)}><option>Daily</option><option>Weekly</option></select></Row>
              </Grid>
            </Section>

            <Section title="Integrations" description="ML, geolocation, and webhook connectivity.">
              <Grid>
                <Row label="ML Engine URL"><input value={settings.integrations.mlEngineUrl} onChange={(e) => update("integrations.mlEngineUrl", e.target.value)} /></Row>
                <Row label="ML Timeout (ms)"><input type="number" value={settings.integrations.mlTimeout} onChange={(e) => update("integrations.mlTimeout", Number(e.target.value))} /></Row>
                <Row label="Geolocation API"><input value={settings.integrations.geolocationApi} onChange={(e) => update("integrations.geolocationApi", e.target.value)} /></Row>
                <Row label="Webhook (External)"><input value={settings.integrations.webhookExternal} onChange={(e) => update("integrations.webhookExternal", e.target.value)} /></Row>
              </Grid>
            </Section>

            <Section title="Monitoring & Health" description="Health checks and monitoring switches.">
              <Grid>
                <Row label="API Health Check Interval (sec)"><input type="number" value={settings.monitoring.apiHealthCheckInterval} onChange={(e) => update("monitoring.apiHealthCheckInterval", Number(e.target.value))} /></Row>
                <Row label="ML Health Check"><Toggle value={settings.monitoring.mlHealthCheck} onChange={(value) => update("monitoring.mlHealthCheck", value)} /></Row>
                <Row label="Database Health Check"><Toggle value={settings.monitoring.databaseHealthCheck} onChange={(value) => update("monitoring.databaseHealthCheck", value)} /></Row>
                <Row label="Prometheus Exporter"><Toggle value={settings.monitoring.prometheusExporter} onChange={(value) => update("monitoring.prometheusExporter", value)} /></Row>
              </Grid>
            </Section>

            <Section title="UI Customization" description="Branding and dashboard layout.">
              <Grid>
                <Row label="Logo"><input value={settings.ui.logo} onChange={(e) => update("ui.logo", e.target.value)} /></Row>
                <Row label="Favicon"><input value={settings.ui.favicon} onChange={(e) => update("ui.favicon", e.target.value)} /></Row>
                <Row label="Dashboard Layout"><select value={settings.ui.dashboardLayout} onChange={(e) => update("ui.dashboardLayout", e.target.value)}><option>Grid</option><option>List</option></select></Row>
                <Row label="Enable Dark Mode"><Toggle value={settings.ui.enableDarkMode} onChange={(value) => update("ui.enableDarkMode", value)} /></Row>
              </Grid>
            </Section>
          </>
        ) : (
          <>
            <Section title="Profile & Preferences" description="Personalize your analyst workspace.">
              <Grid>
                <Row label="Display Name"><input value={settings.profile.displayName} onChange={(e) => update("profile.displayName", e.target.value)} /></Row>
                <Row label="Email Address"><input value={settings.profile.emailAddress || session?.email || ""} readOnly /></Row>
                <Row label="Theme"><select value={settings.profile.theme} onChange={(e) => update("profile.theme", e.target.value)}><option>Light</option><option>Dark</option><option>System</option></select></Row>
                <Row label="Default Dashboard"><select value={settings.profile.defaultDashboard} onChange={(e) => update("profile.defaultDashboard", e.target.value)}><option>Dashboard</option><option>Analytics</option><option>Transactions</option></select></Row>
                <Row label="Time Zone"><select value={settings.profile.timeZone} onChange={(e) => update("profile.timeZone", e.target.value)}><option>Asia/Kolkata</option><option>UTC</option><option>America/New_York</option></select></Row>
                <Row label="Date Format"><select value={settings.profile.dateFormat} onChange={(e) => update("profile.dateFormat", e.target.value)}><option>DD/MM/YYYY</option><option>YYYY-MM-DD</option></select></Row>
              </Grid>
            </Section>

            <Section title="Notification Settings" description="Control popups, sound, email, and priority.">
              <Grid>
                <Row label="In-App Popups"><Toggle value={settings.notifications.inAppPopups} onChange={(value) => update("notifications.inAppPopups", value)} /></Row>
                <Row label="Sound Alert"><Toggle value={settings.notifications.soundAlert} onChange={(value) => update("notifications.soundAlert", value)} /></Row>
                <Row label="Email Alerts"><Toggle value={settings.notifications.emailAlerts} onChange={(value) => update("notifications.emailAlerts", value)} /></Row>
                <Row label="Email Frequency"><select value={settings.notifications.emailFrequency} onChange={(e) => update("notifications.emailFrequency", e.target.value)}><option>Immediate</option><option>Digest (hourly)</option></select></Row>
                <Row label="Minimum Priority"><select value={settings.notifications.minimumPriority} onChange={(e) => update("notifications.minimumPriority", e.target.value)}><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></Row>
              </Grid>
            </Section>

            <Section title="Dashboard Layout & Widgets" description="Choose which widgets appear by default.">
              <Grid>
                <Row label="Summary Cards"><Toggle value={settings.dashboard.showSummaryCards} onChange={(value) => update("dashboard.showSummaryCards", value)} /></Row>
                <Row label="Real-Time Metrics"><Toggle value={settings.dashboard.showRealTimeMetrics} onChange={(value) => update("dashboard.showRealTimeMetrics", value)} /></Row>
                <Row label="Fraud Trend Chart"><Toggle value={settings.dashboard.showFraudTrendChart} onChange={(value) => update("dashboard.showFraudTrendChart", value)} /></Row>
                <Row label="Top Rules Chart"><Toggle value={settings.dashboard.showTopRulesChart} onChange={(value) => update("dashboard.showTopRulesChart", value)} /></Row>
                <Row label="Transaction Stream"><Toggle value={settings.dashboard.showTransactionStream} onChange={(value) => update("dashboard.showTransactionStream", value)} /></Row>
                <Row label="Table Page Size"><select value={settings.dashboard.defaultTablePageSize} onChange={(e) => update("dashboard.defaultTablePageSize", Number(e.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></Row>
              </Grid>
            </Section>

            <Section title="Simulation Preferences" description="Configure your default simulation workflow.">
              <Grid>
                <Row label="Default Simulation Mode"><select value={settings.simulation.defaultSimulationMode} onChange={(e) => update("simulation.defaultSimulationMode", e.target.value)}><option>Continuous</option><option>Batch</option><option>Single</option></select></Row>
                <Row label="Default Scenario"><select value={settings.simulation.defaultScenario} onChange={(e) => update("simulation.defaultScenario", e.target.value)}><option>Mixed</option><option>Card Testing</option><option>Account Takeover</option><option>Velocity Attack</option><option>Geo-Mismatch</option><option>Custom</option></select></Row>
                <Row label="Transactions per Minute"><input type="range" min={0} max={500} value={settings.simulation.defaultTransactionsPerMinute} onChange={(e) => update("simulation.defaultTransactionsPerMinute", Number(e.target.value))} /></Row>
                <Row label="Risk Multiplier"><input type="range" min={0.5} max={5} step={0.1} value={Number(settings.simulation.riskMultiplier)} onChange={(e) => update("simulation.riskMultiplier", e.target.value)} /></Row>
                <Row label="Auto-Stop After"><div className="settings-inline"><Toggle value={settings.simulation.autoStopEnabled} onChange={(value) => update("simulation.autoStopEnabled", value)} /><input value={settings.simulation.autoStopAfter} onChange={(e) => update("simulation.autoStopAfter", e.target.value)} /></div></Row>
              </Grid>
            </Section>

            <Section title="Alert Handling" description="Control read state and alert emphasis.">
              <Grid>
                <Row label="Default Alert View"><select value={settings.alerts.defaultAlertView} onChange={(e) => update("alerts.defaultAlertView", e.target.value)}><option>Unread alerts only</option><option>All alerts</option></select></Row>
                <Row label="Auto-Mark as Read"><Toggle value={settings.alerts.autoMarkAsRead} onChange={(value) => update("alerts.autoMarkAsRead", value)} /></Row>
                <Row label="Highlight Critical Alerts"><Toggle value={settings.alerts.highlightCriticalAlerts} onChange={(value) => update("alerts.highlightCriticalAlerts", value)} /></Row>
                <Row label="Group Alerts by Rule"><Toggle value={settings.alerts.groupAlertsByRule} onChange={(value) => update("alerts.groupAlertsByRule", value)} /></Row>
              </Grid>
            </Section>

            <Section title="Export Preferences" description="Pick the default export behavior.">
              <Grid>
                <Row label="Default Export Format"><select value={settings.export.defaultExportFormat} onChange={(e) => update("export.defaultExportFormat", e.target.value)}><option>CSV</option><option>JSON</option><option>Excel</option></select></Row>
                <Row label="Include Headers"><Toggle value={settings.export.includeHeaders} onChange={(value) => update("export.includeHeaders", value)} /></Row>
                <Row label="Anonymize Sensitive Data"><Toggle value={settings.export.anonymizeSensitiveData} onChange={(value) => update("export.anonymizeSensitiveData", value)} /></Row>
                <Row label="Export Destination"><select value={settings.export.exportDestination} onChange={(e) => update("export.exportDestination", e.target.value)}><option>Download</option><option>Email</option><option>S3</option></select></Row>
              </Grid>
            </Section>

            <Section title="Advanced (Analyst)" description="Power-user diagnostics and ML visibility.">
              <Grid>
                <Row label="Debug Mode"><Toggle value={settings.advanced.debugMode} onChange={(value) => update("advanced.debugMode", value)} disabled={!session?.role || session.role !== "ADMIN"} /></Row>
                <Row label="Show ML Score in Alerts"><Toggle value={settings.advanced.showMlScoreInAlerts} onChange={(value) => update("advanced.showMlScoreInAlerts", value)} /></Row>
                <Row label="Rule Toggle Quick Panel"><Toggle value={settings.advanced.ruleToggleQuickPanel} onChange={(value) => update("advanced.ruleToggleQuickPanel", value)} /></Row>
              </Grid>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="settings-grid">{children}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">{label}</div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange, disabled = false }: { value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="slider" />
    </label>
  );
}

function TemplateBundleEditor({
  title,
  templates,
  onChange,
  onReset
}: {
  title: string;
  templates: ReportTemplate[];
  onChange: (index: number, field: keyof ReportTemplate, value: string) => void;
  onReset: () => void;
}) {
  return (
    <div style={{ marginTop: 18 }}>
      <div className="table-heading" style={{ marginBottom: 10 }}>
        <div>
          <div className="detail-title">{title}</div>
          <div className="muted">These starter bundles prefill scheduled reporting on Dashboard and Cases.</div>
        </div>
        <button className="pill" onClick={onReset}>Reset Bundle</button>
      </div>
      <div className="report-template-grid">
        {templates.map((template, index) => (
          <div key={template.id} className="report-template-card">
            <strong>{template.name}</strong>
            <label className="muted">Name</label>
            <input value={template.name} onChange={(e) => onChange(index, "name", e.target.value)} />
            <label className="muted">Description</label>
            <input value={template.description} onChange={(e) => onChange(index, "description", e.target.value)} />
            <label className="muted">Hour</label>
            <input type="time" value={template.hour} onChange={(e) => onChange(index, "hour", e.target.value)} />
            <label className="muted">Format</label>
            <select value={template.format} onChange={(e) => onChange(index, "format", e.target.value)}>
              <option value="PDF">PDF</option>
              <option value="EXCEL">Excel</option>
            </select>
            <label className="muted">Cadence</label>
            <select value={template.cadence} onChange={(e) => onChange(index, "cadence", e.target.value)}>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
            </select>
            <label className="muted">Preset</label>
            <select value={template.preset} onChange={(e) => onChange(index, "preset", e.target.value)}>
              <option value="ALL_OPS">{formatPresetLabel("ALL_OPS")}</option>
              <option value="BREACHED_ONLY">{formatPresetLabel("BREACHED_ONLY")}</option>
              <option value="ESCALATED_ONLY">{formatPresetLabel("ESCALATED_ONLY")}</option>
              <option value="FOCUSED_ANALYST_ONLY">{formatPresetLabel("FOCUSED_ANALYST_ONLY")}</option>
            </select>
            <label className="muted">Recipients</label>
            <input value={template.recipients} onChange={(e) => onChange(index, "recipients", e.target.value)} placeholder="ops@example.com" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateHistoryPanel({ history, onRestore }: { history: SettingsHistoryEntry[]; onRestore: (entry: SettingsHistoryEntry) => void }) {
  const templateHistory = history
    .map((entry) => ({
      raw: entry,
      id: entry.id,
      updatedBy: entry.updatedBy || "System",
      createdAt: entry.createdAt,
      bundles: countTemplateBundles(entry.settings)
    }))
    .filter((entry) => entry.bundles > 0)
    .slice(0, 8);
  const [primaryId, setPrimaryId] = useState<number | "">("");
  const [secondaryId, setSecondaryId] = useState<number | "">("");
  const [copiedPath, setCopiedPath] = useState("");
  const [copyToast, setCopyToast] = useState("");

  const primaryEntry = templateHistory.find((entry) => entry.id === primaryId)?.raw;
  const secondaryEntry = templateHistory.find((entry) => entry.id === secondaryId)?.raw;
  const diffRows = primaryEntry && secondaryEntry ? buildTemplateDiffRows(primaryEntry.settings, secondaryEntry.settings) : [];
  const diffTitle =
    primaryEntry && secondaryEntry
      ? `template-compare-${primaryEntry.id}-vs-${secondaryEntry.id}`
      : "template-compare";

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setCopyToast(`Copied ${path}`);
      window.setTimeout(() => {
        setCopiedPath((current) => (current === path ? "" : current));
        setCopyToast((current) => (current === `Copied ${path}` ? "" : current));
      }, 1800);
    } catch {
      setCopiedPath("");
      setCopyToast("");
    }
  };

  const copyAllChangedPaths = async () => {
    if (!diffRows.length) return;
    const combined = diffRows.map((row) => row.path).join("\n");
    try {
      await navigator.clipboard.writeText(combined);
      setCopiedPath("");
      setCopyToast(`Copied ${diffRows.length} changed path${diffRows.length === 1 ? "" : "s"}`);
      window.setTimeout(() => {
        setCopyToast((current) =>
          current === `Copied ${diffRows.length} changed path${diffRows.length === 1 ? "" : "s"}` ? "" : current
        );
      }, 1800);
    } catch {
      setCopyToast("");
    }
  };

  const exportDiffPdf = () => {
    if (!primaryEntry || !secondaryEntry) return;
    downloadPdf(
      diffTitle,
      ["Path", "Field", "Group", "Primary Version", "Secondary Version"],
      buildTemplateDiffExportRows(diffRows)
    );
  };

  const exportDiffExcel = () => {
    if (!primaryEntry || !secondaryEntry) return;
    downloadExcel(
      diffTitle,
      ["Path", "Field", "Group", "Primary Version", "Secondary Version"],
      buildTemplateDiffExportRows(diffRows)
    );
  };

  const exportDiffCsv = () => {
    if (!primaryEntry || !secondaryEntry) return;
    downloadCsv(
      diffTitle,
      ["Path", "Field", "Group", "Primary Version", "Secondary Version"],
      buildTemplateDiffExportRows(diffRows)
    );
  };

  return (
    <div style={{ marginTop: 18 }}>
      <div className="table-heading" style={{ marginBottom: 10 }}>
        <div>
          <div className="detail-title">Template Version History</div>
          <div className="muted">Recent saved versions of the global starter bundles.</div>
        </div>
      </div>
      {templateHistory.length ? (
        <div className="mini-panel" style={{ marginBottom: 14 }}>
          <div className="detail-title">Compare Versions</div>
          <div className="detail-grid" style={{ marginTop: 12 }}>
            <div>
              <label className="muted">Primary Version</label>
              <select className="settings-select" value={primaryId} onChange={(e) => setPrimaryId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Select version</option>
                {templateHistory.map((entry, index) => (
                  <option key={`primary-${entry.id}`} value={entry.id}>
                    Version {templateHistory.length - index} - {entry.updatedBy}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="muted">Secondary Version</label>
              <select className="settings-select" value={secondaryId} onChange={(e) => setSecondaryId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Select version</option>
                {templateHistory.map((entry, index) => (
                  <option key={`secondary-${entry.id}`} value={entry.id}>
                    Version {templateHistory.length - index} - {entry.updatedBy}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {primaryEntry && secondaryEntry ? (
            diffRows.length ? (
              <div style={{ marginTop: 12 }}>
                <div className="table-heading" style={{ marginBottom: 10 }}>
                  <div className="muted">Export the selected version comparison for audit sharing.</div>
                  <div className="action-row">
                    <button type="button" className="pill" onClick={exportDiffPdf}>Export Diff PDF</button>
                    <button type="button" className="pill" onClick={exportDiffExcel}>Export Diff Excel</button>
                    <button type="button" className="pill" onClick={exportDiffCsv}>Export Diff CSV</button>
                    <button type="button" className="pill" onClick={() => void copyAllChangedPaths()}>Copy All Changed Paths</button>
                  </div>
                </div>
                {copyToast ? <div className="copy-toast">{copyToast}</div> : null}
                <div className="template-version-meta-grid">
                  <div className="template-version-meta-card">
                    <span className="muted">Primary Version</span>
                    <strong>{primaryEntry.updatedBy || "System"}</strong>
                    <div className="muted">{primaryEntry.createdAt ? new Date(primaryEntry.createdAt).toLocaleString() : "-"}</div>
                    <div className="muted">{countTemplateBundles(primaryEntry.settings)} template bundles</div>
                  </div>
                  <div className="template-version-meta-card">
                    <span className="muted">Secondary Version</span>
                    <strong>{secondaryEntry.updatedBy || "System"}</strong>
                    <div className="muted">{secondaryEntry.createdAt ? new Date(secondaryEntry.createdAt).toLocaleString() : "-"}</div>
                    <div className="muted">{countTemplateBundles(secondaryEntry.settings)} template bundles</div>
                  </div>
                </div>
                <div className="detail-activity-list" style={{ marginTop: 12 }}>
                  {diffRows.map((row) => (
                    <div key={row.path} className="detail-activity-item template-diff-card">
                      <div style={{ minWidth: 0 }}>
                        <div className="template-diff-heading">
                          <strong>{row.label}</strong>
                          <span className="template-diff-badge">Changed</span>
                        </div>
                        <div className="muted">{row.groupLabel}</div>
                        <div className="template-diff-path-row">
                          <div className="muted">{row.path}</div>
                          <button type="button" className="template-diff-copy" onClick={() => void copyPath(row.path)}>
                            {copiedPath === row.path ? "Copied" : "Copy Path"}
                          </button>
                        </div>
                      </div>
                      <div className="template-diff-values">
                        <div className="template-diff-value from">
                          <span className="muted">Primary</span>
                          <strong>{row.from}</strong>
                        </div>
                        <div className="template-diff-value to">
                          <span className="muted">Secondary</span>
                          <strong>{row.to}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 12 }}>No template bundle differences found between the selected versions.</div>
            )
          ) : (
            <div className="muted" style={{ marginTop: 12 }}>Select two saved versions to compare template changes.</div>
          )}
        </div>
      ) : null}
      {templateHistory.length ? (
        <div className="detail-activity-list">
          {templateHistory.map((entry, index) => (
            <div key={entry.id} className="detail-activity-item">
              <div>
                <strong>Version {templateHistory.length - index}</strong>
                <div className="muted">Saved by {entry.updatedBy}</div>
                <div className="muted">{entry.bundles} template bundle snapshots captured</div>
              </div>
              <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                <div className="muted">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "-"}</div>
                <button className="pill" onClick={() => onRestore(entry.raw)}>Restore This Version</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted">No template history recorded yet.</div>
      )}
    </div>
  );
}

function setPathValue(source: SettingsState, path: string, value: unknown) {
  const keys = path.split(".");
  const next = { ...source };
  let cursor: any = next;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    const current = cursor[key];
    cursor[key] = current && typeof current === "object" ? { ...current } : {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
  return next;
}

function getTemplateBundle(settings: SettingsState, role: "ADMIN" | "ANALYTICS", scope: ReportScope) {
  const stored = settings?.reporting?.roleTemplates?.[role]?.[scope];
  if (Array.isArray(stored) && stored.length) {
    return stored as ReportTemplate[];
  }
  return getReportTemplatesByRole(role, scope);
}

function updateTemplateBundle(
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>,
  settings: SettingsState,
  role: "ADMIN" | "ANALYTICS",
  scope: ReportScope,
  index: number,
  field: keyof ReportTemplate,
  value: string
) {
  const next = cloneSettings(settings);
  const bundle = getTemplateBundle(next, role, scope).map((item) => ({ ...item }));
  bundle[index] = { ...bundle[index], [field]: value };
  next.reporting = next.reporting || {};
  next.reporting.roleTemplates = next.reporting.roleTemplates || {};
  next.reporting.roleTemplates[role] = next.reporting.roleTemplates[role] || {};
  next.reporting.roleTemplates[role][scope] = bundle;
  setSettings(next);
}

function resetTemplateBundle(
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>,
  settings: SettingsState,
  role: "ADMIN" | "ANALYTICS",
  scope: ReportScope
) {
  const next = cloneSettings(settings);
  next.reporting = next.reporting || {};
  next.reporting.roleTemplates = next.reporting.roleTemplates || {};
  next.reporting.roleTemplates[role] = next.reporting.roleTemplates[role] || {};
  next.reporting.roleTemplates[role][scope] = getReportTemplatesByRole(role, scope);
  setSettings(next);
}

function countTemplateBundles(settings: Record<string, unknown>) {
  const reporting = settings?.reporting as Record<string, any> | undefined;
  const roleTemplates = reporting?.roleTemplates as Record<string, any> | undefined;
  if (!roleTemplates) return 0;
  let total = 0;
  Object.values(roleTemplates).forEach((roleEntry) => {
    if (roleEntry && typeof roleEntry === "object") {
      total += Object.values(roleEntry).filter((bundle) => Array.isArray(bundle) && bundle.length > 0).length;
    }
  });
  return total;
}

function buildTemplateDiffRows(primarySettings: Record<string, unknown>, secondarySettings: Record<string, unknown>) {
  const primary = flattenTemplateBundles(primarySettings);
  const secondary = flattenTemplateBundles(secondarySettings);
  const keys = Array.from(new Set([...Object.keys(primary), ...Object.keys(secondary)])).sort();
  return keys
    .filter((key) => String(primary[key] ?? "") !== String(secondary[key] ?? ""))
    .map((key) => {
      const [roleKey = "", scopeKey = "", templateIndex = "", fieldKey = ""] = key.split(".");
      return {
        path: key,
        label: humanizeTemplateDiffToken(fieldKey),
        groupLabel: `${humanizeTemplateDiffToken(roleKey)} / ${humanizeTemplateDiffToken(scopeKey)} / Template ${templateIndex}`,
        from: String(primary[key] ?? "-"),
        to: String(secondary[key] ?? "-")
      };
    });
}

function flattenTemplateBundles(settings: Record<string, unknown>) {
  const roleTemplates = ((settings?.reporting as Record<string, any> | undefined)?.roleTemplates || {}) as Record<string, any>;
  const result: Record<string, string> = {};
  Object.entries(roleTemplates).forEach(([roleKey, scopeMap]) => {
    Object.entries((scopeMap || {}) as Record<string, any>).forEach(([scopeKey, templates]) => {
      if (!Array.isArray(templates)) return;
      templates.forEach((template, index) => {
        const base = `${roleKey}.${scopeKey}.${index + 1}`;
        result[`${base}.name`] = String(template?.name || "");
        result[`${base}.description`] = String(template?.description || "");
        result[`${base}.hour`] = String(template?.hour || "");
        result[`${base}.format`] = String(template?.format || "");
        result[`${base}.cadence`] = String(template?.cadence || "");
        result[`${base}.preset`] = String(template?.preset || "");
        result[`${base}.recipients`] = String(template?.recipients || "");
      });
    });
  });
  return result;
}

function humanizeTemplateDiffToken(value: string) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildTemplateDiffExportRows(
  diffRows: Array<{ path: string; label: string; groupLabel: string; from: string; to: string }>
) {
  return diffRows.map((row) => [row.path, row.label, row.groupLabel, row.from, row.to]);
}
