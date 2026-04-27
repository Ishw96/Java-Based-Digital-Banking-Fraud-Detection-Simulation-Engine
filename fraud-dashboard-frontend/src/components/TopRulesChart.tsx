import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { type Alert } from "../types/Alert";

interface Props {
  data: Alert[];
}

export default function TopRulesChart({ data }: Props) {
  const rules: Record<string, number> = {};

  data.forEach((a) => {
    const key = normalizeRule(a.ruleTriggered);
    if (!key) return;
    rules[key] = (rules[key] || 0) + 1;
  });

  const chartData = Object.keys(rules).map((rule) => ({
    rule,
    count: rules[rule]
  }));

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <BarChart data={chartData}>
          <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
          <XAxis dataKey="rule" stroke="#9fb2d9" tick={{ fill: "#e8eefc", fontSize: 12 }} />
          <YAxis stroke="#9fb2d9" />
          <Tooltip content={<DarkTooltip />} />
          <Bar dataKey="count" fill="#4361ee" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function normalizeRule(rule?: string | null) {
  const value = (rule || "").trim();
  if (!value || value.toLowerCase() === "unknown" || value === "null") return "";
  return value;
}

function DarkTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{String(label)}</div>
      <div className="chart-tooltip-value">{payload[0].value}</div>
    </div>
  );
}
