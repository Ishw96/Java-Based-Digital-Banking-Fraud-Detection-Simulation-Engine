import { useEffect, useMemo, useState } from "react";
import { getRuleConfigs, updateRuleConfigActive } from "../services/alertService";
import type { RuleConfig } from "../services/alertService";

const ruleMeta: Record<string, { label: string; description: string; severity: string }> = {
  "High Amount Threshold": { label: "High Amount Threshold", description: "Flags transactions above the configured amount limit.", severity: "HIGH" },
  "Velocity Check": { label: "Velocity Check", description: "Detects repeated actions in a short window.", severity: "MEDIUM" },
  "Geo-Location Anomaly": { label: "Geo-Location Anomaly", description: "Flags unusual location changes and route jumps.", severity: "HIGH" },
  "Account Behavior Model": { label: "Account Behavior Model", description: "Learns normal account spending patterns.", severity: "MEDIUM" },
  "Merchant Blacklist": { label: "Merchant Blacklist", description: "Blocks known suspicious or blacklisted merchants.", severity: "CRITICAL" },
  "Neural Network Classifier": { label: "Neural Network Classifier", description: "Deep scoring layer for high-confidence anomaly detection.", severity: "CRITICAL" }
};

export default function Detection({ syncKey }: { syncKey?: string }) {
  const [rules, setRules] = useState<RuleConfig[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setRules(await getRuleConfigs());
  };

  useEffect(() => {
    load();
  }, [syncKey]);

  const activeCount = useMemo(() => rules.filter((rule) => rule.active).length, [rules]);

  const toggle = async (rule: RuleConfig) => {
    setSaving(rule.ruleName);
    try {
      const updated = await updateRuleConfigActive(rule.ruleName, !rule.active);
      setRules((prev) => prev.map((item) => (item.ruleName === updated.ruleName ? updated : item)));
      window.dispatchEvent(new Event("fraud:sync"));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="section">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0 }}>Anomaly Detection & Alerts</h2>
          <p className="muted">Toggle fraud rules ON/OFF and sync the backend config table.</p>
        </div>
        <span className="chip approved">{activeCount} / {rules.length} Active</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16, marginTop: 16 }}>
        <div className="section" style={{ background: "#0f1a2b" }}>
          <h3 style={{ marginTop: 0 }}>Detection Rules</h3>
          <div className="card-list">
            {rules.map((rule) => {
              const meta = ruleMeta[rule.ruleName] || { label: rule.ruleName, description: "Fraud prevention rule", severity: "MEDIUM" };
              return (
                <div key={rule.id} className="rule-card">
                  <div style={{ flex: 1 }}>
                    <div className="rule-title">{meta.label}</div>
                    <div className="muted" style={{ marginTop: 4 }}>{meta.description}</div>
                    <div className="rule-meta">
                      <span className="chip low">Threshold {formatNumber(rule.thresholdValue)}</span>
                      <span className={`chip ${meta.severity === "CRITICAL" ? "high" : meta.severity === "HIGH" ? "high" : "medium"}`}>{meta.severity}</span>
                      <span className="muted">Weight {formatNumber(rule.weight)}</span>
                    </div>
                  </div>
                  <div className="rule-right">
                    <span className="muted">{rule.active ? "Enabled" : "Disabled"}</span>
                    <label className="switch">
                      <input type="checkbox" checked={rule.active} onChange={() => toggle(rule)} disabled={saving === rule.ruleName} />
                      <span className="slider" />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="section" style={{ background: "#0f1a2b" }}>
          <h3 style={{ marginTop: 0 }}>Fraud by Category (30d)</h3>
          <CategoryBars rules={rules} />
        </div>
      </div>
    </div>
  );
}

function CategoryBars({ rules }: { rules: RuleConfig[] }) {
  const bars = rules.map((rule, index) => ({
    name: rule.ruleName,
    value: Math.max(Number(rule.thresholdValue || 0) * 100 + Number(rule.weight || 0) * 100 + (rule.active ? 20 : 0), 10),
    index
  }));
  const max = Math.max(...bars.map((bar) => bar.value), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 10 }}>
      {bars.map((bar) => (
        <div key={bar.name}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span>{bar.name}</span>
            <span>{Math.round(bar.value)}</span>
          </div>
          <div style={{ height: 12, background: "#121c30", borderRadius: 999 }}>
            <div
              style={{
                width: `${(bar.value / max) * 100}%`,
                height: "100%",
                borderRadius: 999,
                background: "linear-gradient(90deg, #f54b64, #ff9b6b)"
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatNumber(value: number | null) {
  return value == null ? "—" : Number(value).toFixed(2);
}
