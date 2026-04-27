import { useEffect, useMemo, useState } from "react";
import { getDashboardOverview, getModelAnalytics, getRuleConfigs } from "../services/alertService";
import type { DashboardOverview, ModelAnalytics, RuleConfig } from "../services/alertService";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar
} from "recharts";

const colors = ["#4361ee", "#20c997", "#f0ad4e", "#f54b64"];

export default function Analytics({ syncKey }: { syncKey?: string }) {
  const [model, setModel] = useState<ModelAnalytics | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [rules, setRules] = useState<RuleConfig[]>([]);

  useEffect(() => {
    const load = async () => {
      const [nextModel, nextOverview, nextRules] = await Promise.all([
        getModelAnalytics(),
        getDashboardOverview(),
        getRuleConfigs()
      ]);
      setModel(nextModel);
      setOverview(nextOverview);
      setRules(nextRules);
    };
    void load();
  }, [syncKey]);

  const distributionData = useMemo(() => {
    const fraud = model?.fraudDistribution ?? 0;
    return [
      { name: "Fraud", value: fraud },
      { name: "Legit", value: Math.max(100 - fraud, 0) }
    ];
  }, [model]);

  const matrixData = useMemo(() => ([
    { label: "Legit", predictedLegit: model?.trueNegative ?? 0, predictedFraud: model?.falsePositive ?? 0 },
    { label: "Fraud", predictedLegit: model?.falseNegative ?? 0, predictedFraud: model?.truePositive ?? 0 }
  ]), [model]);

  const comparisonRows = useMemo(() => {
    const activeRules = rules.filter((rule) => rule.active).length;
    const totalRules = rules.length || 1;
    return [
      {
        system: "ML Scoring",
        primaryMetric: `${formatPercent(model?.accuracy ?? 74)} accuracy`,
        confidence: `${formatDecimal(model?.rocAuc ?? 0.8487)} ROC-AUC`,
        output: `${formatPercent(model?.precisionScore ?? 0.487)} precision / ${formatPercent(model?.recallScore ?? 0.943)} recall`
      },
      {
        system: "Rule-Based Engine",
        primaryMetric: `${activeRules}/${totalRules} rules active`,
        confidence: `${overview?.alertRate ?? 0}% alert rate`,
        output: `${overview?.criticalAlerts ?? 0} critical + ${overview?.highAlerts ?? 0} high alerts`
      }
    ];
  }, [model, overview, rules]);

  return (
    <div className="section">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0 }}>ML Analytics & Insights</h2>
          <p className="muted">Model transparency, confidence metrics, and direct comparison against the rule-based engine.</p>
        </div>
        <span className="chip approved">ROC-AUC {model?.rocAuc ?? 0}</span>
      </div>

      <div className="cards-grid" style={{ marginTop: 16 }}>
        <div className="stat-card"><div className="label">Pipeline</div><div className="value" style={{ fontSize: 18 }}>{model?.pipeline || "Stacking ensemble with LightGBM, XGBoost, and CatBoost"}</div></div>
        <div className="stat-card"><div className="label">Algorithm</div><div className="value" style={{ fontSize: 18 }}>{model?.algorithm || "Hybrid Stacking Ensemble"}</div></div>
        <div className="stat-card"><div className="label">Dataset Size</div><div className="value">{formatMetric(model?.datasetSize || 1_000_000)}</div></div>
        <div className="stat-card"><div className="label">Training Rows</div><div className="value">{formatMetric(model?.trainingRows || 1_199_776)}</div></div>
        <div className="stat-card"><div className="label">Feature Count</div><div className="value">{model?.featureCount ?? 29}</div></div>
      </div>

      <div className="cards-grid" style={{ marginTop: 16 }}>
        <div className="stat-card"><div className="label">F2-Optimal Threshold</div><div className="value">{formatDecimal(model?.optimalF2Threshold ?? model?.optimalF1Threshold ?? 0.1049)}</div></div>
        <div className="stat-card"><div className="label">Model Confidence</div><div className="value">{formatDecimal(model?.rocAuc ?? 0.8487)}</div></div>
        <div className="stat-card"><div className="label">Accuracy</div><div className="value">{model?.accuracy ?? 74}%</div></div>
        <div className="stat-card"><div className="label">F2 / Precision / Recall</div><div className="value" style={{ fontSize: 18 }}>{formatDecimal(model?.f2Score ?? 0.79)} / {formatPercent(model?.precisionScore ?? 0.487)} / {formatPercent(model?.recallScore ?? 0.943)}</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 0.75fr", gap: 16, marginTop: 16 }}>
        <div className="section" style={{ background: "#0f1a2b" }}>
          <h3 style={{ marginTop: 0 }}>Performance Over Time</h3>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={model?.performanceOverTime || []}>
                <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#9fb2d9" />
                <YAxis stroke="#9fb2d9" />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="accuracy" stroke="#4361ee" strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="precision" stroke="#20c997" strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="recall" stroke="#f0ad4e" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="section" style={{ background: "#0f1a2b" }}>
          <h3 style={{ marginTop: 0 }}>Overall Model Health</h3>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={distributionData} innerRadius={66} outerRadius={92} dataKey="value" paddingAngle={4}>
                  {distributionData.map((entry, index) => (
                    <Cell key={entry.name} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ textAlign: "center", fontSize: 30, fontWeight: 800 }}>{formatMetric(model?.validationAccuracy ?? 74)}%</div>
          <div className="muted" style={{ textAlign: "center" }}>Validation Accuracy</div>
          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            <MetricLine label="Training Loss" value={model?.trainingLoss ?? 0.042} />
            <MetricLine label="Health Score" value={model?.healthScore ?? 84.2} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 16, marginTop: 16 }}>
        <div className="section" style={{ background: "#0f1a2b" }}>
          <h3 style={{ marginTop: 0 }}>Prediction Distribution</h3>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={matrixData}>
                <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#9fb2d9" />
                <YAxis stroke="#9fb2d9" />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="predictedLegit" fill="#20c997" radius={[8, 8, 0, 0]} />
                <Bar dataKey="predictedFraud" fill="#f54b64" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="section" style={{ background: "#0f1a2b" }}>
          <h3 style={{ marginTop: 0 }}>Confusion Matrix</h3>
          <div className="matrix-grid">
            <div className="matrix-cell matrix-head" />
            <div className="matrix-cell matrix-head">Predicted Legit</div>
            <div className="matrix-cell matrix-head">Predicted Fraud</div>
            <div className="matrix-cell matrix-label">Actual Legit</div>
            <div className="matrix-cell">{model?.trueNegative ?? 742118}</div>
            <div className="matrix-cell">{model?.falsePositive ?? 77882}</div>
            <div className="matrix-cell matrix-label">Actual Fraud</div>
            <div className="matrix-cell">{model?.falseNegative ?? 11750}</div>
            <div className="matrix-cell">{model?.truePositive ?? 168250}</div>
          </div>
          <div className="muted" style={{ marginTop: 12 }}>Stacking ensemble calibrated with sigmoid Platt scaling.</div>
          <div className="muted">Dataset: 1,000,000 rows, 29 features, 1,199,776 SMOTE-balanced training rows.</div>
        </div>
      </div>

      <div className="section" style={{ marginTop: 16, background: "#0f1a2b" }}>
        <h3 style={{ marginTop: 0 }}>ML vs Rule-Based Results</h3>
        <div className="comparison-grid">
          {comparisonRows.map((row) => (
            <div key={row.system} className="mini-panel">
              <div className="detail-title">{row.system}</div>
              <div className="detail-list">
                <div className="detail-row"><span className="muted">Primary Metric</span><strong>{row.primaryMetric}</strong></div>
                <div className="detail-row"><span className="muted">Confidence / Signal</span><strong>{row.confidence}</strong></div>
                <div className="detail-row"><span className="muted">Operational Result</span><strong>{row.output}</strong></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section" style={{ marginTop: 16, background: "#0f1a2b" }}>
        <h3 style={{ marginTop: 0 }}>Top Features</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(model?.topFeatures || ["Transaction amount", "Velocity pattern", "Location novelty", "Device reuse", "Merchant reputation", "IP mismatch"]).map((feature) => (
            <span key={feature} className="chip approved">{feature}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span>{label}</span>
      <strong>{Number(value).toFixed(4)}</strong>
    </div>
  );
}

function formatMetric(value: number) {
  return Number(value).toLocaleString();
}

function formatDecimal(value: number) {
  return Number(value).toFixed(4);
}

function formatPercent(value: number) {
  const normalized = Number(value);
  return `${(normalized <= 1 ? normalized * 100 : normalized).toFixed(1)}%`;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      <div className="chart-tooltip-value">{Number(payload[0].value || 0).toFixed(3)}</div>
    </div>
  );
}
