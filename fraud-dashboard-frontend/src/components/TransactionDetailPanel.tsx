import type { TransactionRecord } from "../services/alertService";
import { formatCurrency, maskAccount } from "../utils/security";
import DecisionExplanationList from "./DecisionExplanationList";

type Props = {
  transaction: TransactionRecord;
  allTransactions: TransactionRecord[];
  onClose?: () => void;
};

export default function TransactionDetailPanel({ transaction, allTransactions, onClose }: Props) {
  const relatedTransactions = allTransactions
    .filter((item) =>
      item.senderAccountNumber === transaction.senderAccountNumber ||
      item.receiverAccountNumber === transaction.senderAccountNumber ||
      item.senderAccountNumber === transaction.receiverAccountNumber
    )
    .sort((left, right) => new Date(right.transactionTime || "").getTime() - new Date(left.transactionTime || "").getTime());

  const historicalVolume = relatedTransactions.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const fraudCount = relatedTransactions.filter((item) => item.fraudDetected).length;
  const recentLocations = Array.from(new Set(relatedTransactions.map((item) => item.location).filter(Boolean))).slice(0, 4);
  const recentTransactions = relatedTransactions.slice(0, 5);

  return (
    <div className="section transaction-detail-panel" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>Transaction Drill-Down</h3>
          <div className="muted" style={{ marginTop: 6 }}>
            Detection trigger, full metadata, and account history profile for {transaction.transactionId}.
          </div>
        </div>
        {onClose ? <button className="pill" onClick={onClose}>Close</button> : null}
      </div>

      <div className="detail-grid">
        <div className="mini-panel">
          <div className="detail-title">Detection Summary</div>
          <div className="detail-list">
            <DetailRow label="Risk Level" value={transaction.riskLevel || transaction.priority || "LOW"} />
            <DetailRow label="Risk Score" value={transaction.riskScore != null ? Number(transaction.riskScore).toFixed(3) : "-"} />
            <DetailRow label="ML Score" value={transaction.mlScore != null ? Number(transaction.mlScore).toFixed(3) : "-"} />
            <DetailRow label="Decision Outcome" value={transaction.decisionOutcome || normalizeStatus(transaction)} />
            <DetailRow label="Case Status" value={transaction.caseStatus || "OPEN"} />
            <DetailRow label="Assigned To" value={transaction.assignedToName || "Unassigned"} />
            <DetailRow label="Fraud Type / Rule" value={transaction.ruleTriggered || "No rule triggered"} />
            <DetailRow label="Current Status" value={normalizeStatus(transaction)} />
          </div>
        </div>

        <div className="mini-panel">
          <div className="detail-title">Transaction Metadata</div>
          <div className="detail-list">
            <DetailRow label="Amount" value={formatCurrency(transaction.amount)} />
            <DetailRow label="Transaction Type" value={transaction.transactionType || "TRANSFER"} />
            <DetailRow label="Merchant" value={transaction.merchant || "-"} />
            <DetailRow label="Location" value={transaction.location || "-"} />
            <DetailRow label="Sender Account" value={maskAccount(transaction.senderAccountNumber)} />
            <DetailRow label="Receiver Account" value={maskAccount(transaction.receiverAccountNumber)} />
            <DetailRow label="Time" value={transaction.transactionTime ? new Date(transaction.transactionTime).toLocaleString() : "-"} />
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="mini-panel">
          <div className="detail-title">Decision Explanation</div>
          <DecisionExplanationList
            items={transaction.decisionExplanationItems}
            summaries={transaction.decisionExplanations}
            emptyText="No decision explanation was stored for this transaction."
          />
          {transaction.latestCaseNote ? (
            <div style={{ marginTop: 12 }}>
              <div className="detail-title" style={{ fontSize: 12, marginBottom: 8 }}>Latest Case Note</div>
              <div className="muted">{transaction.latestCaseNote}</div>
            </div>
          ) : null}
        </div>

        <div className="mini-panel">
          <div className="detail-title">Historical Activity Profile</div>
          <div className="cards-inline" style={{ marginBottom: 12 }}>
            <span className="chip approved">Transactions: {relatedTransactions.length}</span>
            <span className="chip high">Fraud Hits: {fraudCount}</span>
            <span className="chip medium">Volume: {formatCurrency(historicalVolume)}</span>
          </div>
          <div className="detail-list">
            <DetailRow
              label="Activity Pattern"
              value={fraudCount > 0 ? "Previously associated with suspicious activity" : "Mostly normal historical behavior"}
            />
            <DetailRow
              label="Recent Locations"
              value={recentLocations.length ? recentLocations.join(", ") : "No prior locations found"}
            />
            <DetailRow
              label="Average Ticket Size"
              value={relatedTransactions.length ? formatCurrency(historicalVolume / relatedTransactions.length) : "-"}
            />
          </div>
        </div>

        <div className="mini-panel">
          <div className="detail-title">Recent Linked Activity</div>
          <div className="detail-activity-list">
            {recentTransactions.length ? recentTransactions.map((item) => (
              <div key={`${item.transactionId}-${item.transactionTime}`} className="detail-activity-item">
                <div>
                  <strong>{item.transactionId}</strong>
                  <div className="muted">{item.transactionType || "TRANSFER"} - {item.location || "Unknown location"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>{formatCurrency(item.amount)}</div>
                  <div className={`chip ${item.fraudDetected ? "high" : "approved"}`}>{normalizeStatus(item)}</div>
                </div>
              </div>
            )) : <div className="muted">No related account activity found.</div>}
          </div>
        </div>
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

function normalizeStatus(tx: TransactionRecord) {
  const status = (tx.status || "").toUpperCase();
  if (status.includes("PENDING")) return "PENDING";
  if (status.includes("FAILED") || status.includes("BLOCK")) return "BLOCKED";
  if (tx.fraudDetected) return "BLOCKED";
  return "APPROVED";
}
