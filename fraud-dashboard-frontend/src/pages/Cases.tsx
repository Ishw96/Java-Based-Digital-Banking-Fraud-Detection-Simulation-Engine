import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";
import {
  addAlertCaseNote,
  assignAlertCase,
  bulkAddAlertCaseNote,
  bulkAssignAlertCases,
  bulkUpdateAlertCaseStatus,
  getAdminSettingsProfile,
  getActiveAlerts,
  getAlertDetail,
  getAlertTimeline,
  getReadAlerts,
  getUsers,
  updateAlertCaseStatus
} from "../services/alertService";
import type { AlertLifecycle, AlertTimelineEntry, UserRecord } from "../services/alertService";
import { downloadExcel, downloadPdf } from "../utils/export";
import { useAppSettings } from "../context/AppSettingsContext";
import { resolveReportTemplates, type DeliveryLogEntry, type ReportRunEntry, type ReportingSchedule, type ReportTemplate } from "../utils/reporting";
import DecisionExplanationList from "../components/DecisionExplanationList";
import ReportingWorkspacePanel from "../components/ReportingWorkspacePanel";
import { buildCaseStatusOptions, formatTimelineActor, intersectCaseTransitions, summarizeBulkActionResult } from "../utils/caseWorkflow";
import {
  deleteReportingSchedule,
  getReportingDeliveries,
  getReportingRuns,
  getReportingSchedules,
  retryReportingDelivery,
  runReportingSchedule,
  saveReportingSchedule,
  updateReportingScheduleActive
} from "../features/reporting/reportingService";

type Filters = {
  search: string;
  severity: string;
  caseStatus: string;
  sla: string;
  assignee: string;
  readState: string;
};

const initialFilters: Filters = {
  search: "",
  severity: "ALL",
  caseStatus: "ALL",
  sla: "ALL",
  assignee: "",
  readState: "ALL"
};

const caseStatuses = ["OPEN", "IN_REVIEW", "ESCALATED", "RESOLVED"];

export default function Cases({ syncKey }: { syncKey?: string }) {
  const { role, settings } = useAppSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cases, setCases] = useState<AlertLifecycle[]>([]);
  const [adminSettings, setAdminSettings] = useState<Record<string, unknown> | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [filters, setFilters] = useState<Filters>(() => readFilters(searchParams));
  const [applied, setApplied] = useState<Filters>(() => readFilters(searchParams));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("transactionId"));
  const [selectedCase, setSelectedCase] = useState<AlertLifecycle | null>(null);
  const [timeline, setTimeline] = useState<AlertTimelineEntry[]>([]);
  const [assignEmail, setAssignEmail] = useState("");
  const [statusDraft, setStatusDraft] = useState("OPEN");
  const [statusDetail, setStatusDetail] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [bulkAssignEmail, setBulkAssignEmail] = useState("");
  const [bulkStatusDraft, setBulkStatusDraft] = useState("IN_REVIEW");
  const [bulkStatusDetail, setBulkStatusDetail] = useState("");
  const [bulkNoteDraft, setBulkNoteDraft] = useState("");
  const [bulkFeedback, setBulkFeedback] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [compareAnalyst, setCompareAnalyst] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState({
    name: "Daily Case Ops Snapshot",
    cadence: "DAILY",
    hour: "09:00",
    format: "PDF",
    recipients: "",
    preset: "ALL_OPS",
    scope: "CASES"
  });
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState("ALL");
  const [deliveryRangeFilter, setDeliveryRangeFilter] = useState("ALL_TIME");
  const [reportSchedules, setReportSchedules] = useState<ReportingSchedule[]>([]);
  const [reportRunHistory, setReportRunHistory] = useState<ReportRunEntry[]>([]);
  const [deliveryEntries, setDeliveryEntries] = useState<DeliveryLogEntry[]>([]);

  const load = async () => {
    const [active, read, userList, nextSchedules, nextRuns, nextDeliveries] = await Promise.all([
      getActiveAlerts(),
      getReadAlerts(),
      getUsers(),
      getReportingSchedules("CASES").catch(() => []),
      getReportingRuns("CASES").catch(() => []),
      getReportingDeliveries("CASES").catch(() => [])
    ]);
    const combined = dedupeCases([...active, ...read]);
    setCases(combined);
    setUsers(userList.filter((item) => item.active));
    setReportSchedules(nextSchedules);
    setReportRunHistory(nextRuns);
    setDeliveryEntries(nextDeliveries);
  };

  const loadSelected = async (transactionId: string) => {
    setBusy(true);
    try {
      const [detail, items] = await Promise.all([
        getAlertDetail(transactionId),
        getAlertTimeline(transactionId)
      ]);
      setSelectedCase(detail);
      setTimeline(items);
      setAssignEmail(detail.assignedToEmail || "");
      setStatusDraft(detail.caseStatus || "OPEN");
      setStatusDetail("");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, [syncKey]);

  useEffect(() => {
    let active = true;
    const loadAdminSettings = async () => {
      try {
        const profile = await getAdminSettingsProfile();
        if (active) {
          setAdminSettings((profile.settings || {}) as Record<string, unknown>);
        }
      } catch {
        if (active) {
          setAdminSettings(null);
        }
      }
    };
    void loadAdminSettings();
    const sync = () => {
      void loadAdminSettings();
    };
    window.addEventListener("detectiq:settings-updated", sync);
    return () => {
      active = false;
      window.removeEventListener("detectiq:settings-updated", sync);
    };
  }, []);

  useEffect(() => {
    const next = readFilters(searchParams);
    setFilters(next);
    setApplied(next);
    setSelectedId(searchParams.get("transactionId"));
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedCase(null);
      setTimeline([]);
      return;
    }
    void loadSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const validIds = new Set(cases.map((item) => item.transactionId).filter(Boolean));
    setSelectedIds((current) => current.filter((item) => validIds.has(item)));
  }, [cases]);



  const filteredCases = useMemo(() => {
    return cases.filter((item) => {
      const severity = (item.priority || item.riskLevel || "").toUpperCase();
      const searchText = `${item.transactionId || ""} ${item.ruleTriggered || ""} ${item.location || ""} ${item.assignedToName || ""}`.toLowerCase();
      const matchesSearch = !applied.search || searchText.includes(applied.search.toLowerCase());
      const matchesSeverity = applied.severity === "ALL" || severity.includes(applied.severity);
      const matchesCaseStatus = applied.caseStatus === "ALL" || (item.caseStatus || "OPEN") === applied.caseStatus;
      const matchesSla =
        applied.sla === "ALL" ||
        (applied.sla === "BREACHED" && isSlaBreached(item)) ||
        (applied.sla === "DUE_SOON" && isSlaDueSoon(item)) ||
        (applied.sla === "WITHIN_SLA" && !isSlaBreached(item) && !isSlaDueSoon(item));
      const assigneeLabel = item.assignedToName || item.assignedToEmail || "Unassigned";
      const matchesAssignee =
        !applied.assignee ||
        assigneeLabel.toLowerCase().includes(applied.assignee.toLowerCase()) ||
        (applied.assignee.toLowerCase() === "unassigned" && !item.assignedToName && !item.assignedToEmail);
      const matchesReadState = applied.readState === "ALL" || (item.actionType || "UNREAD") === applied.readState;
      return matchesSearch && matchesSeverity && matchesCaseStatus && matchesSla && matchesAssignee && matchesReadState;
    });
  }, [cases, applied]);

  const summary = useMemo(() => {
    const open = filteredCases.filter((item) => (item.caseStatus || "OPEN") === "OPEN").length;
    const inReview = filteredCases.filter((item) => item.caseStatus === "IN_REVIEW").length;
    const escalated = filteredCases.filter((item) => item.caseStatus === "ESCALATED").length;
    const resolved = filteredCases.filter((item) => item.caseStatus === "RESOLVED").length;
    const breached = filteredCases.filter((item) => isSlaBreached(item)).length;
    const dueSoon = filteredCases.filter((item) => isSlaDueSoon(item)).length;
    return { open, inReview, escalated, resolved, breached, dueSoon };
  }, [filteredCases]);

  const casesPerAnalyst = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredCases.forEach((item) => {
      const key = item.assignedToName || item.assignedToEmail || "Unassigned";
      grouped.set(key, (grouped.get(key) || 0) + 1);
    });
    return Array.from(grouped.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [filteredCases]);

  const escalationsByAnalyst = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredCases
      .filter((item) => item.caseStatus === "ESCALATED")
      .forEach((item) => {
        const key = item.assignedToName || item.assignedToEmail || "Unassigned";
        grouped.set(key, (grouped.get(key) || 0) + 1);
      });
    return Array.from(grouped.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [filteredCases]);

  const breachesLast24Hours = useMemo(() => {
    const cutoff = Date.now() - 24 * 3_600_000;
    return filteredCases.filter((item) => {
      if (!item.evaluatedAt || !isSlaBreached(item)) return false;
      return new Date(item.evaluatedAt).getTime() >= cutoff;
    }).length;
  }, [filteredCases]);

  const dueSoonBySeverity = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredCases.filter((item) => isSlaDueSoon(item)).forEach((item) => {
      const severity = normalizeSeverity(item.priority || item.riskLevel || "MEDIUM");
      grouped.set(severity, (grouped.get(severity) || 0) + 1);
    });
    return ["CRITICAL", "HIGH", "MEDIUM"].map((severity) => ({
      severity,
      total: grouped.get(severity) || 0
    }));
  }, [filteredCases]);

  const analystLeaderboard = useMemo(() => {
    const grouped = new Map<string, { analyst: string; cases: number; escalations: number; resolved: number }>();
    filteredCases.forEach((item) => {
      const analyst = item.assignedToName || item.assignedToEmail || "Unassigned";
      const current = grouped.get(analyst) || { analyst, cases: 0, escalations: 0, resolved: 0 };
      current.cases += 1;
      if ((item.caseStatus || "OPEN") === "ESCALATED") current.escalations += 1;
      if ((item.caseStatus || "OPEN") === "RESOLVED") current.resolved += 1;
      grouped.set(analyst, current);
    });
    const all = Array.from(grouped.values()).sort((a, b) => b.cases - a.cases);
    const highestWorkload = all[0];
    const mostEscalations = [...all].sort((a, b) => b.escalations - a.escalations || b.cases - a.cases)[0];
    const fastestResolved = [...all]
      .filter((item) => item.resolved > 0)
      .sort((a, b) => b.resolved - a.resolved || a.cases - b.cases)[0];
    return { highestWorkload, mostEscalations, fastestResolved };
  }, [filteredCases]);

  const agingBuckets = useMemo(() => {
    const buckets = [
      { label: "0-1h", total: 0 },
      { label: "1-4h", total: 0 },
      { label: "4-24h", total: 0 },
      { label: "24h+", total: 0 }
    ];
    filteredCases.forEach((item) => {
      if (!item.evaluatedAt || (item.caseStatus || "OPEN") === "RESOLVED") return;
      const ageHours = (Date.now() - new Date(item.evaluatedAt).getTime()) / 3_600_000;
      if (ageHours < 1) {
        buckets[0].total += 1;
      } else if (ageHours < 4) {
        buckets[1].total += 1;
      } else if (ageHours < 24) {
        buckets[2].total += 1;
      } else {
        buckets[3].total += 1;
      }
    });
    return buckets;
  }, [filteredCases]);

  const analystPerformanceTrend = useMemo(() => {
    const grouped = new Map<string, { label: string; resolved: number; escalated: number }>();
    filteredCases.forEach((item) => {
      if (!item.evaluatedAt) return;
      const key = new Date(item.evaluatedAt).toLocaleDateString();
      const current = grouped.get(key) || { label: key, resolved: 0, escalated: 0 };
      if ((item.caseStatus || "OPEN") === "RESOLVED") current.resolved += 1;
      if ((item.caseStatus || "OPEN") === "ESCALATED") current.escalated += 1;
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).slice(-7);
  }, [filteredCases]);

  const breachHeatmap = useMemo(() => {
    const analysts = Array.from(new Set(
      filteredCases
        .map((item) => item.assignedToName || item.assignedToEmail || "Unassigned")
    )).slice(0, 5);
    const severities = ["CRITICAL", "HIGH", "MEDIUM"];
    return severities.map((severity) => ({
      severity,
      values: analysts.map((analyst) => {
        const total = filteredCases.filter((item) => {
          const itemAnalyst = item.assignedToName || item.assignedToEmail || "Unassigned";
          return itemAnalyst === analyst && normalizeSeverity(item.priority || item.riskLevel || "") === severity && isSlaBreached(item);
        }).length;
        return { analyst, total };
      })
    }));
  }, [filteredCases]);

  const selectedAnalystProfile = useMemo(() => {
    if (!applied.assignee) return null;
    const analystCases = filteredCases.filter((item) => {
      const itemAnalyst = item.assignedToName || item.assignedToEmail || "Unassigned";
      return itemAnalyst.toLowerCase().includes(applied.assignee.toLowerCase()) ||
        (applied.assignee.toLowerCase() === "unassigned" && !item.assignedToName && !item.assignedToEmail);
    });
    return {
      analyst: applied.assignee,
      total: analystCases.length,
      open: analystCases.filter((item) => (item.caseStatus || "OPEN") === "OPEN").length,
      escalated: analystCases.filter((item) => item.caseStatus === "ESCALATED").length,
      breached: analystCases.filter((item) => isSlaBreached(item)).length,
      resolved: analystCases.filter((item) => item.caseStatus === "RESOLVED").length
    };
  }, [applied.assignee, filteredCases]);

  const compareAnalystProfile = useMemo(() => {
    if (!compareAnalyst) return null;
    const analystCases = filteredCases.filter((item) => {
      const itemAnalyst = item.assignedToName || item.assignedToEmail || "Unassigned";
      return itemAnalyst === compareAnalyst;
    });
    return {
      analyst: compareAnalyst,
      total: analystCases.length,
      open: analystCases.filter((item) => (item.caseStatus || "OPEN") === "OPEN").length,
      escalated: analystCases.filter((item) => item.caseStatus === "ESCALATED").length,
      breached: analystCases.filter((item) => isSlaBreached(item)).length,
      resolved: analystCases.filter((item) => item.caseStatus === "RESOLVED").length
    };
  }, [compareAnalyst, filteredCases]);

  const analystOptions = useMemo(
    () => Array.from(new Set(filteredCases.map((item) => item.assignedToName || item.assignedToEmail || "Unassigned"))).sort(),
    [filteredCases]
  );

  const reportTemplates = useMemo(
    () => resolveReportTemplates({
      role,
      scope: "CASES",
      focusedAnalyst: selectedAnalystProfile?.analyst || applied.assignee || "",
      viewerSettings: settings,
      adminSettings
    }),
    [role, selectedAnalystProfile?.analyst, applied.assignee, settings, adminSettings]
  );

  const compareChartData = useMemo(() => {
    if (!selectedAnalystProfile || !compareAnalystProfile) return [];
    return [
      { metric: "Open", primary: selectedAnalystProfile.open, secondary: compareAnalystProfile.open },
      { metric: "Escalated", primary: selectedAnalystProfile.escalated, secondary: compareAnalystProfile.escalated },
      { metric: "Breached", primary: selectedAnalystProfile.breached, secondary: compareAnalystProfile.breached },
      { metric: "Resolved", primary: selectedAnalystProfile.resolved, secondary: compareAnalystProfile.resolved }
    ];
  }, [selectedAnalystProfile, compareAnalystProfile]);

  const selectedCases = useMemo(
    () => cases.filter((item) => item.transactionId && selectedIds.includes(item.transactionId)),
    [cases, selectedIds]
  );

  const bulkAllowedTransitions = useMemo(
    () => intersectCaseTransitions(selectedCases),
    [selectedCases]
  );

  const selectedCaseStatusOptions = useMemo(
    () => buildCaseStatusOptions(selectedCase?.caseStatus, selectedCase?.allowedCaseTransitions),
    [selectedCase?.caseStatus, selectedCase?.allowedCaseTransitions]
  );

  const allVisibleSelected = filteredCases.length > 0 && filteredCases.every((item) => item.transactionId && selectedIds.includes(item.transactionId));

  useEffect(() => {
    if (!selectedCaseStatusOptions.length) return;
    if (!selectedCaseStatusOptions.includes(statusDraft)) {
      setStatusDraft(selectedCaseStatusOptions[0]);
    }
  }, [selectedCaseStatusOptions, statusDraft]);

  useEffect(() => {
    if (!bulkAllowedTransitions.length) return;
    if (!bulkAllowedTransitions.includes(bulkStatusDraft)) {
      setBulkStatusDraft(bulkAllowedTransitions[0]);
    }
  }, [bulkAllowedTransitions, bulkStatusDraft]);

  const refreshAndKeepSelection = async (transactionId?: string | null) => {
    await load();
    if (transactionId) {
      await loadSelected(transactionId);
    }
    window.dispatchEvent(new Event("fraud:sync"));
  };

  const applyFilters = () => {
    const params = buildSearchParams(filters, selectedId);
    setSearchParams(params);
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    setSelectedIds([]);
    setSearchParams(buildSearchParams(initialFilters, selectedId));
  };

  const applyAssigneeDrilldown = (assignee: string) => {
    const nextFilters = { ...applied, assignee };
    setFilters(nextFilters);
    setSelectedIds([]);
    setSearchParams(buildSearchParams(nextFilters, selectedId));
  };

  const openCase = (transactionId: string) => {
    setSelectedId(transactionId);
    setSearchParams(buildSearchParams(applied, transactionId));
  };

  const closeCase = () => {
    setSelectedId(null);
    setSearchParams(buildSearchParams(applied, null));
  };

  const toggleSelected = (transactionId: string) => {
    setSelectedIds((current) => current.includes(transactionId)
      ? current.filter((item) => item !== transactionId)
      : [...current, transactionId]);
  };

  const toggleAllVisible = () => {
    const visibleIds = filteredCases.map((item) => item.transactionId).filter(Boolean) as string[];
    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((item) => !visibleIds.includes(item)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...visibleIds])));
  };

  const assignSelected = async () => {
    if (!selectedCase?.transactionId || !assignEmail) return;
    setBusy(true);
    try {
      setBulkFeedback(null);
      const assignee = users.find((item) => item.email === assignEmail);
      await assignAlertCase(selectedCase.transactionId, {
        assignedToEmail: assignEmail,
        assignedToName: assignee?.userName
      });
      await refreshAndKeepSelection(selectedCase.transactionId);
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async () => {
    if (!selectedCase?.transactionId) return;
    setBusy(true);
    try {
      setBulkFeedback(null);
      await updateAlertCaseStatus(selectedCase.transactionId, {
        caseStatus: statusDraft,
        detail: statusDetail || undefined
      });
      setStatusDetail("");
      await refreshAndKeepSelection(selectedCase.transactionId);
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!selectedCase?.transactionId || !noteDraft.trim()) return;
    setBusy(true);
    try {
      setBulkFeedback(null);
      await addAlertCaseNote(selectedCase.transactionId, noteDraft.trim());
      setNoteDraft("");
      await refreshAndKeepSelection(selectedCase.transactionId);
    } finally {
      setBusy(false);
    }
  };

  const bulkAssign = async () => {
    if (!bulkAssignEmail || !selectedIds.length) return;
    setBusy(true);
    try {
      const assignee = users.find((item) => item.email === bulkAssignEmail);
      const result = await bulkAssignAlertCases({
        transactionIds: selectedIds,
        assignedToEmail: bulkAssignEmail,
        assignedToName: assignee?.userName
      });
      setBulkFeedback(summarizeBulkActionResult(result));
      await refreshAndKeepSelection(selectedId);
      setSelectedIds([]);
    } finally {
      setBusy(false);
    }
  };

  const bulkUpdateStatus = async () => {
    if (!selectedIds.length || !bulkAllowedTransitions.length) return;
    setBusy(true);
    try {
      const result = await bulkUpdateAlertCaseStatus({
        transactionIds: selectedIds,
        caseStatus: bulkStatusDraft,
        detail: bulkStatusDetail || undefined
      });
      setBulkStatusDetail("");
      setBulkFeedback(summarizeBulkActionResult(result));
      await refreshAndKeepSelection(selectedId);
      setSelectedIds([]);
    } finally {
      setBusy(false);
    }
  };

  const bulkAppendNote = async () => {
    const note = bulkNoteDraft.trim();
    if (!selectedIds.length || !note) return;
    const confirmed = window.confirm(`Append this note to ${selectedIds.length} selected case(s)?`);
    if (!confirmed) return;
    setBusy(true);
    try {
      const result = await bulkAddAlertCaseNote({
        transactionIds: selectedIds,
        note
      });
      setBulkNoteDraft("");
      setBulkFeedback(summarizeBulkActionResult(result));
      await refreshAndKeepSelection(selectedId);
      setSelectedIds([]);
    } finally {
      setBusy(false);
    }
  };

  const bulkCloseCases = async () => {
    if (!selectedIds.length) return;
    const confirmed = window.confirm(`Mark ${selectedIds.length} selected case(s) as RESOLVED?`);
    if (!confirmed) return;
    setBusy(true);
    try {
      const result = await bulkUpdateAlertCaseStatus({
        transactionIds: selectedIds,
        caseStatus: "RESOLVED",
        detail: "Bulk close action applied from Case Management."
      });
      setBulkFeedback(summarizeBulkActionResult(result));
      await refreshAndKeepSelection(selectedId);
      setSelectedIds([]);
    } finally {
      setBusy(false);
    }
  };

  const saveReportSchedule = async () => {
    setScheduleBusy(true);
    try {
      await saveReportingSchedule({
        id: scheduleDraft.name,
        name: scheduleDraft.name,
        cadence: scheduleDraft.cadence as "DAILY" | "WEEKLY",
        hour: scheduleDraft.hour,
        format: scheduleDraft.format as "PDF" | "EXCEL",
        recipients: scheduleDraft.recipients,
        preset: scheduleDraft.preset as "ALL_OPS" | "BREACHED_ONLY" | "ESCALATED_ONLY" | "FOCUSED_ANALYST_ONLY",
        scope: scheduleDraft.scope as "DASHBOARD" | "CASES",
        active: true
      });
      setReportSchedules(await getReportingSchedules("CASES"));
    } finally {
      setScheduleBusy(false);
    }
  };

  const applyReportTemplate = (template: ReportTemplate) => {
    setScheduleDraft({
      name: template.name,
      cadence: template.cadence,
      hour: template.hour,
      format: template.format,
      recipients: template.recipients,
      preset: template.preset,
      scope: template.scope
    });
  };

  const removeReportSchedule = async (id: string) => {
    setScheduleBusy(true);
    try {
      await deleteReportingSchedule(id);
      setReportSchedules(await getReportingSchedules("CASES"));
      setReportRunHistory(await getReportingRuns("CASES"));
      setDeliveryEntries(await getReportingDeliveries("CASES"));
    } finally {
      setScheduleBusy(false);
    }
  };

  const toggleReportSchedule = async (id: string, active: boolean) => {
    setScheduleBusy(true);
    try {
      await updateReportingScheduleActive(id, active);
      setReportSchedules(await getReportingSchedules("CASES"));
    } finally {
      setScheduleBusy(false);
    }
  };

  const runScheduledExport = async (scheduleId: string, format: string, preset = "ALL_OPS") => {
    const exportRows = buildOperationsRows({
      leaderboard: analystLeaderboard,
      trend: analystPerformanceTrend,
      heatmap: breachHeatmap,
      selectedAnalystProfile,
      preset
    });
    if (String(format).toUpperCase() === "EXCEL") {
      downloadExcel(`case-${String(preset).toLowerCase()}`, operationsHeaders, exportRows);
    } else {
      downloadPdf(`case-${String(preset).toLowerCase()}`, operationsHeaders, exportRows);
    }
    setScheduleBusy(true);
    try {
      await runReportingSchedule(scheduleId);
      const [nextSchedules, nextRuns, nextDeliveries] = await Promise.all([
        getReportingSchedules("CASES"),
        getReportingRuns("CASES"),
        getReportingDeliveries("CASES")
      ]);
      setReportSchedules(nextSchedules);
      setReportRunHistory(nextRuns);
      setDeliveryEntries(nextDeliveries);
    } finally {
      setScheduleBusy(false);
    }
  };

  const retryDelivery = async (entryId: number) => {
    setScheduleBusy(true);
    try {
      await retryReportingDelivery(entryId);
      setDeliveryEntries(await getReportingDeliveries("CASES"));
    } finally {
      setScheduleBusy(false);
    }
  };

  const exportOperationsSnapshotPdf = () => {
    downloadPdf("case-operations-snapshot", operationsHeaders, buildOperationsRows({
      leaderboard: analystLeaderboard,
      trend: analystPerformanceTrend,
      heatmap: breachHeatmap,
      selectedAnalystProfile
    }));
  };

  const exportOperationsSnapshotExcel = () => {
    downloadExcel("case-operations-snapshot", operationsHeaders, buildOperationsRows({
      leaderboard: analystLeaderboard,
      trend: analystPerformanceTrend,
      heatmap: breachHeatmap,
      selectedAnalystProfile
    }));
  };

  const exportCompareSnapshotPdf = () => {
    if (!selectedAnalystProfile || !compareAnalystProfile) return;
    downloadPdf("case-analyst-compare", operationsHeaders, buildCompareRows(selectedAnalystProfile, compareAnalystProfile));
  };

  const exportCompareSnapshotExcel = () => {
    if (!selectedAnalystProfile || !compareAnalystProfile) return;
    downloadExcel("case-analyst-compare", operationsHeaders, buildCompareRows(selectedAnalystProfile, compareAnalystProfile));
  };

  return (
    <div className="section">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0 }}>Case Management</h2>
          <p className="muted">A dedicated workspace for investigating, assigning, and closing fraud cases.</p>
        </div>
        <div className="cards-inline">
          <span className="chip approved">Open: {summary.open}</span>
          <span className="chip medium">In Review: {summary.inReview}</span>
          <span className="chip high">Escalated: {summary.escalated}</span>
          <span className="chip low">Resolved: {summary.resolved}</span>
        </div>
      </div>

      <div className="cards-grid" style={{ marginTop: 16 }}>
        <SummaryCard label="Open Cases" value={String(summary.open)} tone="#f0ad4e" />
        <SummaryCard label="In Review" value={String(summary.inReview)} tone="#23b0ff" />
        <SummaryCard label="Escalated" value={String(summary.escalated)} tone="#f54b64" />
        <SummaryCard label="Resolved" value={String(summary.resolved)} tone="#20c997" />
        <SummaryCard label="Breached Cases" value={String(summary.breached)} tone="#ff7b8c" />
        <SummaryCard label="Due Soon" value={String(summary.dueSoon)} tone="#8ddcff" />
      </div>

      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div className="section" style={{ background: "#0f1a2b", minWidth: 0 }}>
          <div className="table-heading">
            <div>
              <h3 style={{ margin: 0 }}>Cases per Analyst</h3>
              <p className="muted" style={{ margin: "6px 0 0" }}>Current ownership balance across the filtered case queue.</p>
            </div>
          </div>
          <div style={{ width: "100%", height: 260, marginTop: 12 }}>
            <ResponsiveContainer>
              <BarChart data={casesPerAnalyst}>
                <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#9fb2d9" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} stroke="#9fb2d9" />
                <Tooltip content={<CaseChartTooltip />} />
                <Bar dataKey="total" fill="#4361ee" radius={[8, 8, 0, 0]} name="Cases" onClick={(data) => data?.name && applyAssigneeDrilldown(String(data.name))} style={{ cursor: "pointer" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>Click a bar to filter the case queue by analyst.</div>
        </div>
        <div className="section" style={{ background: "#0f1a2b", minWidth: 0 }}>
          <div className="table-heading">
            <div>
              <h3 style={{ margin: 0 }}>Escalations by Analyst</h3>
              <p className="muted" style={{ margin: "6px 0 0" }}>Escalated workload concentration for the currently filtered view.</p>
            </div>
          </div>
          <div style={{ width: "100%", height: 260, marginTop: 12 }}>
            <ResponsiveContainer>
              <BarChart data={escalationsByAnalyst}>
                <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#9fb2d9" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} stroke="#9fb2d9" />
                <Tooltip content={<CaseChartTooltip />} />
                <Bar dataKey="total" fill="#f54b64" radius={[8, 8, 0, 0]} name="Escalations" onClick={(data) => data?.name && applyAssigneeDrilldown(String(data.name))} style={{ cursor: "pointer" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>Click a bar to jump into that analyst’s escalated workload.</div>
        </div>
      </div>

      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div className="mini-panel">
          <div className="detail-title">SLA Trend</div>
          <div className="detail-list">
            <DetailRow label="Breaches in last 24h" value={String(breachesLast24Hours)} />
            <DetailRow label="Current breached cases" value={String(summary.breached)} />
            <DetailRow label="Current due soon cases" value={String(summary.dueSoon)} />
          </div>
        </div>
        <div className="mini-panel">
          <div className="detail-title">Due Soon by Severity</div>
          <div className="cards-inline">
            {dueSoonBySeverity.map((item) => (
              <span key={item.severity} className={`chip ${severityChipClass(item.severity)}`}>
                {item.severity}: {item.total}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div className="mini-panel">
          <div className="detail-title">Analyst Leaderboard</div>
          <div className="detail-list">
            <DetailRow
              label="Highest workload"
              value={formatLeaderValue(analystLeaderboard.highestWorkload, "cases")}
            />
            <DetailRow
              label="Most escalations"
              value={formatLeaderValue(analystLeaderboard.mostEscalations, "escalations")}
            />
            <DetailRow
              label="Fastest resolved"
              value={formatLeaderValue(analystLeaderboard.fastestResolved, "resolved")}
            />
          </div>
        </div>
        <div className="mini-panel">
          <div className="detail-title">Case Aging Buckets</div>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={agingBuckets}>
                <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#9fb2d9" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} stroke="#9fb2d9" />
                <Tooltip content={<CaseChartTooltip />} />
                <Bar dataKey="total" fill="#23b0ff" radius={[8, 8, 0, 0]} name="Cases" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {selectedAnalystProfile ? (
        <div className="cards-grid" style={{ marginTop: 16 }}>
          <SummaryCard label={`${selectedAnalystProfile.analyst} Total Cases`} value={String(selectedAnalystProfile.total)} tone="#8ddcff" />
          <SummaryCard label="Current Open" value={String(selectedAnalystProfile.open)} tone="#f0ad4e" />
          <SummaryCard label="Current Escalated" value={String(selectedAnalystProfile.escalated)} tone="#f54b64" />
          <SummaryCard label="Breached Assigned" value={String(selectedAnalystProfile.breached)} tone="#ff7b8c" />
          <SummaryCard label="Resolved" value={String(selectedAnalystProfile.resolved)} tone="#20c997" />
        </div>
      ) : null}

      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div className="mini-panel">
          <div className="detail-title">Analyst Compare Mode</div>
          <div className="detail-list">
            <label className="muted">Primary Analyst</label>
            <select className="settings-select" value={applied.assignee} onChange={(e) => applyAssigneeDrilldown(e.target.value)}>
              <option value="">Select analyst</option>
              {analystOptions.map((name) => <option key={`cases-primary-${name}`} value={name}>{name}</option>)}
            </select>
            <label className="muted">Compare With</label>
            <select className="settings-select" value={compareAnalyst} onChange={(e) => setCompareAnalyst(e.target.value)}>
              <option value="">Select analyst</option>
              {analystOptions.filter((name) => name !== applied.assignee).map((name) => <option key={`cases-compare-${name}`} value={name}>{name}</option>)}
            </select>
          </div>
        </div>
        <div className="mini-panel">
          <div className="detail-title">Compare Snapshot</div>
          {selectedAnalystProfile && compareAnalystProfile ? (
            <div className="detail-list">
              <DetailRow label="Open" value={`${selectedAnalystProfile.analyst}: ${selectedAnalystProfile.open} | ${compareAnalystProfile.analyst}: ${compareAnalystProfile.open}`} />
              <DetailRow label="Escalated" value={`${selectedAnalystProfile.analyst}: ${selectedAnalystProfile.escalated} | ${compareAnalystProfile.analyst}: ${compareAnalystProfile.escalated}`} />
              <DetailRow label="Breached" value={`${selectedAnalystProfile.analyst}: ${selectedAnalystProfile.breached} | ${compareAnalystProfile.analyst}: ${compareAnalystProfile.breached}`} />
              <DetailRow label="Resolved" value={`${selectedAnalystProfile.analyst}: ${selectedAnalystProfile.resolved} | ${compareAnalystProfile.analyst}: ${compareAnalystProfile.resolved}`} />
            </div>
          ) : (
            <div className="muted">Choose two analysts to compare their current case queue side by side.</div>
          )}
        </div>
      </div>

      {selectedAnalystProfile && compareAnalystProfile ? (
        <div className="section" style={{ marginTop: 16, background: "#0f1a2b", minWidth: 0 }}>
          <h3 style={{ marginTop: 0 }}>Analyst Compare Chart</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            {selectedAnalystProfile.analyst} versus {compareAnalystProfile.analyst} across current case metrics.
          </p>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={compareChartData}>
                <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
                <XAxis dataKey="metric" stroke="#9fb2d9" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} stroke="#9fb2d9" />
                <Tooltip content={<CaseChartTooltip />} />
                <Bar dataKey="primary" fill="#4361ee" radius={[8, 8, 0, 0]} name={selectedAnalystProfile.analyst} />
                <Bar dataKey="secondary" fill="#23b0ff" radius={[8, 8, 0, 0]} name={compareAnalystProfile.analyst} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="table-heading" style={{ marginTop: 12 }}>
            <div className="muted">Export this focused compare snapshot for reporting or review.</div>
            <div className="table-heading-right">
              <button className="pill" onClick={exportCompareSnapshotPdf}>Compare PDF</button>
              <button className="pill" onClick={exportCompareSnapshotExcel}>Compare Excel</button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedAnalystProfile ? (
        <div className="cards-grid" style={{ marginTop: 16 }}>
          <SummaryCard label={`${selectedAnalystProfile.analyst} Total Cases`} value={String(selectedAnalystProfile.total)} tone="#8ddcff" />
          <SummaryCard label="Current Open" value={String(selectedAnalystProfile.open)} tone="#f0ad4e" />
          <SummaryCard label="Current Escalated" value={String(selectedAnalystProfile.escalated)} tone="#f54b64" />
          <SummaryCard label="Breached Assigned" value={String(selectedAnalystProfile.breached)} tone="#ff7b8c" />
          <SummaryCard label="Resolved" value={String(selectedAnalystProfile.resolved)} tone="#20c997" />
        </div>
      ) : null}

      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div className="section" style={{ background: "#0f1a2b", minWidth: 0 }}>
          <div className="table-heading">
            <div>
              <h3 style={{ margin: 0 }}>Analyst Performance Trends</h3>
              <p className="muted" style={{ margin: "6px 0 0" }}>Resolved and escalated case movement over the latest visible dates.</p>
            </div>
          </div>
          <div style={{ width: "100%", height: 260, marginTop: 12 }}>
            <ResponsiveContainer>
              <LineChart data={analystPerformanceTrend}>
                <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#9fb2d9" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} stroke="#9fb2d9" />
                <Tooltip content={<CaseChartTooltip />} />
                <Line type="monotone" dataKey="resolved" stroke="#20c997" strokeWidth={3} dot={{ r: 3 }} name="Resolved" />
                <Line type="monotone" dataKey="escalated" stroke="#f54b64" strokeWidth={3} dot={{ r: 3 }} name="Escalated" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="mini-panel">
          <div className="detail-title">SLA Breach Heatmap</div>
          {breachHeatmap.some((row) => row.values.some((cell) => cell.total > 0)) ? (
            <div className="matrix-grid" style={{ gridTemplateColumns: `140px repeat(${breachHeatmap[0]?.values.length || 1}, minmax(0, 1fr))` }}>
              <div className="matrix-cell matrix-head">Severity</div>
              {(breachHeatmap[0]?.values || []).map((cell) => (
                <div key={`head-${cell.analyst}`} className="matrix-cell matrix-head">{cell.analyst}</div>
              ))}
              {breachHeatmap.flatMap((row) => ([
                <div key={`label-${row.severity}`} className="matrix-cell matrix-label">{row.severity}</div>,
                ...row.values.map((cell) => (
                  <div
                    key={`${row.severity}-${cell.analyst}`}
                    className="matrix-cell"
                    style={heatmapCellStyle(cell.total)}
                  >
                    {cell.total}
                  </div>
                ))
              ]))}
            </div>
          ) : (
            <div className="muted">No breached-case heatmap data for the current filters.</div>
          )}
        </div>
      </div>

      <div className="filter-grid" style={{ marginTop: 16 }}>
        <input placeholder="Search transaction, rule, location, assignee" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} style={inputStyle} />
        <select value={filters.severity} onChange={(e) => setFilters((prev) => ({ ...prev, severity: e.target.value }))} style={inputStyle}>
          <option value="ALL">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
        </select>
        <select value={filters.caseStatus} onChange={(e) => setFilters((prev) => ({ ...prev, caseStatus: e.target.value }))} style={inputStyle}>
          <option value="ALL">All Case Statuses</option>
          {caseStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select value={filters.sla} onChange={(e) => setFilters((prev) => ({ ...prev, sla: e.target.value }))} style={inputStyle}>
          <option value="ALL">All SLA States</option>
          <option value="BREACHED">Breached</option>
          <option value="DUE_SOON">Due Soon</option>
          <option value="WITHIN_SLA">Within SLA</option>
        </select>
        <input placeholder="Assigned Analyst" value={filters.assignee} onChange={(e) => setFilters((prev) => ({ ...prev, assignee: e.target.value }))} style={inputStyle} />
        <select value={filters.readState} onChange={(e) => setFilters((prev) => ({ ...prev, readState: e.target.value }))} style={inputStyle}>
          <option value="ALL">All Read States</option>
          <option value="UNREAD">Unread</option>
          <option value="READ">Read</option>
        </select>
        <div className="action-row">
          <button className="btn-accent" onClick={applyFilters}>Apply</button>
          <button className="pill" onClick={clearFilters}>Clear</button>
        </div>
      </div>

      <div className="table-heading" style={{ marginTop: 16 }}>
        <div>
          <h3 style={{ margin: 0 }}>Operational Analytics Export</h3>
          <p className="muted" style={{ margin: "6px 0 0" }}>Download the leaderboard, trend, heatmap, and current analyst drill-down summary.</p>
        </div>
        <div className="table-heading-right">
          <button className="pill" onClick={exportOperationsSnapshotPdf}>Download Ops PDF</button>
          <button className="pill" onClick={exportOperationsSnapshotExcel}>Download Ops Excel</button>
        </div>
      </div>

      <ReportingWorkspacePanel
        title="Reporting Lifecycle"
        description="Save schedules, review backend execution history, and manage delivery retries for case operations reporting."
        scheduleDraft={scheduleDraft}
        setScheduleDraft={setScheduleDraft}
        scheduleBusy={scheduleBusy}
        reportTemplates={reportTemplates}
        reportSchedules={reportSchedules}
        reportRunHistory={reportRunHistory}
        deliveryEntries={deliveryEntries}
        deliveryStatusFilter={deliveryStatusFilter}
        setDeliveryStatusFilter={setDeliveryStatusFilter}
        deliveryRangeFilter={deliveryRangeFilter}
        setDeliveryRangeFilter={setDeliveryRangeFilter}
        onSaveSchedule={saveReportSchedule}
        onApplyTemplate={applyReportTemplate}
        onRemoveSchedule={removeReportSchedule}
        onToggleSchedule={toggleReportSchedule}
        onRunSchedule={runScheduledExport}
        onRetryDelivery={retryDelivery}
      />

      <div className="section" style={{ marginTop: 16, background: "#0f1a2b" }}>
        <div className="table-heading">
          <div>
            <h3 style={{ margin: 0 }}>Bulk Case Actions</h3>
            <p className="muted" style={{ margin: "6px 0 0" }}>Select multiple cases to assign or move them through the workflow together.</p>
          </div>
          <div className="cards-inline">
            <span className="chip approved">Selected: {selectedIds.length}</span>
            {bulkAllowedTransitions.length ? <span className="chip low">Shared transitions: {bulkAllowedTransitions.join(", ")}</span> : null}
          </div>
        </div>
        {bulkFeedback ? (
          <div className="mini-panel" style={{ marginTop: 16, borderColor: bulkFeedback.tone === "error" ? "rgba(245,75,100,0.38)" : bulkFeedback.tone === "warning" ? "rgba(240,173,78,0.38)" : "rgba(32,201,151,0.34)" }}>
            <div className="muted">{bulkFeedback.message}</div>
          </div>
        ) : null}
        <div className="detail-grid" style={{ marginTop: 16 }}>
          <div className="mini-panel">
            <div className="detail-title">Bulk Assignment</div>
            <select value={bulkAssignEmail} onChange={(e) => setBulkAssignEmail(e.target.value)} className="settings-select" style={{ marginBottom: 12 }}>
              <option value="">Select assignee</option>
              {users.map((user) => (
                <option key={user.email} value={user.email}>
                  {user.userName} ({user.role})
                </option>
              ))}
            </select>
            <button className="btn-accent" onClick={() => void bulkAssign()} disabled={busy || !bulkAssignEmail || !selectedIds.length}>
              Assign Selected Cases
            </button>
          </div>
          <div className="mini-panel">
            <div className="detail-title">Bulk Status Update</div>
            <select value={bulkStatusDraft} onChange={(e) => setBulkStatusDraft(e.target.value)} className="settings-select" style={{ marginBottom: 12 }}>
              {bulkAllowedTransitions.length ? bulkAllowedTransitions.map((status) => <option key={status} value={status}>{status}</option>) : <option value="IN_REVIEW">No shared transitions</option>}
            </select>
            <textarea className="settings-textarea" value={bulkStatusDetail} onChange={(e) => setBulkStatusDetail(e.target.value)} placeholder="Optional note for this bulk update" />
            <button className="pill" style={{ marginTop: 12 }} onClick={() => void bulkUpdateStatus()} disabled={busy || !selectedIds.length || !bulkAllowedTransitions.length}>
              Update Selected Cases
            </button>
          </div>
          <div className="mini-panel">
            <div className="detail-title">Bulk Notes & Close</div>
            <textarea className="settings-textarea" value={bulkNoteDraft} onChange={(e) => setBulkNoteDraft(e.target.value)} placeholder="Append the same analyst note to all selected cases" />
            <button className="btn-accent" style={{ marginTop: 12 }} onClick={() => void bulkAppendNote()} disabled={busy || !selectedIds.length || !bulkNoteDraft.trim()}>
              Append Note to Selected
            </button>
            <button className="pill logout" style={{ marginTop: 12 }} onClick={() => void bulkCloseCases()} disabled={busy || !selectedIds.length || !bulkAllowedTransitions.includes("RESOLVED")}>
              Close Selected Cases
            </button>
          </div>
        </div>
      </div>

      <div className="table-heading" style={{ marginTop: 16 }}>
        <div className="cards-inline">
          <span className="chip approved">Cases: {filteredCases.length}</span>
          <span className="chip medium">Assigned: {filteredCases.filter((item) => !!item.assignedToName).length}</span>
          <span className="chip low">Unread: {filteredCases.filter((item) => item.actionType === "UNREAD").length}</span>
        </div>
        <div className="table-heading-right">
          <button className="pill" onClick={() => downloadPdf("case-management", headers, exportRows(filteredCases))}>Download PDF</button>
          <button className="pill" onClick={() => downloadExcel("case-management", headers, exportRows(filteredCases))}>Download Excel</button>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all visible cases" />
              </th>
              <th>Transaction ID</th>
              <th>Severity</th>
              <th>Decision</th>
              <th>Case Status</th>
              <th>Assigned To</th>
              <th>Created</th>
              <th>Age</th>
              <th>SLA</th>
              <th>Location</th>
              <th>Rule</th>
              <th>Read State</th>
              <th>View</th>
            </tr>
          </thead>
          <tbody>
            {filteredCases.map((item) => {
              const checked = !!item.transactionId && selectedIds.includes(item.transactionId);
              return (
                <tr key={item.transactionId} className={checked ? "case-row-selected" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => item.transactionId && toggleSelected(item.transactionId)}
                      aria-label={`Select case ${item.transactionId}`}
                    />
                  </td>
                  <td>{item.transactionId}</td>
                  <td><span className={`chip ${priorityClass(item.priority || item.riskLevel)}`}>{item.priority || item.riskLevel || "-"}</span></td>
                  <td><span className={`chip ${statusClass((item.decisionOutcome || "REVIEW").toUpperCase())}`}>{item.decisionOutcome || "REVIEW"}</span></td>
                  <td>{item.caseStatus || "OPEN"}</td>
                  <td>{item.assignedToName || item.assignedToEmail || "-"}</td>
                  <td>{item.evaluatedAt ? new Date(item.evaluatedAt).toLocaleString() : "-"}</td>
                  <td>{formatCaseAge(item.evaluatedAt)}</td>
                  <td><span className={`chip ${slaClass(item)}`}>{slaLabel(item)}</span></td>
                  <td>{item.location || "-"}</td>
                  <td>{item.ruleTriggered || "-"}</td>
                  <td>{item.actionType || "UNREAD"}</td>
                  <td><button className="btn-accent" style={{ boxShadow: "none", padding: "8px 12px" }} onClick={() => item.transactionId && openCase(item.transactionId)}>Open</button></td>
                </tr>
              );
            })}
            {!filteredCases.length ? (
              <tr>
                <td colSpan={13} className="muted" style={{ textAlign: "center" }}>No cases match the current filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedCase ? (
        <div className="section transaction-detail-panel" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0 }}>Case Workspace</h3>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Full case ownership, decision reasoning, and investigation history for {selectedCase.transactionId}.
              </p>
            </div>
            <div className="cards-inline">
              <span className={`chip ${priorityClass(selectedCase.priority || selectedCase.riskLevel)}`}>{selectedCase.priority || selectedCase.riskLevel || "-"}</span>
              <span className="chip approved">{selectedCase.decisionOutcome || "REVIEW"}</span>
              <span className="chip medium">{selectedCase.caseStatus || "OPEN"}</span>
              <button className="pill" onClick={closeCase}>Close</button>
            </div>
          </div>

          <div className="detail-grid" style={{ marginTop: 16 }}>
            <div className="mini-panel">
              <div className="detail-title">Case Summary</div>
              <div className="detail-list">
                <DetailRow label="Transaction ID" value={selectedCase.transactionId || "-"} />
                <DetailRow label="Risk Score" value={formatScore(selectedCase.riskScore)} />
                <DetailRow label="Decision Outcome" value={selectedCase.decisionOutcome || "REVIEW"} />
                <DetailRow label="Case Status" value={selectedCase.caseStatus || "OPEN"} />
                <DetailRow label="Assigned To" value={selectedCase.assignedToName || selectedCase.assignedToEmail || "Unassigned"} />
                <DetailRow label="Created" value={selectedCase.evaluatedAt ? new Date(selectedCase.evaluatedAt).toLocaleString() : "-"} />
                <DetailRow label="Age" value={formatCaseAge(selectedCase.evaluatedAt)} />
                <DetailRow label="SLA" value={slaLabel(selectedCase)} />
                <DetailRow label="Read State" value={selectedCase.actionType || "UNREAD"} />
              </div>
            </div>

            <div className="mini-panel">
              <div className="detail-title">Decision Explanation</div>
              <DecisionExplanationList
                items={selectedCase.decisionExplanationItems}
                summaries={selectedCase.decisionExplanations}
                emptyText="No explanation stored yet for this case."
                labelPrefix="Reason"
              />
            </div>
          </div>

          <div className="detail-grid" style={{ marginTop: 16 }}>
            <div className="mini-panel">
              <div className="detail-title">Assignment & Status</div>
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
                <button className="btn-accent" onClick={() => void assignSelected()} disabled={busy || !assignEmail}>
                  Save Assignment
                </button>
                <label className="muted" style={{ marginTop: 16 }}>Case Status</label>
                <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)} className="settings-select" style={{ marginBottom: 12 }}>
                  {selectedCaseStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <textarea className="settings-textarea" value={statusDetail} onChange={(e) => setStatusDetail(e.target.value)} placeholder="Add a reason for the status update" />
                <button className="pill" style={{ marginTop: 12 }} onClick={() => void updateStatus()} disabled={busy || !selectedCase || statusDraft === (selectedCase.caseStatus || "OPEN")}>
                  Save Status
                </button>
                {selectedCase?.allowedCaseTransitions?.length === 0 ? <div className="muted" style={{ marginTop: 10 }}>This case has no further workflow transitions available.</div> : null}
              </div>
            </div>

            <div className="mini-panel">
              <div className="detail-title">Investigation Notes</div>
              <textarea
                className="settings-textarea"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Capture customer contact, analyst observations, and resolution steps"
              />
              <button className="btn-accent" style={{ marginTop: 12 }} onClick={() => void saveNote()} disabled={busy || !noteDraft.trim()}>
                Save Note
              </button>
              {selectedCase.latestCaseNote ? (
                <div style={{ marginTop: 16 }}>
                  <div className="detail-title" style={{ fontSize: 12, marginBottom: 8 }}>Latest Note</div>
                  <div className="muted">{selectedCase.latestCaseNote}</div>
                </div>
              ) : (
                <div className="muted" style={{ marginTop: 16 }}>No notes recorded yet.</div>
              )}
            </div>
          </div>

          <div className="mini-panel" style={{ marginTop: 16 }}>
            <div className="detail-title">Timeline</div>
            <div className="detail-activity-list">
              {timeline.length ? timeline.map((item) => (
                <div key={`${item.auditId}-${item.happenedAt}`} className="detail-activity-item">
                  <div>
                    <strong>{item.actionType}</strong>
                    <div className="muted">{item.detail || "Case activity recorded."}</div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      {formatTimelineActor(item)}{item.assignedToName ? ` -> ${item.assignedToName}` : ""}{item.caseStatus ? ` | ${item.caseStatus}` : ""}
                    </div>
                    {item.bulkOperationId ? <div className="muted">Bulk operation: {item.bulkOperationId}</div> : null}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div>{item.happenedAt ? new Date(item.happenedAt).toLocaleString() : "-"}</div>
                    {item.readTimestamp ? <div className="muted">Read at {new Date(item.readTimestamp).toLocaleString()}</div> : null}
                  </div>
                </div>
              )) : <div className="muted">No timeline entries captured yet.</div>}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function readFilters(searchParams: URLSearchParams): Filters {
  return {
    search: searchParams.get("search") || "",
    severity: searchParams.get("severity") || "ALL",
    caseStatus: searchParams.get("caseStatus") || "ALL",
    sla: searchParams.get("sla") || "ALL",
    assignee: searchParams.get("assignee") || "",
    readState: searchParams.get("readState") || "ALL"
  };
}

function buildSearchParams(filters: Filters, transactionId?: string | null) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.severity !== "ALL") params.set("severity", filters.severity);
  if (filters.caseStatus !== "ALL") params.set("caseStatus", filters.caseStatus);
  if (filters.sla !== "ALL") params.set("sla", filters.sla);
  if (filters.assignee) params.set("assignee", filters.assignee);
  if (filters.readState !== "ALL") params.set("readState", filters.readState);
  if (transactionId) params.set("transactionId", transactionId);
  return params;
}

function dedupeCases(items: AlertLifecycle[]) {
  const map = new Map<string, AlertLifecycle>();
  items.forEach((item) => {
    if (!item.transactionId) return;
    const existing = map.get(item.transactionId);
    if (!existing) {
      map.set(item.transactionId, item);
      return;
    }
    const existingTime = new Date(existing.readTimestamp || existing.evaluatedAt || 0).getTime();
    const nextTime = new Date(item.readTimestamp || item.evaluatedAt || 0).getTime();
    if (nextTime >= existingTime) {
      map.set(item.transactionId, { ...existing, ...item });
    }
  });
  return Array.from(map.values());
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value" style={{ color: tone }}>{value}</div>
    </div>
  );
}

function CaseChartTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((item) => (
        <div key={item.name || item.value} className="chart-tooltip-value">
          {item.name ? `${item.name}: ` : ""}{Number(item.value || 0)}
        </div>
      ))}
    </div>
  );
}

function priorityClass(priority?: string | null) {
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

function normalizeSeverity(priority: string) {
  const value = priority.toUpperCase();
  if (value.includes("CRITICAL")) return "CRITICAL";
  if (value.includes("HIGH")) return "HIGH";
  if (value.includes("MEDIUM")) return "MEDIUM";
  return "LOW";
}

function severityChipClass(severity: string) {
  if (severity === "CRITICAL" || severity === "HIGH") return "high";
  if (severity === "MEDIUM") return "medium";
  return "low";
}

function formatLeaderValue(
  item: { analyst: string; cases: number; escalations: number; resolved: number } | undefined,
  key: "cases" | "escalations" | "resolved"
) {
  if (!item) return "No data";
  return `${item.analyst} (${item[key]})`;
}

function heatmapCellStyle(total: number): React.CSSProperties {
  if (total <= 0) {
    return {
      background: "rgba(9,17,29,0.72)",
      color: "#9fb2d9"
    };
  }
  if (total >= 5) {
    return {
      background: "rgba(245,75,100,0.28)",
      color: "#ffd7de",
      borderColor: "rgba(245,75,100,0.36)"
    };
  }
  if (total >= 3) {
    return {
      background: "rgba(240,173,78,0.22)",
      color: "#ffe2ae",
      borderColor: "rgba(240,173,78,0.34)"
    };
  }
  return {
    background: "rgba(35,176,255,0.18)",
    color: "#d9f5ff",
    borderColor: "rgba(35,176,255,0.28)"
  };
}

function formatScore(score?: number) {
  return score != null ? Number(score).toFixed(3) : "-";
}

const inputStyle: React.CSSProperties = {
  background: "#0f1a2b",
  color: "#e8eefc",
  border: "1px solid #1f2a44",
  borderRadius: 10,
  padding: "12px 14px",
  minWidth: 180
};

const headers = ["Transaction ID", "Severity", "Decision", "Case Status", "Assigned To", "Created", "Age", "SLA", "Location", "Rule", "Read State"];
const operationsHeaders = ["Section", "Label", "Value"];

function exportRows(rows: AlertLifecycle[]) {
  return rows.map((item) => ([
    item.transactionId || "-",
    item.priority || item.riskLevel || "-",
    item.decisionOutcome || "REVIEW",
    item.caseStatus || "OPEN",
    item.assignedToName || item.assignedToEmail || "-",
    item.evaluatedAt ? new Date(item.evaluatedAt).toLocaleString() : "-",
    formatCaseAge(item.evaluatedAt),
    slaLabel(item),
    item.location || "-",
    item.ruleTriggered || "-",
    item.actionType || "UNREAD"
  ]));
}

function formatCaseAge(value?: string | null) {
  if (!value) return "-";
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ${diffMinutes % 60}m`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ${diffHours % 24}h`;
}

function slaLabel(item: AlertLifecycle) {
  if ((item.caseStatus || "OPEN") === "RESOLVED") {
    return "Within SLA";
  }
  if (isSlaBreached(item)) {
    return "Breach";
  }
  if (isSlaDueSoon(item)) {
    return "Due Soon";
  }
  return "Within SLA";
}

function slaClass(item: AlertLifecycle) {
  if ((item.caseStatus || "OPEN") === "RESOLVED") {
    return "approved";
  }
  if (isSlaBreached(item)) {
    return "high";
  }
  if (isSlaDueSoon(item)) {
    return "medium";
  }
  return "approved";
}

function isSlaBreached(item: AlertLifecycle) {
  const thresholdHours = getSlaThresholdHours(item);
  if (!thresholdHours || !item.evaluatedAt || (item.caseStatus || "OPEN") === "RESOLVED") return false;
  const ageHours = (Date.now() - new Date(item.evaluatedAt).getTime()) / 3_600_000;
  return ageHours > thresholdHours;
}

function isSlaDueSoon(item: AlertLifecycle) {
  const thresholdHours = getSlaThresholdHours(item);
  if (!thresholdHours || !item.evaluatedAt || (item.caseStatus || "OPEN") === "RESOLVED" || isSlaBreached(item)) {
    return false;
  }
  const remainingHours = thresholdHours - ((Date.now() - new Date(item.evaluatedAt).getTime()) / 3_600_000);
  const severity = (item.priority || item.riskLevel || "").toUpperCase();
  if (severity.includes("CRITICAL")) return remainingHours <= 0.25;
  if (severity.includes("HIGH")) return remainingHours <= 1;
  return remainingHours <= 6;
}

function getSlaThresholdHours(item: AlertLifecycle) {
  if (!item.evaluatedAt) return undefined;
  const severity = (item.priority || item.riskLevel || "").toUpperCase();
  if (severity.includes("CRITICAL")) return 1;
  if (severity.includes("HIGH")) return 4;
  return 24;
}

function buildOperationsRows({
  leaderboard,
  trend,
  heatmap,
  selectedAnalystProfile,
  preset = "ALL_OPS"
}: {
  leaderboard: {
    highestWorkload?: { analyst: string; cases: number; escalations: number; resolved: number };
    mostEscalations?: { analyst: string; cases: number; escalations: number; resolved: number };
    fastestResolved?: { analyst: string; cases: number; escalations: number; resolved: number };
  };
  trend: Array<{ label: string; resolved: number; escalated: number }>;
  heatmap: Array<{ severity: string; values: Array<{ analyst: string; total: number }> }>;
  selectedAnalystProfile?: { analyst: string; total: number; open: number; escalated: number; breached: number; resolved: number } | null;
  preset?: string;
}) {
  const allRows: Array<Array<string | number>> = [
    ["Leaderboard", "Highest workload", formatLeaderValue(leaderboard.highestWorkload, "cases")],
    ["Leaderboard", "Most escalations", formatLeaderValue(leaderboard.mostEscalations, "escalations")],
    ["Leaderboard", "Fastest resolved", formatLeaderValue(leaderboard.fastestResolved, "resolved")]
  ];

  trend.forEach((point) => {
    allRows.push(["Trend", `${point.label} resolved`, point.resolved]);
    allRows.push(["Trend", `${point.label} escalated`, point.escalated]);
  });

  heatmap.forEach((row) => {
    row.values.forEach((cell) => {
      allRows.push(["Heatmap", `${row.severity} / ${cell.analyst}`, cell.total]);
    });
  });

  if (selectedAnalystProfile) {
    allRows.push(["Analyst Focus", "Analyst", selectedAnalystProfile.analyst]);
    allRows.push(["Analyst Focus", "Total Cases", selectedAnalystProfile.total]);
    allRows.push(["Analyst Focus", "Current Open", selectedAnalystProfile.open]);
    allRows.push(["Analyst Focus", "Current Escalated", selectedAnalystProfile.escalated]);
    allRows.push(["Analyst Focus", "Breached Assigned", selectedAnalystProfile.breached]);
    allRows.push(["Analyst Focus", "Resolved", selectedAnalystProfile.resolved]);
  }

  switch (preset) {
    case "BREACHED_ONLY":
      return allRows.filter((row) => row[0] === "Heatmap" || String(row[1]).toLowerCase().includes("breached"));
    case "ESCALATED_ONLY":
      return allRows.filter((row) => String(row[1]).toLowerCase().includes("escalated"));
    case "FOCUSED_ANALYST_ONLY":
      return allRows.filter((row) => row[0] === "Analyst Focus").length
        ? allRows.filter((row) => row[0] === "Analyst Focus")
        : [["Analyst Focus", "Status", "No focused analyst selected"]];
    case "ALL_OPS":
    default:
      return allRows;
  }
}

function buildCompareRows(
  primary: { analyst: string; total: number; open: number; escalated: number; breached: number; resolved: number },
  secondary: { analyst: string; total: number; open: number; escalated: number; breached: number; resolved: number }
) {
  return [
    ["Compare", "Primary Analyst", primary.analyst],
    ["Compare", "Secondary Analyst", secondary.analyst],
    ["Compare", "Total Cases", `${primary.analyst}: ${primary.total} | ${secondary.analyst}: ${secondary.total}`],
    ["Compare", "Open", `${primary.analyst}: ${primary.open} | ${secondary.analyst}: ${secondary.open}`],
    ["Compare", "Escalated", `${primary.analyst}: ${primary.escalated} | ${secondary.analyst}: ${secondary.escalated}`],
    ["Compare", "Breached", `${primary.analyst}: ${primary.breached} | ${secondary.analyst}: ${secondary.breached}`],
    ["Compare", "Resolved", `${primary.analyst}: ${primary.resolved} | ${secondary.analyst}: ${secondary.resolved}`]
  ];
}
