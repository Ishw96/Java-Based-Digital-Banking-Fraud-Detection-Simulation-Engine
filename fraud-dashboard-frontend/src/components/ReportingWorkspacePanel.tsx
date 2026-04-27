import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  buildNextRunLabel,
  formatDeliveryLifecycle,
  formatDeliveryRangeLabel,
  formatPresetLabel,
  formatRunStatusLabel,
  matchesDeliveryRange,
  type DeliveryLogEntry,
  type ReportRunEntry,
  type ReportingSchedule,
  type ReportTemplate
} from "../utils/reporting";

type ReportingDraft = {
  name: string;
  cadence: string;
  hour: string;
  format: string;
  recipients: string;
  preset: string;
  scope: string;
};

type Props = {
  title: string;
  description: string;
  scheduleDraft: ReportingDraft;
  setScheduleDraft: Dispatch<SetStateAction<ReportingDraft>>;
  scheduleBusy: boolean;
  reportTemplates: ReportTemplate[];
  reportSchedules: ReportingSchedule[];
  reportRunHistory: ReportRunEntry[];
  deliveryEntries: DeliveryLogEntry[];
  deliveryStatusFilter: string;
  setDeliveryStatusFilter: (value: string) => void;
  deliveryRangeFilter: string;
  setDeliveryRangeFilter: (value: string) => void;
  onSaveSchedule: () => void | Promise<void>;
  onApplyTemplate: (template: ReportTemplate) => void;
  onRemoveSchedule: (id: string) => void | Promise<void>;
  onToggleSchedule: (id: string, active: boolean) => void | Promise<void>;
  onRunSchedule: (scheduleId: string, format: string, preset: string) => void | Promise<void>;
  onRetryDelivery: (entryId: number) => void | Promise<void>;
};

export default function ReportingWorkspacePanel({
  title,
  description,
  scheduleDraft,
  setScheduleDraft,
  scheduleBusy,
  reportTemplates,
  reportSchedules,
  reportRunHistory,
  deliveryEntries,
  deliveryStatusFilter,
  setDeliveryStatusFilter,
  deliveryRangeFilter,
  setDeliveryRangeFilter,
  onSaveSchedule,
  onApplyTemplate,
  onRemoveSchedule,
  onToggleSchedule,
  onRunSchedule,
  onRetryDelivery
}: Props) {
  const deliveryLogs = useMemo(() => {
    return deliveryEntries
      .filter((item) => (deliveryStatusFilter === "ALL" ? true : item?.deliveryStatus === deliveryStatusFilter))
      .filter((item) => matchesDeliveryRange(item?.generatedAt, deliveryRangeFilter))
      .slice(0, 10);
  }, [deliveryEntries, deliveryStatusFilter, deliveryRangeFilter]);

  const deliverySummary = useMemo(() => {
    const scoped = deliveryEntries.filter((item) => matchesDeliveryRange(item?.generatedAt, deliveryRangeFilter));
    return {
      total: scoped.length,
      failed: scoped.filter((item) => item?.deliveryStatus === "FAILED").length,
      sent: scoped.filter((item) => item?.deliveryStatus === "SENT").length,
      localExport: scoped.filter((item) => item?.deliveryStatus === "LOCAL_EXPORT").length
    };
  }, [deliveryEntries, deliveryRangeFilter]);

  return (
    <>
      <div className="table-heading" style={{ marginTop: 16 }}>
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <p className="muted" style={{ margin: "6px 0 0" }}>{description}</p>
        </div>
      </div>

      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div className="mini-panel">
          <div className="detail-title">Scheduled Reporting</div>
          <div className="detail-title" style={{ marginTop: 10, fontSize: 13 }}>Role Templates</div>
          <div className="report-template-grid">
            {reportTemplates.map((template) => (
              <button
                key={template.id}
                className="report-template-card"
                type="button"
                onClick={() => onApplyTemplate(template)}
              >
                <strong>{template.name}</strong>
                <span>{template.description}</span>
                <small>{template.cadence} at {template.hour} | {formatPresetLabel(template.preset)}</small>
              </button>
            ))}
          </div>
          <div className="detail-list">
            <label className="muted">Schedule Name</label>
            <input className="settings-select" value={scheduleDraft.name} onChange={(e) => setScheduleDraft((prev) => ({ ...prev, name: e.target.value }))} />
            <label className="muted">Cadence</label>
            <select className="settings-select" value={scheduleDraft.cadence} onChange={(e) => setScheduleDraft((prev) => ({ ...prev, cadence: e.target.value }))}>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
            </select>
            <label className="muted">Hour</label>
            <input className="settings-select" type="time" value={scheduleDraft.hour} onChange={(e) => setScheduleDraft((prev) => ({ ...prev, hour: e.target.value }))} />
            <label className="muted">Format</label>
            <select className="settings-select" value={scheduleDraft.format} onChange={(e) => setScheduleDraft((prev) => ({ ...prev, format: e.target.value }))}>
              <option value="PDF">PDF</option>
              <option value="EXCEL">Excel</option>
            </select>
            <label className="muted">Recipients</label>
            <input className="settings-select" value={scheduleDraft.recipients} onChange={(e) => setScheduleDraft((prev) => ({ ...prev, recipients: e.target.value }))} placeholder="ops@example.com, audit@example.com" />
            <label className="muted">Report Scope</label>
            <select className="settings-select" value={scheduleDraft.preset} onChange={(e) => setScheduleDraft((prev) => ({ ...prev, preset: e.target.value }))}>
              <option value="ALL_OPS">All Ops Snapshot</option>
              <option value="BREACHED_ONLY">Breached Only</option>
              <option value="ESCALATED_ONLY">Escalated Only</option>
              <option value="FOCUSED_ANALYST_ONLY">Focused Analyst Only</option>
            </select>
            <button className="btn-accent" onClick={() => void onSaveSchedule()} disabled={scheduleBusy || !scheduleDraft.name.trim()}>
              Save Report Schedule
            </button>
          </div>
        </div>

        <div className="mini-panel">
          <div className="detail-title">Saved Schedules</div>
          {reportSchedules.length ? (
            <div className="detail-activity-list">
              {reportSchedules.map((schedule) => (
                <div key={schedule.id || schedule.name} className="detail-activity-item">
                  <div>
                    <strong>{schedule.name || "Ops Snapshot"}</strong>
                    <div className="muted">{schedule.cadence} at {schedule.hour} | {schedule.format}</div>
                    <div className="muted">Preset: {formatPresetLabel(schedule.preset || "ALL_OPS")}</div>
                    <div className="muted">{schedule.recipients || "No recipients configured"}</div>
                    <div className="muted">Status: {schedule.active === false ? "Paused" : "Active"}{schedule.lastRunStatus ? ` | Last run ${formatRunStatusLabel(schedule.lastRunStatus)}` : ""}</div>
                    <div className="muted">
                      Next run: {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : buildNextRunLabel(schedule.cadence || "DAILY", schedule.hour || "09:00", schedule.active !== false)}
                    </div>
                    <div className="muted">
                      Last run: {schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleString() : "Never"}
                    </div>
                    {schedule.lastRunDetail ? <div className="muted">{schedule.lastRunDetail}</div> : null}
                  </div>
                  <div className="action-row">
                    <button className="pill" onClick={() => void onRunSchedule(schedule.id || schedule.name || "report", schedule.format || "PDF", schedule.preset || "ALL_OPS")}>Run Now</button>
                    <button className="pill" onClick={() => void onToggleSchedule(schedule.id || schedule.name || "", schedule.active === false)} disabled={scheduleBusy}>
                      {schedule.active === false ? "Resume" : "Pause"}
                    </button>
                    <button className="pill logout" onClick={() => void onRemoveSchedule(schedule.id || schedule.name || "")} disabled={scheduleBusy}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No report schedules saved yet.</div>
          )}
        </div>
      </div>

      <div className="mini-panel" style={{ marginTop: 16 }}>
        <div className="table-heading" style={{ marginBottom: 10 }}>
          <div className="detail-title">Execution History</div>
          <div className="cards-inline">
            <span className="chip approved">Runs: {reportRunHistory.length}</span>
          </div>
        </div>
        {reportRunHistory.length ? (
          <div className="detail-activity-list">
            {reportRunHistory.slice(0, 8).map((run) => (
              <div key={run.runKey} className="detail-activity-item">
                <div>
                  <strong>{run.scheduleId}</strong>
                  <div className="muted">{formatRunStatusLabel(run.status)} | {run.format} | {formatPresetLabel(run.preset || "ALL_OPS")}</div>
                  <div className="muted">
                    Deliveries: {run.totalDeliveries ?? 0} total, {run.successfulDeliveries ?? 0} sent, {run.failedDeliveries ?? 0} failed, {run.localExportDeliveries ?? 0} local export
                  </div>
                  {run.triggeredByName || run.triggeredByEmail ? <div className="muted">Triggered by {run.triggeredByName || run.triggeredByEmail}</div> : null}
                  {run.statusDetail ? <div className="muted">{run.statusDetail}</div> : null}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div>{run.generatedAt ? new Date(run.generatedAt).toLocaleString() : "-"}</div>
                  {run.completedAt ? <div className="muted">Completed {new Date(run.completedAt).toLocaleString()}</div> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">No execution history recorded yet.</div>
        )}
      </div>

      <div className="mini-panel" style={{ marginTop: 16 }}>
        <div className="table-heading" style={{ marginBottom: 10 }}>
          <div className="detail-title">Delivery Log</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select className="settings-select" style={{ width: 180 }} value={deliveryStatusFilter} onChange={(e) => setDeliveryStatusFilter(e.target.value)}>
              <option value="ALL">All deliveries</option>
              <option value="FAILED">Failed</option>
              <option value="SENT">Sent</option>
              <option value="LOCAL_EXPORT">Local export</option>
            </select>
            <select className="settings-select" style={{ width: 180 }} value={deliveryRangeFilter} onChange={(e) => setDeliveryRangeFilter(e.target.value)}>
              <option value="ALL_TIME">All time</option>
              <option value="TODAY">Today</option>
              <option value="LAST_7_DAYS">Last 7 days</option>
              <option value="LAST_30_DAYS">Last 30 days</option>
            </select>
            <button
              type="button"
              className="pill"
              onClick={() => {
                setDeliveryStatusFilter("ALL");
                setDeliveryRangeFilter("ALL_TIME");
              }}
              disabled={deliveryStatusFilter === "ALL" && deliveryRangeFilter === "ALL_TIME"}
            >
              Clear Filters
            </button>
          </div>
        </div>
        <div className="delivery-summary-grid">
          <button type="button" className={`delivery-summary-card ${deliveryStatusFilter === "ALL" ? "active" : ""}`} onClick={() => setDeliveryStatusFilter("ALL")}>
            <span className="muted">All in {formatDeliveryRangeLabel(deliveryRangeFilter)}</span>
            <strong>{deliverySummary.total}</strong>
          </button>
          <button type="button" className={`delivery-summary-card ${deliveryStatusFilter === "FAILED" ? "active failed" : ""}`} onClick={() => setDeliveryStatusFilter("FAILED")}>
            <span className="muted">Failed</span>
            <strong>{deliverySummary.failed}</strong>
          </button>
          <button type="button" className={`delivery-summary-card ${deliveryStatusFilter === "SENT" ? "active sent" : ""}`} onClick={() => setDeliveryStatusFilter("SENT")}>
            <span className="muted">Sent</span>
            <strong>{deliverySummary.sent}</strong>
          </button>
          <button type="button" className={`delivery-summary-card ${deliveryStatusFilter === "LOCAL_EXPORT" ? "active export" : ""}`} onClick={() => setDeliveryStatusFilter("LOCAL_EXPORT")}>
            <span className="muted">Local Export</span>
            <strong>{deliverySummary.localExport}</strong>
          </button>
        </div>
        {deliveryLogs.length ? (
          <div className="detail-activity-list">
            {deliveryLogs.map((entry) => (
              <div key={entry.id || `${entry.recipient}-${entry.generatedAt}`} className="detail-activity-item">
                <div>
                  <strong>{entry.recipient || "Unknown recipient"}</strong>
                  <div className="muted">{formatDeliveryLifecycle(entry)} | {entry.format || "PDF"} | {formatPresetLabel(entry.preset || "ALL_OPS")}</div>
                  {entry.queuedAt ? <div className="muted">Queued: {new Date(entry.queuedAt).toLocaleString()}</div> : null}
                  {entry.completedAt ? <div className="muted">{entry.deliveryStatus === "FAILED" ? "Failed" : "Completed"}: {new Date(entry.completedAt).toLocaleString()}</div> : null}
                  {entry.attemptCount ? <div className="muted">Attempts: {entry.attemptCount}{entry.lastAttemptAt ? ` | Last attempt ${new Date(entry.lastAttemptAt).toLocaleString()}` : ""}</div> : null}
                  {entry.statusDetail ? <div className="muted">{entry.statusDetail}</div> : null}
                </div>
                <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                  <div className="muted">{entry.generatedAt ? new Date(entry.generatedAt).toLocaleString() : "-"}</div>
                  {entry.deliveryStatus === "FAILED" ? (
                    <button className="pill" onClick={() => void onRetryDelivery(entry.id)} disabled={scheduleBusy}>
                      Retry
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">No delivery log entries recorded for the selected filters.</div>
        )}
      </div>
    </>
  );
}
