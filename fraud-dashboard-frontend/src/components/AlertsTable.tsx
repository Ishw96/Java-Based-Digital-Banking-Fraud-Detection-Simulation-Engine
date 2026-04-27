import { type Alert } from "../types/Alert";

interface Props {
  alerts: Alert[];
  onView?: (alert: Alert) => void;
}

function riskClass(priority?: string | null) {
  const p = (priority || "").toUpperCase();
  if (p.includes("CRITICAL") || p.includes("HIGH")) return "high";
  if (p.includes("MEDIUM")) return "medium";
  return "low";
}

export default function AlertsTable({ alerts, onView }: Props) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Transaction ID</th>
            <th>Transaction</th>
            <th>Rules</th>
            <th>Risk Score</th>
            <th>Priority</th>
            {onView ? <th>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {alerts.map((a) => (
            <tr key={a.id ?? `${a.transactionId}-${a.ruleTriggered}`}>
              <td>{a.transactionId || "—"}</td>
              <td>{a.transactionType || a.type || "TRANSFER"}</td>
              <td>{a.ruleTriggered || "—"}</td>
              <td>{a.riskScore != null ? Number(a.riskScore).toFixed(3) : "—"}</td>
              <td><span className={`chip ${riskClass(a.priority)}`}>{a.priority || a.riskLevel || "—"}</span></td>
              {onView ? (
                <td>
                  <button className="btn-accent" style={{ boxShadow: "none", padding: "8px 12px" }} onClick={() => onView(a)}>
                    View
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
