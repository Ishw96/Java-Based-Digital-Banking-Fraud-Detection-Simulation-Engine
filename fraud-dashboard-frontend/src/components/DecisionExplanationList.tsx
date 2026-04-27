import type { DecisionExplanationItem } from "../services/alertService";

type Props = {
  items?: DecisionExplanationItem[] | null;
  summaries?: string[] | null;
  emptyText: string;
  labelPrefix?: string;
};

export default function DecisionExplanationList({
  items,
  summaries,
  emptyText,
  labelPrefix = "Signal"
}: Props) {
  const structured = (items || []).filter((item) => item && (item.title || item.detail || item.code));

  if (structured.length) {
    return (
      <div className="detail-activity-list">
        {structured.map((item, index) => {
          const key = `${item.code || "EXPLANATION"}-${index}`;
          return (
            <div key={key} className="detail-activity-item">
              <div style={{ width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <strong>{item.title || item.code || `${labelPrefix} ${index + 1}`}</strong>
                  <div className="cards-inline" style={{ gap: 8 }}>
                    {item.category ? <span className={`chip ${chipTone(item.severity)}`}>{formatChipLabel(item.category)}</span> : null}
                    {item.source ? <span className="chip">{formatChipLabel(item.source)}</span> : null}
                    {item.severity ? <span className={`chip ${chipTone(item.severity)}`}>{formatChipLabel(item.severity)}</span> : null}
                  </div>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>{item.detail || item.title || item.code}</div>
                {(item.score != null || item.weight != null || item.flagged != null) ? (
                  <div className="muted" style={{ marginTop: 8 }}>
                    {item.score != null ? `Score ${Number(item.score).toFixed(3)}` : null}
                    {item.score != null && item.weight != null ? " | " : null}
                    {item.weight != null ? `Weight ${Number(item.weight).toFixed(2)}` : null}
                    {(item.score != null || item.weight != null) && item.flagged != null ? " | " : null}
                    {item.flagged != null ? (item.flagged ? "Flagged signal" : "Informational signal") : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (summaries?.length) {
    return (
      <div className="detail-activity-list">
        {summaries.map((item, index) => (
          <div key={`${labelPrefix}-${index}`} className="detail-activity-item">
            <div>
              <strong>{labelPrefix} {index + 1}</strong>
              <div className="muted">{item}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <div className="muted">{emptyText}</div>;
}

function formatChipLabel(value: string) {
  return value.replace(/_/g, " ");
}

function chipTone(value?: string | null) {
  const normalized = String(value || "").toUpperCase();
  if (normalized.includes("CRITICAL") || normalized.includes("HIGH")) return "high";
  if (normalized.includes("WARN") || normalized.includes("MEDIUM")) return "medium";
  if (normalized.includes("INFO")) return "approved";
  return "";
}
