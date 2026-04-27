import { useEffect, useMemo, useState } from "react";
import {
  addAlertCaseNote,
  assignAlertCase,
  getActiveAlerts,
  getAlertDetail,
  getAlertTimeline,
  getReadAlerts,
  getUnreadCount,
  getUsers,
  markAlertRead,
  markAlertUnread,
  updateAlertCaseStatus
} from "../services/alertService";
import type { AlertLifecycle, AlertTimelineEntry, UserRecord } from "../services/alertService";
import { downloadExcel, downloadPdf } from "../utils/export";
import { useAppSettings } from "../context/AppSettingsContext";
import { getNotificationPolicy } from "../settings/appSettings";
import DecisionExplanationList from "../components/DecisionExplanationList";
import { buildCaseStatusOptions, formatTimelineActor } from "../utils/caseWorkflow";

type RiskFilter = "ALL" | "CRITICAL" | "HIGH" | "MEDIUM";

const allowedRiskLevels = ["CRITICAL", "HIGH", "MEDIUM"];

export default function Alerts({ syncKey }: { syncKey?: string }) {
  const { settings } = useAppSettings();
  const notificationPolicy = getNotificationPolicy(settings);
  const [activeAlerts, setActiveAlerts] = useState<AlertLifecycle[]>([]);
  const [readAlerts, setReadAlerts] = useState<AlertLifecycle[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const [activeFilter, setActiveFilter] = useState<RiskFilter>("ALL");
  const [readFilter, setReadFilter] = useState<RiskFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<AlertLifecycle | null>(null);
  const [timeline, setTimeline] = useState<AlertTimelineEntry[]>([]);
  const [assignEmail, setAssignEmail] = useState("");
  const [statusDraft, setStatusDraft] = useState("OPEN");
  const [statusDetail, setStatusDetail] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  const load = async () => {
    const [active, read, unread, userList] = await Promise.all([
      getActiveAlerts(),
      getReadAlerts(),
      getUnreadCount(),
      getUsers()
    ]);
    setActiveAlerts(active.filter((item) => isAllowedRisk(item)));
    setReadAlerts(read.filter((item) => isAllowedRisk(item)));
    setUnreadCount(unread);
    setUsers(userList.filter((item) => item.active));
  };

  const loadSelected = async (transactionId: string) => {
    setPanelBusy(true);
    try {
      const [detail, items] = await Promise.all([
        getAlertDetail(transactionId),
        getAlertTimeline(transactionId)
      ]);
      setSelectedAlert(detail);
      setTimeline(items);
      setAssignEmail(detail.assignedToEmail || "");
      setStatusDraft(detail.caseStatus || "OPEN");
      setStatusDetail("");
    } finally {
      setPanelBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, [syncKey]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedAlert(null);
      setTimeline([]);
      return;
    }
    void loadSelected(selectedId);
  }, [selectedId]);

  const selectedAlertStatusOptions = useMemo(
    () => buildCaseStatusOptions(selectedAlert?.caseStatus, selectedAlert?.allowedCaseTransitions),
    [selectedAlert?.caseStatus, selectedAlert?.allowedCaseTransitions]
  );

  useEffect(() => {
    if (!selectedAlertStatusOptions.length) return;
    if (!selectedAlertStatusOptions.includes(statusDraft)) {
      setStatusDraft(selectedAlertStatusOptions[0]);
    }
  }, [selectedAlertStatusOptions, statusDraft]);

  const totals = useMemo(() => {
    const critical = activeAlerts.filter((item) => isCritical(item)).length;
    const high = activeAlerts.filter((item) => isHigh(item)).length;
    const medium = activeAlerts.filter((item) => isMedium(item)).length;
    return { critical, high, medium };
  }, [activeAlerts]);

  const displayActiveAlerts = useMemo(
    () => sortAlerts(activeAlerts, notificationPolicy.groupAlertsByRule),
    [activeAlerts, notificationPolicy.groupAlertsByRule]
  );

  const displayReadAlerts = useMemo(
    () => sortAlerts(readAlerts, notificationPolicy.groupAlertsByRule),
    [readAlerts, notificationPolicy.groupAlertsByRule]
  );

  const filteredActive = useMemo(
    () => displayActiveAlerts.filter((item) => matchesFilter(item, activeFilter)),
    [displayActiveAlerts, activeFilter]
  );

  const filteredRead = useMemo(
    () => displayReadAlerts.filter((item) => matchesFilter(item, readFilter)),
    [displayReadAlerts, readFilter]
  );

  const refreshAndKeepSelection = async (transactionId?: string | null) => {
    await load();
    if (transactionId) {
      await loadSelected(transactionId);
    }
    window.dispatchEvent(new Event("fraud:sync"));
  };

  const toggleRead = async (item: AlertLifecycle, asRead: boolean) => {
    setLoadingId(item.transactionId || null);
    try {
      if (asRead) {
        await markAlertRead(item.transactionId || "");
      } else {
        await markAlertUnread(item.transactionId || "");
      }
      await refreshAndKeepSelection(selectedId);
    } finally {
      setLoadingId(null);
    }
  };

  const assignSelected = async () => {
    if (!selectedAlert?.transactionId || !assignEmail) return;
    setPanelBusy(true);
    try {
      const assignee = users.find((item) => item.email === assignEmail);
      await assignAlertCase(selectedAlert.transactionId, {
        assignedToEmail: assignEmail,
        assignedToName: assignee?.userName
      });
      await refreshAndKeepSelection(selectedAlert.transactionId);
    } finally {
      setPanelBusy(false);
    }
  };

  const updateStatus = async () => {
    if (!selectedAlert?.transactionId) return;
    setPanelBusy(true);
    try {
      await updateAlertCaseStatus(selectedAlert.transactionId, {
        caseStatus: statusDraft,
        detail: statusDetail || undefined
      });
      setStatusDetail("");
      await refreshAndKeepSelection(selectedAlert.transactionId);
    } finally {
      setPanelBusy(false);
    }
  };

  const saveNote = async () => {
    if (!selectedAlert?.transactionId || !noteDraft.trim()) return;
    setPanelBusy(true);
    try {
      await addAlertCaseNote(selectedAlert.transactionId, noteDraft.trim());
      setNoteDraft("");
      await refreshAndKeepSelection(selectedAlert.transactionId);
    } finally {
      setPanelBusy(false);
    }
  };

  const exportRows = (rows: AlertLifecycle[]) => rows.map((item) => ([
    item.transactionId || "-",
    item.transactionType || "TRANSFER",
    item.location || "-",
    item.ruleTriggered || "-",
    formatScore(item.riskScore),
    item.priority || item.riskLevel || "-",
    item.caseStatus || "-",
    item.assignedToName || "-",
    item.readTimestamp ? new Date(item.readTimestamp).toLocaleString() : "-"
  ]));

  return (
    <div className="section">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0 }}>Real-Time Alerts</h2>
          <p className="muted">Only CRITICAL_RISK, HIGH_RISK, and MEDIUM_RISK alerts are shown in the analyst workflow.</p>
        </div>
        <div className="cards-inline">
          <span className="chip blocked">Unread: {unreadCount}</span>
          <span className="chip high">Critical: {totals.critical}</span>
          <span className="chip medium">High: {totals.high}</span>
          <span className="chip low">Medium: {totals.medium}</span>
          <span className={`chip ${notificationPolicy.highlightCriticalAlerts ? "high" : "approved"}`}>
            Critical highlights: {notificationPolicy.highlightCriticalAlerts ? "On" : "Off"}
          </span>
        </div>
      </div>

      <div className="section" style={{ marginTop: 16, background: "#0f1a2b" }}>
        <div className="table-heading">
          <div>
            <h3 style={{ margin: 0 }}>Real-Time Alerts</h3>
            <p className="muted" style={{ margin: "6px 0 0" }}>Transactions are sorted by risk and update in real time.</p>
          </div>
          <div className="table-heading-right">
            <span className="chip approved">Transactions: {filteredActive.length}</span>
            <div className="risk-tabs">
              {(["ALL", "CRITICAL", "HIGH", "MEDIUM"] as RiskFilter[]).map((filter) => (
                <button key={filter} className={`risk-tab${activeFilter === filter ? " active" : ""}`} onClick={() => setActiveFilter(filter)}>
                  {filter === "ALL" ? "All" : filter === "HIGH" ? "High Risk" : filter === "MEDIUM" ? "Medium Risk" : "Critical"}
                </button>
              ))}
            </div>
            <button className="pill" onClick={() => downloadPdf("real-time-alerts", activeHeaders, exportRows(filteredActive))}>Download PDF</button>
            <button className="pill" onClick={() => downloadExcel("real-time-alerts", activeHeaders, exportRows(filteredActive))}>Download Excel</button>
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Transaction</th>
                <th>Location</th>
                <th>Rule</th>
                <th>Risk Score</th>
                <th>Priority</th>
                <th>Case</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredActive.map((item) => (
                <tr
                  key={item.transactionId}
                  className={notificationPolicy.highlightCriticalAlerts && isCritical(item) ? "alert-row alert-row-critical" : ""}
                >
                  <td>{item.transactionId}</td>
                  <td>{item.transactionType || "TRANSFER"}</td>
                  <td>{item.location || "-"}</td>
                  <td>{item.ruleTriggered || "-"}</td>
                  <td>{formatScore(item.riskScore)}</td>
                  <td><span className={`chip ${priorityClass(item.priority || item.riskLevel)}`}>{item.priority || item.riskLevel || "-"}</span></td>
                  <td>
                    <div className="muted">{item.caseStatus || "OPEN"}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{item.assignedToName || "Unassigned"}</div>
                  </td>
                  <td>
                    <div className="action-row" style={{ justifyContent: "flex-start" }}>
                      <button className="btn-accent" onClick={() => setSelectedId(item.transactionId || "")}>View Case</button>
                      <button className="pill" onClick={() => toggleRead(item, true)} disabled={loadingId === item.transactionId}>
                        Mark As Read
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredActive.length ? (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: "center" }}>No unread alerts in the active queue.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section" style={{ marginTop: 16, background: "#0f1a2b" }}>
        <div className="table-heading">
          <div>
            <h3 style={{ margin: 0 }}>Read Alerts By Analyst</h3>
            <p className="muted" style={{ margin: "6px 0 0" }}>Read alerts stay available for audit and accidental reversal.</p>
          </div>
          <div className="table-heading-right">
            <span className="chip approved">Transactions: {filteredRead.length}</span>
            <div className="risk-tabs">
              {(["ALL", "CRITICAL", "HIGH", "MEDIUM"] as RiskFilter[]).map((filter) => (
                <button key={filter} className={`risk-tab${readFilter === filter ? " active" : ""}`} onClick={() => setReadFilter(filter)}>
                  {filter === "ALL" ? "All" : filter === "HIGH" ? "High Risk" : filter === "MEDIUM" ? "Medium Risk" : "Critical"}
                </button>
              ))}
            </div>
            <button className="pill" onClick={() => downloadPdf("read-alerts", readHeaders, exportRows(filteredRead))}>Download PDF</button>
            <button className="pill" onClick={() => downloadExcel("read-alerts", readHeaders, exportRows(filteredRead))}>Download Excel</button>
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Transaction</th>
                <th>Location</th>
                <th>Rule</th>
                <th>Risk Score</th>
                <th>Priority</th>
                <th>Read By</th>
                <th>Read At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRead.map((item) => (
                <tr key={`${item.transactionId}-${item.readTimestamp || item.evaluatedAt}`} className={notificationPolicy.highlightCriticalAlerts && isCritical(item) ? "alert-row alert-row-critical" : ""}>
                  <td>{item.transactionId}</td>
                  <td>{item.transactionType || "TRANSFER"}</td>
                  <td>{item.location || "-"}</td>
                  <td>{item.ruleTriggered || "-"}</td>
                  <td>{formatScore(item.riskScore)}</td>
                  <td><span className={`chip ${priorityClass(item.priority || item.riskLevel)}`}>{item.priority || item.riskLevel || "-"}</span></td>
                  <td>{item.userName || "-"}</td>
                  <td>{item.readTimestamp ? new Date(item.readTimestamp).toLocaleString() : "-"}</td>
                  <td>
                    <div className="action-row" style={{ justifyContent: "flex-start" }}>
                      <button className="btn-accent" onClick={() => setSelectedId(item.transactionId || "")}>View Case</button>
                      <button className="pill" onClick={() => toggleRead(item, false)} disabled={loadingId === item.transactionId}>
                        Mark As Unread
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredRead.length ? (
                <tr>
                  <td colSpan={9} className="muted" style={{ textAlign: "center" }}>No read alerts yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {selectedAlert ? (
        <div className="section transaction-detail-panel" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0 }}>Alert Case Workspace</h3>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Assignment, investigation status, analyst notes, and decision reasoning for {selectedAlert.transactionId}.
              </p>
            </div>
            <div className="cards-inline">
              <span className={`chip ${priorityClass(selectedAlert.priority || selectedAlert.riskLevel)}`}>{selectedAlert.priority || selectedAlert.riskLevel || "-"}</span>
              <span className="chip approved">{selectedAlert.decisionOutcome || "REVIEW"}</span>
              <span className="chip medium">{selectedAlert.caseStatus || "OPEN"}</span>
              <button className="pill" onClick={() => setSelectedId(null)}>Close Case View</button>
            </div>
          </div>

          <div className="detail-grid" style={{ marginTop: 16 }}>
            <div className="mini-panel">
              <div className="detail-title">Case Summary</div>
              <div className="detail-list">
                <DetailRow label="Transaction ID" value={selectedAlert.transactionId || "-"} />
                <DetailRow label="Risk Score" value={formatScore(selectedAlert.riskScore)} />
                <DetailRow label="Decision Outcome" value={selectedAlert.decisionOutcome || "REVIEW"} />
                <DetailRow label="Case Status" value={selectedAlert.caseStatus || "OPEN"} />
                <DetailRow label="Assigned To" value={selectedAlert.assignedToName || selectedAlert.assignedToEmail || "Unassigned"} />
                <DetailRow label="Read State" value={selectedAlert.actionType || "UNREAD"} />
              </div>
            </div>

            <div className="mini-panel">
              <div className="detail-title">Decision Explanation</div>
              <DecisionExplanationList
                items={selectedAlert.decisionExplanationItems}
                summaries={selectedAlert.decisionExplanations}
                emptyText="No explanation stored yet for this alert."
                labelPrefix="Reason"
              />
            </div>
          </div>

          <div className="detail-grid" style={{ marginTop: 16 }}>
            <div className="mini-panel">
              <div className="detail-title">Case Actions</div>
              <div className="detail-list">
                <label className="muted">Assign Analyst</label>
                <select value={assignEmail} onChange={(e) => setAssignEmail(e.target.value)} className="settings-select" style={{ marginBottom: 12 }}>
                  <option value="">Select assignee</option>
                  {users.map((user) => (
                    <option key={user.email} value={user.email}>
                      {user.userName} ({user.role})
                    </option>
                  ))}
                </select>
                <button
                  className="btn-accent"
                  onClick={() => void assignSelected()}
                  disabled={panelBusy || !assignEmail || assignEmail === (selectedAlert.assignedToEmail || "")}
                >
                  Save Assignment
                </button>

                <label className="muted" style={{ marginTop: 16 }}>Update Case Status</label>
                <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)} className="settings-select" style={{ marginBottom: 12 }}>
                  {selectedAlertStatusOptions.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <textarea
                  className="settings-textarea"
                  value={statusDetail}
                  onChange={(e) => setStatusDetail(e.target.value)}
                  placeholder="Add a short reason for the status update"
                />
                <button
                  className="pill"
                  style={{ marginTop: 12 }}
                  onClick={() => void updateStatus()}
                  disabled={panelBusy || !selectedAlert || statusDraft === (selectedAlert.caseStatus || "OPEN")}
                >
                  Save Status
                </button>
                {selectedAlert?.allowedCaseTransitions?.length === 0 ? (
                  <div className="muted" style={{ marginTop: 10 }}>This case has no further workflow transitions available.</div>
                ) : null}
              </div>
            </div>

            <div className="mini-panel">
              <div className="detail-title">Analyst Notes</div>
              <textarea
                className="settings-textarea"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Capture investigation notes, next steps, or resolution comments"
              />
              <button className="btn-accent" style={{ marginTop: 12 }} onClick={() => void saveNote()} disabled={panelBusy || !noteDraft.trim()}>
                Save Note
              </button>
              {selectedAlert.latestCaseNote ? (
                <div style={{ marginTop: 16 }}>
                  <div className="detail-title" style={{ fontSize: 12, marginBottom: 8 }}>Latest Note</div>
                  <div className="muted">{selectedAlert.latestCaseNote}</div>
                </div>
              ) : (
                <div className="muted" style={{ marginTop: 16 }}>No notes recorded yet.</div>
              )}
            </div>
          </div>

          <div className="mini-panel" style={{ marginTop: 16 }}>
            <div className="detail-title">Case Timeline</div>
            <div className="detail-activity-list">
              {timeline.length ? timeline.map((item) => (
                <div key={`${item.auditId}-${item.happenedAt}`} className="detail-activity-item">
                  <div>
                    <strong>{item.actionType}</strong>
                    <div className="muted">{item.detail || "Case activity recorded."}</div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      {formatTimelineActor(item)}{item.assignedToName ? ` -> ${item.assignedToName}` : ""}
                      {item.caseStatus ? ` | ${item.caseStatus}` : ""}
                    </div>
                    {item.bulkOperationId ? <div className="muted">Bulk operation: {item.bulkOperationId}</div> : null}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div>{item.happenedAt ? new Date(item.happenedAt).toLocaleString() : "-"}</div>
                    {item.readTimestamp ? <div className="muted">Read at {new Date(item.readTimestamp).toLocaleString()}</div> : null}
                  </div>
                </div>
              )) : (
                <div className="muted">No case activity captured yet.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const activeHeaders = ["Transaction ID", "Transaction", "Location", "Rule", "Risk Score", "Priority", "Case Status", "Assigned To", "Read At"];
const readHeaders = ["Transaction ID", "Transaction", "Location", "Rule", "Risk Score", "Priority", "Case Status", "Assigned To", "Read At"];

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function matchesFilter(item: AlertLifecycle, filter: RiskFilter) {
  if (filter === "ALL") return true;
  if (filter === "CRITICAL") return isCritical(item);
  if (filter === "HIGH") return isHigh(item);
  return isMedium(item);
}

function isAllowedRisk(item: AlertLifecycle) {
  const level = (item.priority || item.riskLevel || "").toUpperCase();
  return allowedRiskLevels.some((risk) => level.includes(risk));
}

function isCritical(item: AlertLifecycle) {
  return (item.priority || item.riskLevel || "").toUpperCase().includes("CRITICAL");
}

function isHigh(item: AlertLifecycle) {
  return (item.priority || item.riskLevel || "").toUpperCase().includes("HIGH");
}

function isMedium(item: AlertLifecycle) {
  return (item.priority || item.riskLevel || "").toUpperCase().includes("MEDIUM");
}

function formatScore(score?: number) {
  return score != null ? Number(score).toFixed(3) : "-";
}

function priorityClass(priority?: string | null) {
  const value = (priority || "").toUpperCase();
  if (value.includes("CRITICAL") || value.includes("HIGH")) return "high";
  if (value.includes("MEDIUM")) return "medium";
  return "low";
}

function sortAlerts(items: AlertLifecycle[], groupByRule: boolean) {
  if (!groupByRule) return items;
  return [...items].sort((left, right) => {
    const ruleCompare = (left.ruleTriggered || "").localeCompare(right.ruleTriggered || "");
    if (ruleCompare !== 0) return ruleCompare;
    return (right.riskScore || 0) - (left.riskScore || 0);
  });
}
