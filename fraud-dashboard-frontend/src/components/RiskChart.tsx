import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { type Alert } from "../types/Alert";

interface Props {
  data: Alert[];
}

export default function RiskChart({ data }: Props) {
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
          <XAxis dataKey="transactionId" stroke="#9fb2d9" tick={{ fill: "#e8eefc", fontSize: 11 }} />
          <YAxis stroke="#9fb2d9" />
          <Tooltip content={<DarkTooltip />} />
          <Line type="monotone" dataKey="riskScore" stroke="#ff4d4f" strokeWidth={3} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DarkTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{String(label)}</div>
      <div className="chart-tooltip-value">{Number(payload[0].value || 0).toFixed(3)}</div>
    </div>
  );
}
