import { useEffect, useMemo, useState } from "react";
import { getTransactions, getTransactionById } from "../services/alertService";
import type { TransactionRecord } from "../services/alertService";
import TransactionDetailPanel from "../components/TransactionDetailPanel";
import { formatCurrency, maskAccount } from "../utils/security";
import { downloadExcel, downloadPdf } from "../utils/export";
import { useAppSettings } from "../context/AppSettingsContext";
import { getDefaultTablePageSize, shouldMaskSensitiveData } from "../settings/appSettings";

type Filters = {
  search: string;
  risk: string;
  status: string;
  caseStatus: string;
  assignee: string;
};

export default function History({ syncKey }: { syncKey?: string }) {
  const { settings } = useAppSettings();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [filters, setFilters] = useState<Filters>({ search: "", risk: "ALL", status: "ALL", caseStatus: "ALL", assignee: "" });
  const [applied, setApplied] = useState<Filters>(filters);
  const [selected, setSelected] = useState<TransactionRecord | null>(null);

  useEffect(() => {
    const load = async () => {
      setTransactions(await getTransactions());
    };
    void load();
  }, [syncKey]);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const statusLabel = mapStatus(tx);
      const riskLabel = mapRisk(tx);
      const searchText = `${tx.transactionId} ${tx.transactionType} ${tx.ruleTriggered} ${tx.location} ${tx.senderAccountNumber} ${tx.assignedToName || ""}`.toLowerCase();
      const searchMatch = !applied.search || searchText.includes(applied.search.toLowerCase());
      const riskMatch = applied.risk === "ALL" || riskLabel === applied.risk;
      const statusMatch = applied.status === "ALL" || statusLabel === applied.status;
      const caseMatch = applied.caseStatus === "ALL" || (tx.caseStatus || "OPEN") === applied.caseStatus;
      const assigneeMatch = !applied.assignee || (tx.assignedToName || "").toLowerCase().includes(applied.assignee.toLowerCase());
      return searchMatch && riskMatch && statusMatch && caseMatch && assigneeMatch;
    });
  }, [transactions, applied]);

  const pageSize = getDefaultTablePageSize(settings);
  const visible = filtered.slice(0, pageSize);
  const maskSensitiveData = shouldMaskSensitiveData(settings);

  return (
    <div className="section">
      <h2 style={{ marginTop: 0 }}>History</h2>
      <div className="filter-grid">
        <input
          placeholder="Search by Transaction ID, Rule, or Account..."
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          style={inputStyle}
        />
        <select value={filters.risk} onChange={(e) => setFilters((prev) => ({ ...prev, risk: e.target.value }))} style={inputStyle}>
          <option value="ALL">All Risk Levels</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} style={inputStyle}>
          <option value="ALL">All Statuses</option>
          <option value="BLOCKED">Blocked</option>
          <option value="APPROVED">Approved</option>
          <option value="PENDING">Pending</option>
        </select>
        <select value={filters.caseStatus} onChange={(e) => setFilters((prev) => ({ ...prev, caseStatus: e.target.value }))} style={inputStyle}>
          <option value="ALL">All Case Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="ESCALATED">Escalated</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <input
          placeholder="Assigned Analyst"
          value={filters.assignee}
          onChange={(e) => setFilters((prev) => ({ ...prev, assignee: e.target.value }))}
          style={inputStyle}
        />
        <div className="action-row">
          <button className="btn-accent" onClick={() => setApplied(filters)}>Apply</button>
          <button
            className="pill"
            onClick={() => {
              const reset = { search: "", risk: "ALL", status: "ALL", caseStatus: "ALL", assignee: "" };
              setFilters(reset);
              setApplied(reset);
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="table-heading" style={{ marginTop: 16 }}>
        <div className="cards-inline">
          <span className="chip approved">Total Transactions: {filtered.length}</span>
          <span className="chip medium">Showing {visible.length} of {filtered.length}</span>
          <span className="chip low">Page Size: {pageSize}</span>
          <span className="chip medium">{maskSensitiveData ? "Sensitive fields masked" : "Sensitive fields visible"}</span>
        </div>
        <div className="table-heading-right">
          <button className="pill" onClick={() => downloadPdf("history-transactions", historyHeaders, exportRows(filtered))}>Download PDF</button>
          <button className="pill" onClick={() => downloadExcel("history-transactions", historyHeaders, exportRows(filtered))}>Download Excel</button>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Amount</th>
              <th>Account</th>
              <th>Location</th>
              <th>Rule</th>
              <th>Risk Score</th>
              <th>Case</th>
              <th>Assigned To</th>
              <th>Status</th>
              <th>Time</th>
              <th>View</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((tx) => (
              <tr key={tx.transactionId}>
                <td>{tx.transactionId}</td>
                <td>{formatCurrency(tx.amount)}</td>
                <td>{maskSensitiveData ? maskAccount(tx.senderAccountNumber) : tx.senderAccountNumber}</td>
                <td>{tx.location || "-"}</td>
                <td>{tx.ruleTriggered || "-"}</td>
                <td>{tx.riskScore != null ? Number(tx.riskScore).toFixed(3) : "-"}</td>
                <td>{tx.caseStatus || "-"}</td>
                <td>{tx.assignedToName || "-"}</td>
                <td><span className={`chip ${statusClass(mapStatus(tx))}`}>{mapStatus(tx)}</span></td>
                <td>{tx.transactionTime ? new Date(tx.transactionTime).toLocaleString() : "-"}</td>
                <td>
                  <button className="btn-accent" style={{ boxShadow: "none", padding: "8px 12px" }} onClick={async () => setSelected(await getTransactionById(tx.transactionId))}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? <TransactionDetailPanel transaction={selected} allTransactions={transactions} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function mapStatus(tx: TransactionRecord) {
  const fraud = (tx.fraudDetected ? "BLOCKED" : "").toUpperCase();
  if (fraud) return fraud;
  const status = (tx.status || "").toUpperCase();
  if (status.includes("PENDING")) return "PENDING";
  if (status.includes("FAILED")) return "BLOCKED";
  return "APPROVED";
}

function mapRisk(tx: TransactionRecord) {
  const risk = (tx.riskLevel || tx.priority || "").toUpperCase();
  if (risk.includes("CRITICAL")) return "CRITICAL";
  if (risk.includes("HIGH")) return "HIGH";
  if (risk.includes("MEDIUM")) return "MEDIUM";
  return "LOW";
}

function statusClass(status: string) {
  if (status === "BLOCKED") return "blocked";
  if (status === "APPROVED") return "approved";
  return "pending";
}

const inputStyle: React.CSSProperties = {
  background: "#0f1a2b",
  color: "#e8eefc",
  border: "1px solid #1f2a44",
  borderRadius: 10,
  padding: "12px 14px",
  minWidth: 180
};

const historyHeaders = ["Transaction ID", "Amount", "Account", "Location", "Rule", "Risk Score", "Case Status", "Assigned To", "Status", "Time"];

function exportRows(rows: TransactionRecord[]) {
  return rows.map((tx) => ([
    tx.transactionId,
    formatCurrency(tx.amount),
    maskAccount(tx.senderAccountNumber),
    tx.location || "-",
    tx.ruleTriggered || "-",
    tx.riskScore != null ? Number(tx.riskScore).toFixed(3) : "-",
    tx.caseStatus || "-",
    tx.assignedToName || "-",
    mapStatus(tx),
    tx.transactionTime ? new Date(tx.transactionTime).toLocaleString() : "-"
  ]));
}
