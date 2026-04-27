export type ReportScope = "DASHBOARD" | "CASES";
export type ReportPreset = "ALL_OPS" | "BREACHED_ONLY" | "ESCALATED_ONLY" | "FOCUSED_ANALYST_ONLY";
export type DeliveryStatus = "QUEUED" | "SENT" | "FAILED" | "LOCAL_EXPORT";
export type ReportRunStatus = "RUNNING" | "COMPLETED" | "COMPLETED_WITH_ERRORS" | "FAILED";
export type DeliveryLifecycleEvent = DeliveryStatus | "GENERATED" | "RETRY_REQUESTED";

export type ReportTemplate = {
  id: string;
  name: string;
  description: string;
  cadence: "DAILY" | "WEEKLY";
  hour: string;
  format: "PDF" | "EXCEL";
  preset: ReportPreset;
  scope: ReportScope;
  recipients: string;
};

export type ReportingSchedule = {
  id: string;
  name: string;
  cadence: "DAILY" | "WEEKLY";
  hour: string;
  format: "PDF" | "EXCEL";
  preset: ReportPreset;
  scope: ReportScope;
  recipients: string;
  active: boolean;
  lastRunAt?: string | null;
  lastRunStatus?: ReportRunStatus | null;
  lastRunDetail?: string | null;
  nextRunAt?: string | null;
};

export type ReportRunEntry = {
  id: number;
  runKey: string;
  scheduleId: string;
  scope: ReportScope;
  preset: ReportPreset;
  format: "PDF" | "EXCEL";
  generatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  status?: ReportRunStatus | null;
  triggeredByName?: string | null;
  triggeredByEmail?: string | null;
  triggeredByRole?: string | null;
  totalDeliveries?: number | null;
  successfulDeliveries?: number | null;
  failedDeliveries?: number | null;
  localExportDeliveries?: number | null;
  statusDetail?: string | null;
};

export type DeliveryLogEntry = {
  id: number;
  runKey: string;
  scheduleId: string;
  scope: ReportScope;
  preset: ReportPreset;
  recipient: string;
  deliveryStatus: DeliveryStatus;
  format: "PDF" | "EXCEL";
  generatedAt: string;
  queuedAt?: string;
  completedAt?: string;
  lastAttemptAt?: string;
  attemptCount?: number;
  lifecycle: DeliveryLifecycleEvent[];
  statusDetail?: string;
};

export function getReportTemplatesByRole(role: "ADMIN" | "ANALYTICS", scope: ReportScope, focusedAnalyst = ""): ReportTemplate[] {
  const analystSuffix = focusedAnalyst ? ` - ${focusedAnalyst}` : "";

  if (role === "ADMIN") {
    return [
      {
        id: `${scope}-admin-ops-daily`,
        name: scope === "DASHBOARD" ? "Executive Ops Daily" : "Case Queue Daily",
        description: scope === "DASHBOARD"
          ? "Broad daily operations snapshot for platform owners."
          : "Daily case queue snapshot for leadership review.",
        cadence: "DAILY",
        hour: "09:00",
        format: "PDF",
        preset: "ALL_OPS",
        scope,
        recipients: "soc@example.com"
      },
      {
        id: `${scope}-admin-breach-watch`,
        name: scope === "DASHBOARD" ? "SLA Breach Watch" : "Breached Cases Watch",
        description: "Focused report for breached and urgent operational risk.",
        cadence: "DAILY",
        hour: "10:00",
        format: "EXCEL",
        preset: "BREACHED_ONLY",
        scope,
        recipients: "ops-risk@example.com"
      },
      {
        id: `${scope}-admin-escalation-watch`,
        name: scope === "DASHBOARD" ? "Escalation Watch" : "Escalated Case Watch",
        description: "Tracks current escalations that need management attention.",
        cadence: "WEEKLY",
        hour: "11:00",
        format: "PDF",
        preset: "ESCALATED_ONLY",
        scope,
        recipients: "leadership@example.com"
      }
    ];
  }

  return [
    {
      id: `${scope}-analyst-queue-daily`,
      name: scope === "DASHBOARD" ? "My Queue Snapshot" : "My Cases Snapshot",
      description: "Personal analyst workload summary for the current queue.",
      cadence: "DAILY",
      hour: "09:00",
      format: "PDF",
      preset: "ALL_OPS",
      scope,
      recipients: ""
    },
    {
      id: `${scope}-analyst-breach-focus`,
      name: scope === "DASHBOARD" ? "Due Soon and Breached" : "Urgent Case Focus",
      description: "Keeps the analyst focused on breached and near-breach work.",
      cadence: "DAILY",
      hour: "09:30",
      format: "EXCEL",
      preset: "BREACHED_ONLY",
      scope,
      recipients: ""
    },
    {
      id: `${scope}-analyst-focus`,
      name: `Focused Analyst Review${analystSuffix}`,
      description: "Uses the currently selected analyst context for a tighter review pack.",
      cadence: "WEEKLY",
      hour: "16:00",
      format: "PDF",
      preset: "FOCUSED_ANALYST_ONLY",
      scope,
      recipients: ""
    }
  ];
}

export function resolveReportTemplates(params: {
  role: "ADMIN" | "ANALYTICS";
  scope: ReportScope;
  focusedAnalyst?: string;
  viewerSettings?: Record<string, any> | null;
  adminSettings?: Record<string, any> | null;
}) {
  const defaults = getReportTemplatesByRole(params.role, params.scope, params.focusedAnalyst || "");
  const source = params.role === "ADMIN"
    ? params.viewerSettings?.reporting?.roleTemplates?.[params.role]?.[params.scope]
    : params.adminSettings?.reporting?.roleTemplates?.[params.role]?.[params.scope];

  if (!Array.isArray(source) || !source.length) {
    return defaults;
  }

  return source.map((item, index) => normalizeTemplate(item, defaults[index] || defaults[0]));
}

export function formatPresetLabel(preset: string) {
  switch (preset) {
    case "BREACHED_ONLY":
      return "Breached Only";
    case "ESCALATED_ONLY":
      return "Escalated Only";
    case "FOCUSED_ANALYST_ONLY":
      return "Focused Analyst Only";
    case "ALL_OPS":
    default:
      return "All Ops Snapshot";
  }
}

export function formatDeliveryLifecycle(entry?: { lifecycle?: DeliveryLifecycleEvent[]; deliveryStatus?: string }) {
  if (Array.isArray(entry?.lifecycle) && entry.lifecycle.length) {
    return entry.lifecycle.join(" -> ");
  }
  return entry?.deliveryStatus || "QUEUED";
}

export function buildNextRunLabel(cadence: string, hour: string, active: boolean) {
  if (!active) return "Paused";
  const [hours, minutes] = String(hour || "09:00").split(":").map((part) => Number(part || 0));
  const now = new Date();
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (cadence === "WEEKLY") {
    while (next <= now) {
      next.setDate(next.getDate() + 7);
    }
  } else if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.toLocaleString();
}

export function matchesDeliveryRange(timestamp: string | undefined, range: string) {
  if (!timestamp || range === "ALL_TIME") return true;
  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (range === "TODAY") {
    return value >= startOfToday;
  }

  const last7Days = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  if (range === "LAST_7_DAYS") {
    return value >= last7Days;
  }

  const last30Days = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  if (range === "LAST_30_DAYS") {
    return value >= last30Days;
  }

  return true;
}

export function formatDeliveryRangeLabel(range: string) {
  switch (range) {
    case "TODAY":
      return "today";
    case "LAST_7_DAYS":
      return "last 7 days";
    case "LAST_30_DAYS":
      return "last 30 days";
    case "ALL_TIME":
    default:
      return "all time";
  }
}

export function formatRunStatusLabel(status?: string | null) {
  switch (status) {
    case "COMPLETED_WITH_ERRORS":
      return "Completed With Errors";
    case "COMPLETED":
      return "Completed";
    case "FAILED":
      return "Failed";
    case "RUNNING":
      return "Running";
    default:
      return "Pending";
  }
}

function normalizeTemplate(item: any, fallback: ReportTemplate): ReportTemplate {
  return {
    id: String(item?.id || fallback.id),
    name: String(item?.name || fallback.name),
    description: String(item?.description || fallback.description),
    cadence: item?.cadence === "WEEKLY" ? "WEEKLY" : "DAILY",
    hour: String(item?.hour || fallback.hour),
    format: String(item?.format || fallback.format).toUpperCase() === "EXCEL" ? "EXCEL" : "PDF",
    preset: normalizePreset(item?.preset || fallback.preset),
    scope: item?.scope === "CASES" ? "CASES" : fallback.scope,
    recipients: String(item?.recipients || "")
  };
}

function normalizePreset(preset: string): ReportPreset {
  switch (preset) {
    case "BREACHED_ONLY":
    case "ESCALATED_ONLY":
    case "FOCUSED_ANALYST_ONLY":
      return preset;
    case "ALL_OPS":
    default:
      return "ALL_OPS";
  }
}
