import { type Alert } from "../types/Alert";

interface Props {
  alerts: Alert[];
}

export default function TransactionStream({ alerts }: Props) {
  return (
    <div style={{
      background: "#09111d",
      color: "#d8e4ff",
      padding: 18,
      height: 300,
      overflowY: "auto",
      borderRadius: 14,
      border: "1px solid #1f2a44",
      fontFamily: "monospace"
    }}>
      <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, marginBottom: 12 }}>Live Transaction Stream</div>
      {alerts.slice(0, 10).map((a) => (
        <div key={a.id ?? `${a.transactionId}-${a.ruleTriggered}`} style={{ padding: "8px 0", borderBottom: "1px solid #132033" }}>
          TXN {a.transactionId} | {a.transactionType || "TRANSFER"} | {a.ruleTriggered || "Rule N/A"} | Risk {Number(a.riskScore || 0).toFixed(3)}
        </div>
      ))}
    </div>
  );
}
