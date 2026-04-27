import { useEffect, useMemo, useState } from "react";
import { getTransactions } from "../services/alertService";
import type { TransactionRecord } from "../services/alertService";
import TransactionDetailPanel from "../components/TransactionDetailPanel";
import { formatCurrency, maskAccount } from "../utils/security";
import { downloadExcel, downloadPdf } from "../utils/export";
import { useAppSettings } from "../context/AppSettingsContext";
import { getDefaultTablePageSize, shouldMaskSensitiveData } from "../settings/appSettings";

type Filters = {
  transactionId: string;
  amount: string;
  transactionType: string;
  accountIdentifier: string;
  fraudType: string;
  riskScore: string;
  priority: string;
  status: string;
  decisionOutcome: string;
  caseStatus: string;
  assignee: string;
  dateFrom: string;
  dateTo: string;
};

const emptyFilters: Filters = {
  transactionId: "",
  amount: "",
  transactionType: "",
  accountIdentifier: "",
  fraudType: "",
  riskScore: "",
  priority: "",
  status: "",
  decisionOutcome: "",
  caseStatus: "",
  assignee: "",
  dateFrom: "",
  dateTo: ""
};

export default function Transactions({ syncKey }: { syncKey?: string }) {
  const { settings } = useAppSettings();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [selected, setSelected] = useState<TransactionRecord | null>(null);

  useEffect(() => {
    const load = async () => {
      setTransactions(await getTransactions());
    };
    void load();
  }, [syncKey]);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const transactionTime = tx.transactionTime ? new Date(tx.transactionTime) : null;
      const fromDate = applied.dateFrom ? new Date(`${applied.dateFrom}T00:00:00`) : null;
      const toDate = applied.dateTo ? new Date(`${applied.dateTo}T23:59:59`) : null;
      const accountText = `${tx.senderAccountNumber || ""} ${tx.receiverAccountNumber || ""}`.toLowerCase();
      const fraudTypeText = `${tx.ruleTriggered || ""} ${tx.riskLevel || ""}`.toLowerCase();
      const assigneeText = `${tx.assignedToName || ""}`.toLowerCase();

      const matchesDateFrom = !fromDate || (transactionTime != null && transactionTime >= fromDate);
      const matchesDateTo = !toDate || (transactionTime != null && transactionTime <= toDate);
      const matchesTransactionId = !applied.transactionId || String(tx.transactionId || "").toLowerCase().includes(applied.transactionId.toLowerCase());
      const matchesAmount = !applied.amount || Number(tx.amount || 0) >= Number(applied.amount);
      const matchesType = !applied.transactionType || (tx.transactionType || "").toLowerCase().includes(applied.transactionType.toLowerCase());
      const matchesAccount = !applied.accountIdentifier || accountText.includes(applied.accountIdentifier.toLowerCase());
      const matchesFraudType = !applied.fraudType || fraudTypeText.includes(applied.fraudType.toLowerCase());
      const matchesRiskScore = !applied.riskScore || Number(tx.riskScore || 0) >= Number(applied.riskScore);
      const matchesPriority = !applied.priority || (tx.priority || "").toLowerCase().includes(applied.priority.toLowerCase());
      const matchesStatus = !applied.status || normalizeStatus(tx) === applied.status;
      const matchesDecision = !applied.decisionOutcome || (tx.decisionOutcome || "").toUpperCase().includes(applied.decisionOutcome.toUpperCase());
      const matchesCaseStatus = !applied.caseStatus || (tx.caseStatus || "").toUpperCase().includes(applied.caseStatus.toUpperCase());
      const matchesAssignee = !applied.assignee || assigneeText.includes(applied.assignee.toLowerCase());

      return [
        matchesDateFrom,
        matchesDateTo,
        matchesTransactionId,
        matchesAmount,
        matchesType,
        matchesAccount,
        matchesFraudType,
        matchesRiskScore,
        matchesPriority,
        matchesStatus,
        matchesDecision,
        matchesCaseStatus,
        matchesAssignee
      ].every(Boolean);
    });
  }, [transactions, applied]);

  const pageSize = getDefaultTablePageSize(settings);
  const visible = filtered.slice(0, pageSize);
  const maskSensitiveData = shouldMaskSensitiveData(settings);

  return (
    <div className="section">
      <h2 style={{ marginTop: 0 }}>Transactions Monitor</h2>
      <p className="muted">Real-time and historical review with date, amount, account, status, and fraud-type filtering.</p>

      <div className="filter-grid">
        <input placeholder="Transaction ID" value={filters.transactionId} onChange={(e) => setFilters((prev) => ({ ...prev, transactionId: e.target.value }))} style={inputStyle} />
        <input placeholder="Amount >=" value={filters.amount} onChange={(e) => setFilters((prev) => ({ ...prev, amount: e.target.value }))} style={inputStyle} />
        <input placeholder="Transaction Type" value={filters.transactionType} onChange={(e) => setFilters((prev) => ({ ...prev, transactionType: e.target.value }))} style={inputStyle} />
        <input placeholder="User / Account Identifier" value={filters.accountIdentifier} onChange={(e) => setFilters((prev) => ({ ...prev, accountIdentifier: e.target.value }))} style={inputStyle} />
        <input placeholder="Fraud Type / Rule" value={filters.fraudType} onChange={(e) => setFilters((prev) => ({ ...prev, fraudType: e.target.value }))} style={inputStyle} />
        <input placeholder="Risk Score >=" value={filters.riskScore} onChange={(e) => setFilters((prev) => ({ ...prev, riskScore: e.target.value }))} style={inputStyle} />
        <input placeholder="Priority" value={filters.priority} onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))} style={inputStyle} />
        <select value={filters.decisionOutcome} onChange={(e) => setFilters((prev) => ({ ...prev, decisionOutcome: e.target.value }))} style={inputStyle}>
          <option value="">All Decisions</option>
          <option value="APPROVED">Approved</option>
          <option value="REVIEW">Review</option>
          <option value="BLOCKED">Blocked</option>
        </select>
        <select value={filters.caseStatus} onChange={(e) => setFilters((prev) => ({ ...prev, caseStatus: e.target.value }))} style={inputStyle}>
          <option value="">All Case Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="ESCALATED">Escalated</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <input placeholder="Assigned Analyst" value={filters.assignee} onChange={(e) => setFilters((prev) => ({ ...prev, assignee: e.target.value }))} style={inputStyle} />
        <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))} style={inputStyle} />
        <input type="date" value={filters.dateTo} onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))} style={inputStyle} />
        <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} style={inputStyle}>
          <option value="">All Statuses</option>
          <option value="APPROVED">Approved</option>
          <option value="PENDING">Pending</option>
          <option value="BLOCKED">Blocked</option>
        </select>
        <div className="action-row">
          <button className="btn-accent" onClick={() => setApplied(filters)}>Apply</button>
          <button className="pill" onClick={() => { setFilters(emptyFilters); setApplied(emptyFilters); }}>Clear</button>
        </div>
      </div>

      <div className="cards-inline" style={{ marginTop: 16 }}>
        <span className="chip approved">Visible Results: {filtered.length}</span>
        <span className="chip medium">Showing {visible.length} of {filtered.length}</span>
        <span className="chip low">Page Size: {pageSize}</span>
        <span className="chip medium">{maskSensitiveData ? "Sensitive fields masked" : "Sensitive fields visible"}</span>
      </div>

      <div className="table-heading" style={{ marginTop: 16 }}>
        <div className="muted">Total Transactions: {filtered.length}</div>
        <div className="table-heading-right">
          <button className="pill" onClick={() => downloadPdf("transactions", transactionHeaders, exportRows(filtered))}>Download PDF</button>
          <button className="pill" onClick={() => downloadExcel("transactions", transactionHeaders, exportRows(filtered))}>Download Excel</button>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Amount</th>
              <th>Transaction Type</th>
              <th>Account</th>
              <th>Location</th>
              <th>Fraud Type</th>
              <th>Risk Score</th>
              <th>Priority</th>
              <th>Decision</th>
              <th>Case</th>
              <th>Assigned To</th>
              <th>Status</th>
              <th>View</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t.transactionId}>
                <td>{t.transactionId}</td>
                <td>{formatCurrency(t.amount)}</td>
                <td>{t.transactionType || "TRANSFER"}</td>
                <td>{maskSensitiveData ? maskAccount(t.senderAccountNumber) : t.senderAccountNumber}</td>
                <td>{t.location || "-"}</td>
                <td>{t.ruleTriggered || t.riskLevel || "-"}</td>
                <td>{t.riskScore != null ? Number(t.riskScore).toFixed(3) : "-"}</td>
                <td><span className={`chip ${priorityClass(t.priority)}`}>{t.priority || "-"}</span></td>
                <td><span className={`chip ${statusClass((t.decisionOutcome || normalizeStatus(t)).toUpperCase())}`}>{t.decisionOutcome || normalizeStatus(t)}</span></td>
                <td>{t.caseStatus || "-"}</td>
                <td>{t.assignedToName || "-"}</td>
                <td><span className={`chip ${statusClass(normalizeStatus(t))}`}>{normalizeStatus(t)}</span></td>
                <td>
                  <button className="btn-accent" style={{ boxShadow: "none", padding: "8px 12px" }} onClick={() => setSelected(t)}>
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

function normalizeStatus(tx: TransactionRecord) {
  const status = (tx.status || "").toUpperCase();
  if (status.includes("PENDING")) return "PENDING";
  if (status.includes("FAILED") || status.includes("BLOCK")) return "BLOCKED";
  if (tx.fraudDetected) return "BLOCKED";
  return "APPROVED";
}

function priorityClass(priority?: string) {
  const value = (priority || "").toUpperCase();
  if (value.includes("CRITICAL") || value.includes("HIGH")) return "high";
  if (value.includes("MEDIUM")) return "medium";
  return "low";
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
  minWidth: 170
};

const transactionHeaders = [
  "Transaction ID",
  "Amount",
  "Transaction Type",
  "Account",
  "Location",
  "Fraud Type",
  "Risk Score",
  "Priority",
  "Decision",
  "Case Status",
  "Assigned To",
  "Status",
  "Transaction Time"
];

function exportRows(rows: TransactionRecord[]) {
  return rows.map((t) => ([
    t.transactionId,
    formatCurrency(t.amount),
    t.transactionType || "TRANSFER",
    maskAccount(t.senderAccountNumber),
    t.location || "-",
    t.ruleTriggered || t.riskLevel || "-",
    t.riskScore != null ? Number(t.riskScore).toFixed(3) : "-",
    t.priority || "-",
    t.decisionOutcome || normalizeStatus(t),
    t.caseStatus || "-",
    t.assignedToName || "-",
    normalizeStatus(t),
    t.transactionTime ? new Date(t.transactionTime).toLocaleString() : "-"
  ]));
}
