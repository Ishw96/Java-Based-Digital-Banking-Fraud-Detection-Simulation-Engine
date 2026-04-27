import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from "recharts";
import { getAdminSettingsProfile, getAlerts, getDashboardOverview, getTransactions } from "../services/alertService";
import type { DashboardOverview, TransactionRecord } from "../services/alertService";
import { type Alert } from "../types/Alert";
import AlertsTable from "../components/AlertsTable";
import GeoHeatmap from "../components/GeoHeatmap";
import TransactionStream from "../components/TransactionStream";
import TopRulesChart from "../components/TopRulesChart";
import RiskChart from "../components/RiskChart";
import { connectAlerts } from "../services/websocketService";
import { formatCurrency } from "../utils/security";
import { useAppSettings } from "../context/AppSettingsContext";
import { shouldShowDashboardWidget } from "../settings/appSettings";
import { shouldMaskSensitiveData } from "../settings/appSettings";
import { downloadExcel, downloadPdf } from "../utils/export";
import { resolveReportTemplates, type DeliveryLogEntry, type ReportRunEntry, type ReportingSchedule, type ReportTemplate } from "../utils/reporting";
import ReportingWorkspacePanel from "../components/ReportingWorkspacePanel";
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

const chartColors = ["#4361ee", "#20c997", "#f0ad4e", "#f54b64", "#8ddcff"];
const operationsHeaders = ["Section", "Label", "Value"];

export default function Dashboard({ syncKey }: { syncKey?: string }) {
  const navigate = useNavigate();
  const { role, settings } = useAppSettings();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [adminSettings, setAdminSettings] = useState<Record<string, unknown> | null>(null);
  const [selectedAnalyst, setSelectedAnalyst] = useState<string>("");
  const [compareAnalyst, setCompareAnalyst] = useState<string>("");
  const [scheduleDraft, setScheduleDraft] = useState({
    name: "Daily Dashboard Ops Snapshot",
    cadence: "DAILY",
    hour: "09:00",
    format: "PDF",
    recipients: "",
    preset: "ALL_OPS",
    scope: "DASHBOARD"
  });
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState("ALL");
  const [deliveryRangeFilter, setDeliveryRangeFilter] = useState("ALL_TIME");
  const [reportSchedules, setReportSchedules] = useState<ReportingSchedule[]>([]);
  const [reportRunHistory, setReportRunHistory] = useState<ReportRunEntry[]>([]);
  const [deliveryEntries, setDeliveryEntries] = useState<DeliveryLogEntry[]>([]);
  const [filters, setFilters] = useState({
    transactionId: "",
    transactionType: "",
    ruleTriggered: "",
    minRiskScore: "",
    priority: "ALL"
  });

  useEffect(() => {
    const load = async () => {
      const [nextAlerts, nextOverview, nextTransactions, nextSchedules, nextRuns, nextDeliveries] = await Promise.all([
        getAlerts(),
        getDashboardOverview(),
        getTransactions(),
        getReportingSchedules("DASHBOARD").catch(() => []),
        getReportingRuns("DASHBOARD").catch(() => []),
        getReportingDeliveries("DASHBOARD").catch(() => [])
      ]);
      setAlerts(nextAlerts);
      setOverview(nextOverview);
      setTransactions(nextTransactions);
      setReportSchedules(nextSchedules);
      setReportRunHistory(nextRuns);
      setDeliveryEntries(nextDeliveries);
    };
    void load();
  }, [syncKey]);

  useEffect(() => {
    const disconnect = connectAlerts((alert) => {
      setAlerts((prev) => [alert, ...prev]);
      window.dispatchEvent(new Event("fraud:sync"));
    });
    return () => disconnect();
  }, []);

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

  const criticalAlerts = useMemo(
    () => alerts.filter((a) => (a.priority || "").toUpperCase().includes("CRITICAL") || (a.riskLevel || "").toUpperCase().includes("CRITICAL")).length,
    [alerts]
  );
  const highAlerts = useMemo(
    () => alerts.filter((a) => (a.priority || "").toUpperCase().includes("HIGH") || (a.riskLevel || "").toUpperCase().includes("HIGH")).length,
    [alerts]
  );
  const mediumAlerts = useMemo(
    () => alerts.filter((a) => (a.priority || "").toUpperCase().includes("MEDIUM")).length,
    [alerts]
  );
  const lowAlerts = useMemo(
    () => alerts.filter((a) => (a.priority || "").toUpperCase().includes("LOW")).length,
    [alerts]
  );

  const totalVolume = useMemo(
    () => transactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
    [transactions]
  );
  const fraudulentVolume = useMemo(
    () => transactions.filter((tx) => tx.fraudDetected).reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
    [transactions]
  );
  const fraudPercentage = useMemo(() => {
    if (!overview?.totalTransactions) return 0;
    return Number(((overview.totalAlerts / overview.totalTransactions) * 100).toFixed(2));
  }, [overview]);
  const openCases = useMemo(
    () => transactions.filter((tx) => (tx.caseStatus || "OPEN") === "OPEN").length,
    [transactions]
  );
  const inReviewCases = useMemo(
    () => transactions.filter((tx) => tx.caseStatus === "IN_REVIEW").length,
    [transactions]
  );
  const escalatedCases = useMemo(
    () => transactions.filter((tx) => tx.caseStatus === "ESCALATED").length,
    [transactions]
  );
  const resolvedCases = useMemo(
    () => transactions.filter((tx) => tx.caseStatus === "RESOLVED").length,
    [transactions]
  );
  const breachedCases = useMemo(
    () => transactions.filter((tx) => isTransactionSlaBreached(tx)).length,
    [transactions]
  );
  const dueSoonCases = useMemo(
    () => transactions.filter((tx) => isTransactionSlaDueSoon(tx)).length,
    [transactions]
  );

  const casesPerAnalyst = useMemo(() => {
    const grouped = new Map<string, number>();
    transactions.forEach((tx) => {
      if (!tx.caseStatus) return;
      const key = tx.assignedToName || "Unassigned";
      grouped.set(key, (grouped.get(key) || 0) + 1);
    });
    return Array.from(grouped.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [transactions]);

  const escalationsByAnalyst = useMemo(() => {
    const grouped = new Map<string, number>();
    transactions
      .filter((tx) => tx.caseStatus === "ESCALATED")
      .forEach((tx) => {
        const key = tx.assignedToName || "Unassigned";
        grouped.set(key, (grouped.get(key) || 0) + 1);
      });
    return Array.from(grouped.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [transactions]);

  const breachesLast24Hours = useMemo(() => {
    const cutoff = Date.now() - 24 * 3_600_000;
    return transactions.filter((tx) => {
      if (!tx.transactionTime || !isTransactionSlaBreached(tx)) return false;
      return new Date(tx.transactionTime).getTime() >= cutoff;
    }).length;
  }, [transactions]);

  const dueSoonBySeverity = useMemo(() => {
    const grouped = new Map<string, number>();
    transactions.filter((tx) => isTransactionSlaDueSoon(tx)).forEach((tx) => {
      const severity = normalizeTransactionSeverity(tx.priority || tx.riskLevel || "MEDIUM");
      grouped.set(severity, (grouped.get(severity) || 0) + 1);
    });
    return ["CRITICAL", "HIGH", "MEDIUM"].map((severity) => ({
      severity,
      total: grouped.get(severity) || 0
    }));
  }, [transactions]);

  const analystLeaderboard = useMemo(() => {
    const grouped = new Map<string, { analyst: string; cases: number; escalations: number; resolved: number }>();
    transactions.forEach((tx) => {
      if (!tx.caseStatus) return;
      const analyst = tx.assignedToName || "Unassigned";
      const current = grouped.get(analyst) || { analyst, cases: 0, escalations: 0, resolved: 0 };
      current.cases += 1;
      if ((tx.caseStatus || "OPEN") === "ESCALATED") current.escalations += 1;
      if ((tx.caseStatus || "OPEN") === "RESOLVED") current.resolved += 1;
      grouped.set(analyst, current);
    });
    const all = Array.from(grouped.values()).sort((a, b) => b.cases - a.cases);
    const highestWorkload = all[0];
    const mostEscalations = [...all].sort((a, b) => b.escalations - a.escalations || b.cases - a.cases)[0];
    const fastestResolved = [...all]
      .filter((item) => item.resolved > 0)
      .sort((a, b) => b.resolved - a.resolved || a.cases - b.cases)[0];
    return { highestWorkload, mostEscalations, fastestResolved };
  }, [transactions]);

  const agingBuckets = useMemo(() => {
    const buckets = [
      { label: "0-1h", total: 0 },
      { label: "1-4h", total: 0 },
      { label: "4-24h", total: 0 },
      { label: "24h+", total: 0 }
    ];
    transactions.forEach((tx) => {
      if (!tx.caseStatus || !tx.transactionTime || (tx.caseStatus || "OPEN") === "RESOLVED") return;
      const ageHours = (Date.now() - new Date(tx.transactionTime).getTime()) / 3_600_000;
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
  }, [transactions]);

  const analystPerformanceTrend = useMemo(() => {
    const grouped = new Map<string, { label: string; resolved: number; escalated: number }>();
    transactions.forEach((tx) => {
      if (!tx.caseStatus || !tx.transactionTime) return;
      const key = new Date(tx.transactionTime).toLocaleDateString();
      const current = grouped.get(key) || { label: key, resolved: 0, escalated: 0 };
      if ((tx.caseStatus || "OPEN") === "RESOLVED") current.resolved += 1;
      if ((tx.caseStatus || "OPEN") === "ESCALATED") current.escalated += 1;
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).slice(-7);
  }, [transactions]);

  const breachHeatmap = useMemo(() => {
    const analysts = Array.from(new Set(
      transactions
        .filter((tx) => !!tx.caseStatus)
        .map((tx) => tx.assignedToName || "Unassigned")
    )).slice(0, 5);
    const severities = ["CRITICAL", "HIGH", "MEDIUM"];
    return severities.map((severity) => ({
      severity,
      values: analysts.map((analyst) => {
        const total = transactions.filter((tx) => {
          const txAnalyst = tx.assignedToName || "Unassigned";
          return txAnalyst === analyst && normalizeTransactionSeverity(tx.priority || tx.riskLevel || "") === severity && isTransactionSlaBreached(tx);
        }).length;
        return { analyst, total };
      })
    }));
  }, [transactions]);

  const selectedAnalystProfile = useMemo(() => {
    if (!selectedAnalyst) return null;
    return buildAnalystProfile(transactions, selectedAnalyst);
  }, [selectedAnalyst, transactions]);

  const compareAnalystProfile = useMemo(() => {
    if (!compareAnalyst) return null;
    return buildAnalystProfile(transactions, compareAnalyst);
  }, [compareAnalyst, transactions]);

  const analystOptions = useMemo(
    () => Array.from(new Set(transactions.filter((tx) => !!tx.caseStatus).map((tx) => tx.assignedToName || "Unassigned"))).sort(),
    [transactions]
  );

  const reportTemplates = useMemo(
    () => resolveReportTemplates({
      role,
      scope: "DASHBOARD",
      focusedAnalyst: selectedAnalystProfile?.analyst || selectedAnalyst || "",
      viewerSettings: settings,
      adminSettings
    }),
    [role, selectedAnalystProfile?.analyst, selectedAnalyst, settings, adminSettings]
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

  const trendData = useMemo(() => {
    const grouped = new Map<string, { date: string; total: number; fraud: number }>();
    transactions.forEach((tx) => {
      const key = tx.transactionTime ? new Date(tx.transactionTime).toLocaleDateString() : "Unknown";
      const current = grouped.get(key) || { date: key, total: 0, fraud: 0 };
      current.total += 1;
      current.fraud += tx.fraudDetected ? 1 : 0;
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).slice(-7);
  }, [transactions]);

  const fraudTypeData = useMemo(() => {
    const grouped = new Map<string, number>();
    alerts.forEach((alert) => {
      const label = alert.ruleTriggered || alert.riskLevel || alert.priority || "Unknown";
      grouped.set(label, (grouped.get(label) || 0) + 1);
    });
    return Array.from(grouped.entries()).map(([name, value]) => ({ name, value }));
  }, [alerts]);

  const volumeData = useMemo(() => {
    const grouped = new Map<string, { date: string; totalVolume: number; fraudulentVolume: number }>();
    transactions.forEach((tx) => {
      const key = tx.transactionTime ? new Date(tx.transactionTime).toLocaleDateString() : "Unknown";
      const current = grouped.get(key) || { date: key, totalVolume: 0, fraudulentVolume: 0 };
      current.totalVolume += Number(tx.amount || 0);
      current.fraudulentVolume += tx.fraudDetected ? Number(tx.amount || 0) : 0;
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).slice(-7);
  }, [transactions]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const riskScore = Number(alert.riskScore || 0);
      const matchesTransactionId =
        !filters.transactionId || String(alert.transactionId || "").toLowerCase().includes(filters.transactionId.toLowerCase());
      const matchesType =
        !filters.transactionType || (alert.transactionType || "").toLowerCase().includes(filters.transactionType.toLowerCase());
      const matchesRule =
        !filters.ruleTriggered || (alert.ruleTriggered || "").toLowerCase().includes(filters.ruleTriggered.toLowerCase());
      const matchesRisk =
        !filters.minRiskScore || riskScore >= Number(filters.minRiskScore);
      const matchesPriority =
        filters.priority === "ALL" || (alert.priority || "").toUpperCase().includes(filters.priority);
      return matchesTransactionId && matchesType && matchesRule && matchesRisk && matchesPriority;
    });
  }, [alerts, filters]);

  const showSummaryCards = shouldShowDashboardWidget(settings, "showSummaryCards");
  const showRealTimeMetrics = shouldShowDashboardWidget(settings, "showRealTimeMetrics");
  const showFraudTrendChart = shouldShowDashboardWidget(settings, "showFraudTrendChart");
  const showTopRulesChart = shouldShowDashboardWidget(settings, "showTopRulesChart");
  const showTransactionStream = shouldShowDashboardWidget(settings, "showTransactionStream");

  const goToCases = (caseStatus?: string, sla?: string, assignee?: string) => {
    if (!caseStatus && !sla && !assignee) {
      navigate("/cases");
      return;
    }
    const params = new URLSearchParams();
    if (caseStatus) params.set("caseStatus", caseStatus);
    if (sla) params.set("sla", sla);
    if (assignee) params.set("assignee", assignee);
    navigate(`/cases?${params.toString()}`);
  };

  const exportOperationsSnapshotPdf = () => {
    downloadPdf("dashboard-operations-snapshot", operationsHeaders, buildOperationsRows({
      leaderboard: analystLeaderboard,
      trend: analystPerformanceTrend,
      heatmap: breachHeatmap,
      selectedAnalystProfile,
      preset: "ALL_OPS"
    }));
  };

  const exportOperationsSnapshotExcel = () => {
    downloadExcel("dashboard-operations-snapshot", operationsHeaders, buildOperationsRows({
      leaderboard: analystLeaderboard,
      trend: analystPerformanceTrend,
      heatmap: breachHeatmap,
      selectedAnalystProfile,
      preset: "ALL_OPS"
    }));
  };

  const exportCompareSnapshotPdf = () => {
    if (!selectedAnalystProfile || !compareAnalystProfile) return;
    downloadPdf("dashboard-analyst-compare", operationsHeaders, buildCompareRows(selectedAnalystProfile, compareAnalystProfile));
  };

  const exportCompareSnapshotExcel = () => {
    if (!selectedAnalystProfile || !compareAnalystProfile) return;
    downloadExcel("dashboard-analyst-compare", operationsHeaders, buildCompareRows(selectedAnalystProfile, compareAnalystProfile));
  };

  const handleAnalystSelect = (name: string) => {
    if (!selectedAnalyst || selectedAnalyst === name) {
      setSelectedAnalyst(name);
      return;
    }
    setCompareAnalyst(name);
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
      setReportSchedules(await getReportingSchedules("DASHBOARD"));
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
      setReportSchedules(await getReportingSchedules("DASHBOARD"));
      setReportRunHistory(await getReportingRuns("DASHBOARD"));
      setDeliveryEntries(await getReportingDeliveries("DASHBOARD"));
    } finally {
      setScheduleBusy(false);
    }
  };

  const toggleReportSchedule = async (id: string, active: boolean) => {
    setScheduleBusy(true);
    try {
      await updateReportingScheduleActive(id, active);
      setReportSchedules(await getReportingSchedules("DASHBOARD"));
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
      downloadExcel(`dashboard-${preset.toLowerCase()}`, operationsHeaders, exportRows);
    } else {
      downloadPdf(`dashboard-${preset.toLowerCase()}`, operationsHeaders, exportRows);
    }
    setScheduleBusy(true);
    try {
      await runReportingSchedule(scheduleId);
      const [nextSchedules, nextRuns, nextDeliveries] = await Promise.all([
        getReportingSchedules("DASHBOARD"),
        getReportingRuns("DASHBOARD"),
        getReportingDeliveries("DASHBOARD")
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
      setDeliveryEntries(await getReportingDeliveries("DASHBOARD"));
    } finally {
      setScheduleBusy(false);
    }
  };

  return (
    <div className="section">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>Real-Time Transaction Monitoring</p>
          <h1 style={{ margin: "4px 0 0" }}>Global Fraud Surveillance Active</h1>
          <div className="muted" style={{ marginTop: 8 }}>
            Critical and high-risk alerts follow the configured notification policy.
          </div>
        </div>
        <button className="btn-accent" onClick={() => window.dispatchEvent(new Event("fraud:sync"))}>Sync Data</button>
      </div>

      {showSummaryCards ? (
        <div className="cards-grid" style={{ marginTop: 18 }}>
          <StatCard label="Total Transaction Volume" value={formatCurrency(totalVolume)} />
          <StatCard label="Total Fraud Count" value={String(overview?.totalAlerts ?? alerts.length)} />
          <StatCard label="Overall Fraud Percentage" value={`${fraudPercentage}%`} />
          <StatCard label="Active Alerts" value={String(alerts.length || overview?.unreadAlerts || 0)} />
          <StatCard label="Critical Alerts" value={String(overview?.criticalAlerts ?? criticalAlerts)} tone="#f54b64" />
          <StatCard label="High Alerts" value={String(overview?.highAlerts ?? highAlerts)} tone="#ff8f70" />
          <StatCard label="Medium Alerts" value={String(overview?.mediumAlerts ?? mediumAlerts)} tone="#f0ad4e" />
          <StatCard label="Low Alerts" value={String(overview?.lowAlerts ?? lowAlerts)} tone="#20c997" />
          <StatCard label="Open Cases" value={String(openCases)} tone="#f0ad4e" onClick={() => goToCases("OPEN")} interactive />
          <StatCard label="In Review Cases" value={String(inReviewCases)} tone="#23b0ff" onClick={() => goToCases("IN_REVIEW")} interactive />
          <StatCard label="Escalated Cases" value={String(escalatedCases)} tone="#f54b64" onClick={() => goToCases("ESCALATED")} interactive />
          <StatCard label="Resolved Cases" value={String(resolvedCases)} tone="#20c997" onClick={() => goToCases("RESOLVED")} interactive />
          <StatCard label="Breached Cases" value={String(breachedCases)} tone="#ff7b8c" onClick={() => goToCases(undefined, "BREACHED")} interactive />
          <StatCard label="Due Soon" value={String(dueSoonCases)} tone="#8ddcff" onClick={() => goToCases(undefined, "DUE_SOON")} interactive />
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, marginTop: 16, alignItems: "start" }}>
        <div className="mini-panel">
          <div className="detail-title">SLA Trend</div>
          <div className="detail-list">
            <DetailMetric label="Breaches in last 24h" value={String(breachesLast24Hours)} />
            <DetailMetric label="Current breached cases" value={String(breachedCases)} />
            <DetailMetric label="Current due soon cases" value={String(dueSoonCases)} />
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

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, marginTop: 16, alignItems: "start" }}>
        <div className="mini-panel">
          <div className="detail-title">Analyst Leaderboard</div>
          <div className="detail-list">
            <DetailMetric label="Highest workload" value={formatLeaderValue(analystLeaderboard.highestWorkload, "cases")} />
            <DetailMetric label="Most escalations" value={formatLeaderValue(analystLeaderboard.mostEscalations, "escalations")} />
            <DetailMetric label="Fastest resolved" value={formatLeaderValue(analystLeaderboard.fastestResolved, "resolved")} />
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
                <Tooltip content={<ChartTooltip formatter={(value) => String(value)} />} />
                <Bar dataKey="total" fill="#23b0ff" radius={[8, 8, 0, 0]} name="Cases" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {selectedAnalystProfile ? (
        <div className="cards-grid" style={{ marginTop: 16 }}>
          <StatCard label={`${selectedAnalystProfile.analyst} Total Cases`} value={String(selectedAnalystProfile.total)} tone="#8ddcff" />
          <StatCard label="Current Open" value={String(selectedAnalystProfile.open)} tone="#f0ad4e" />
          <StatCard label="Current Escalated" value={String(selectedAnalystProfile.escalated)} tone="#f54b64" />
          <StatCard label="Breached Assigned" value={String(selectedAnalystProfile.breached)} tone="#ff7b8c" />
          <StatCard label="Resolved" value={String(selectedAnalystProfile.resolved)} tone="#20c997" />
          <StatCard label="Open Queue" value="View Cases" onClick={() => goToCases(undefined, undefined, selectedAnalystProfile.analyst)} interactive />
        </div>
      ) : null}

      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div className="mini-panel">
          <div className="detail-title">Analyst Compare Mode</div>
          <div className="detail-list">
            <label className="muted">Primary Analyst</label>
            <select className="settings-select" value={selectedAnalyst} onChange={(e) => setSelectedAnalyst(e.target.value)}>
              <option value="">Select analyst</option>
              {analystOptions.map((name) => <option key={`primary-${name}`} value={name}>{name}</option>)}
            </select>
            <label className="muted">Compare With</label>
            <select className="settings-select" value={compareAnalyst} onChange={(e) => setCompareAnalyst(e.target.value)}>
              <option value="">Select analyst</option>
              {analystOptions.filter((name) => name !== selectedAnalyst).map((name) => <option key={`compare-${name}`} value={name}>{name}</option>)}
            </select>
          </div>
        </div>
        <div className="mini-panel">
          <div className="detail-title">Compare Snapshot</div>
          {selectedAnalystProfile && compareAnalystProfile ? (
            <div className="detail-list">
              <DetailMetric label="Open" value={`${selectedAnalystProfile.analyst}: ${selectedAnalystProfile.open} | ${compareAnalystProfile.analyst}: ${compareAnalystProfile.open}`} />
              <DetailMetric label="Escalated" value={`${selectedAnalystProfile.analyst}: ${selectedAnalystProfile.escalated} | ${compareAnalystProfile.analyst}: ${compareAnalystProfile.escalated}`} />
              <DetailMetric label="Breached" value={`${selectedAnalystProfile.analyst}: ${selectedAnalystProfile.breached} | ${compareAnalystProfile.analyst}: ${compareAnalystProfile.breached}`} />
              <DetailMetric label="Resolved" value={`${selectedAnalystProfile.analyst}: ${selectedAnalystProfile.resolved} | ${compareAnalystProfile.analyst}: ${compareAnalystProfile.resolved}`} />
            </div>
          ) : (
            <div className="muted">Choose two analysts to compare their current case load side by side.</div>
          )}
        </div>
      </div>

      {selectedAnalystProfile && compareAnalystProfile ? (
        <div className="section" style={{ marginTop: 16, background: "#0f1a2b", minWidth: 0 }}>
          <h3 style={{ marginTop: 0 }}>Analyst Compare Chart</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            {selectedAnalystProfile.analyst} versus {compareAnalystProfile.analyst} across current queue metrics.
          </p>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={compareChartData}>
                <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
                <XAxis dataKey="metric" stroke="#9fb2d9" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} stroke="#9fb2d9" />
                <Tooltip content={<ChartTooltip formatter={(value) => String(value)} />} />
                <Legend />
                <Bar dataKey="primary" fill="#4361ee" radius={[8, 8, 0, 0]} name={selectedAnalystProfile.analyst} />
                <Bar dataKey="secondary" fill="#23b0ff" radius={[8, 8, 0, 0]} name={compareAnalystProfile.analyst} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="table-heading" style={{ marginTop: 12 }}>
            <div className="muted">Export this focused compare snapshot for review or presentation.</div>
            <div className="table-heading-right">
              <button className="pill" onClick={exportCompareSnapshotPdf}>Compare PDF</button>
              <button className="pill" onClick={exportCompareSnapshotExcel}>Compare Excel</button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, marginTop: 16, alignItems: "start" }}>
        <div className="section" style={{ background: "#0f1a2b", minWidth: 0 }}>
          <h3 style={{ marginTop: 0 }}>Analyst Performance Trends</h3>
          <p className="muted" style={{ marginTop: 0 }}>Resolved versus escalated case movement over the latest visible dates.</p>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={analystPerformanceTrend}>
                <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#9fb2d9" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} stroke="#9fb2d9" />
                <Tooltip content={<ChartTooltip formatter={(value) => String(value)} />} />
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
            <div className="muted">No breached-case heatmap data available yet.</div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, marginTop: 16, alignItems: "start" }}>
        <div className="section" style={{ background: "#0f1a2b", minWidth: 0 }}>
          <h3 style={{ marginTop: 0 }}>Cases per Analyst</h3>
          <p className="muted" style={{ marginTop: 0 }}>Current case ownership load across the analyst queue.</p>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={casesPerAnalyst}>
                <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#9fb2d9" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} stroke="#9fb2d9" />
                <Tooltip content={<ChartTooltip formatter={(value) => String(value)} />} />
                <Bar dataKey="total" fill="#4361ee" radius={[8, 8, 0, 0]} name="Cases" onClick={(data) => data?.name && handleAnalystSelect(String(data.name))} style={{ cursor: "pointer" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>Click a bar to focus that analyst, then open their case queue from the profile cards.</div>
        </div>
        <div className="section" style={{ background: "#0f1a2b", minWidth: 0 }}>
          <h3 style={{ marginTop: 0 }}>Escalations by Analyst</h3>
          <p className="muted" style={{ marginTop: 0 }}>Where the highest-severity case escalations are concentrated.</p>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={escalationsByAnalyst}>
                <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#9fb2d9" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} stroke="#9fb2d9" />
                <Tooltip content={<ChartTooltip formatter={(value) => String(value)} />} />
                <Bar dataKey="total" fill="#f54b64" radius={[8, 8, 0, 0]} name="Escalations" onClick={(data) => data?.name && handleAnalystSelect(String(data.name))} style={{ cursor: "pointer" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>Click a bar to focus that analyst’s escalation profile.</div>
        </div>
      </div>

      <div className="table-heading" style={{ marginTop: 16 }}>
        <div>
          <h3 style={{ margin: 0 }}>Operational Analytics Export</h3>
          <p className="muted" style={{ margin: "6px 0 0" }}>Download leaderboard, analyst trend, heatmap, and focused analyst summary for reporting.</p>
        </div>
        <div className="table-heading-right">
          <button className="pill" onClick={exportOperationsSnapshotPdf}>Download Ops PDF</button>
          <button className="pill" onClick={exportOperationsSnapshotExcel}>Download Ops Excel</button>
        </div>
      </div>

      <ReportingWorkspacePanel
        title="Reporting Lifecycle"
        description="Save dashboard schedules, review backend execution history, and manage delivery retries from one consistent workspace."
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

      {showFraudTrendChart ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)", gap: 16, marginTop: 18, alignItems: "start" }}>
          <div className="section" style={{ background: "#0f1a2b", minWidth: 0 }}>
            <h3 style={{ marginTop: 0 }}>Fraud Trends Over Time</h3>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={trendData}>
                  <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#9fb2d9" />
                  <YAxis stroke="#9fb2d9" />
                  <Tooltip content={<ChartTooltip formatter={(value) => String(value)} />} />
                  <Legend />
                  <Line type="monotone" dataKey="total" stroke="#23b0ff" strokeWidth={3} dot={{ r: 3 }} name="Transactions" />
                  <Line type="monotone" dataKey="fraud" stroke="#f54b64" strokeWidth={3} dot={{ r: 3 }} name="Fraud" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="section" style={{ background: "#0f1a2b", minWidth: 0 }}>
            <h3 style={{ marginTop: 0 }}>Fraud Type Distribution</h3>
            <div style={{ width: "100%", height: 250 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={fraudTypeData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={98} paddingAngle={3}>
                    {fraudTypeData.map((entry, index) => (
                      <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip formatter={(value) => String(value)} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="pie-legend">
              {fraudTypeData.map((entry, index) => (
                <div key={entry.name} className="pie-legend-item">
                  <span className="pie-legend-swatch" style={{ background: chartColors[index % chartColors.length] }} />
                  <span className="pie-legend-label">{entry.name}</span>
                  <span className="pie-legend-count">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, marginTop: 18 }}>
          <div className="section" style={{ background: "#0f1a2b" }}>
            <h3 style={{ marginTop: 0 }}>Fraud Type Distribution</h3>
            <div style={{ width: "100%", height: 250 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={fraudTypeData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={98} paddingAngle={3}>
                    {fraudTypeData.map((entry, index) => (
                      <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip formatter={(value) => String(value)} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="pie-legend">
              {fraudTypeData.map((entry, index) => (
                <div key={entry.name} className="pie-legend-item">
                  <span className="pie-legend-swatch" style={{ background: chartColors[index % chartColors.length] }} />
                  <span className="pie-legend-label">{entry.name}</span>
                  <span className="pie-legend-count">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showRealTimeMetrics ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)", gap: 16, marginTop: 16, alignItems: "start" }}>
          <div className="section" style={{ background: "#0f1a2b", minWidth: 0 }}>
            <h3 style={{ marginTop: 0 }}>Total Volume vs Fraudulent Volume</h3>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={volumeData}>
                  <CartesianGrid stroke="#1f2a44" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#9fb2d9" />
                  <YAxis stroke="#9fb2d9" />
                  <Tooltip content={<ChartTooltip formatter={(value) => formatCurrency(Number(value))} />} />
                  <Legend />
                  <Bar dataKey="totalVolume" fill="#4361ee" radius={[8, 8, 0, 0]} name="Total Volume" />
                  <Bar dataKey="fraudulentVolume" fill="#f54b64" radius={[8, 8, 0, 0]} name="Fraud Volume" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="cards-inline" style={{ marginTop: 12 }}>
              <span className="chip approved">All Volume: {formatCurrency(totalVolume)}</span>
              <span className="chip high">Fraud Volume: {formatCurrency(fraudulentVolume)}</span>
            </div>
          </div>
          <div className="section" style={{ background: "#0f1a2b", minWidth: 0 }}>
            <h3 style={{ marginTop: 0 }}>Transaction Status</h3>
            <RiskChart data={alerts} />
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)", gap: 16, marginTop: 16, alignItems: "start" }}>
        <div className="section" style={{ background: "#0f1a2b", minWidth: 0 }}>
          <h3 style={{ marginTop: 0 }}>Google Maps Alert Map</h3>
          <GeoHeatmap alerts={alerts} />
        </div>
        {showTransactionStream ? (
          <div className="section" style={{ background: "#0f1a2b", minWidth: 0 }}>
            <h3 style={{ marginTop: 0 }}>Live Transaction Stream</h3>
            <TransactionStream alerts={alerts} />
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, marginTop: 16, alignItems: "start" }}>
        {showTopRulesChart ? (
          <div className="section" style={{ background: "#0f1a2b" }}>
            <h3 style={{ marginTop: 0 }}>Rules Section</h3>
            <TopRulesChart data={alerts} />
          </div>
        ) : null}
        <div className="section" style={{ background: "#0f1a2b" }}>
          <h3 style={{ marginTop: 0 }}>Security Snapshot</h3>
          <div className="cards-inline">
            <span className="chip approved">Sensitive data {shouldMaskSensitiveData(settings) ? "masked" : "visible"}</span>
            <span className="chip medium">Unread alerts: {overview?.unreadAlerts ?? 0}</span>
            <span className="chip high">Notification routing active</span>
          </div>
        </div>
      </div>

      <div className="section" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Alerts Table</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
          <input placeholder="Transaction ID" value={filters.transactionId} onChange={(e) => setFilters((prev) => ({ ...prev, transactionId: e.target.value }))} style={filterInput} />
          <input placeholder="Transaction Type" value={filters.transactionType} onChange={(e) => setFilters((prev) => ({ ...prev, transactionType: e.target.value }))} style={filterInput} />
          <input placeholder="Rule Triggered" value={filters.ruleTriggered} onChange={(e) => setFilters((prev) => ({ ...prev, ruleTriggered: e.target.value }))} style={filterInput} />
          <input placeholder="Min Risk Score" value={filters.minRiskScore} onChange={(e) => setFilters((prev) => ({ ...prev, minRiskScore: e.target.value }))} style={filterInput} />
          <select value={filters.priority} onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))} style={filterInput}>
            <option value="ALL">All Priority</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <AlertsTable alerts={filteredAlerts} />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  onClick,
  interactive
}: {
  label: string;
  value: string;
  tone?: string;
  onClick?: () => void;
  interactive?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`stat-card${interactive ? " stat-card-interactive" : ""}`} onClick={onClick}>
      <div className="label">{label}</div>
      <div className="value" style={tone ? { color: tone, fontSize: value.length > 12 ? 22 : 28 } : { fontSize: value.length > 12 ? 22 : 28 }}>
        {value}
      </div>
    </Tag>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  formatter
}: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string }>;
  label?: string | number;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((item) => (
        <div key={item.name || item.value} className="chart-tooltip-value">
          {item.name ? `${item.name}: ` : ""}
          {formatter ? formatter(Number(item.value || 0)) : Number(item.value || 0).toFixed(3)}
        </div>
      ))}
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const filterInput: React.CSSProperties = {
  background: "#0f1a2b",
  color: "#e8eefc",
  border: "1px solid #1f2a44",
  borderRadius: 10,
  padding: "10px 12px"
};

function isTransactionSlaBreached(tx: TransactionRecord) {
  const thresholdHours = transactionSlaThreshold(tx);
  if (!thresholdHours || !tx.transactionTime || (tx.caseStatus || "OPEN") === "RESOLVED") return false;
  const ageHours = (Date.now() - new Date(tx.transactionTime).getTime()) / 3_600_000;
  return ageHours > thresholdHours;
}

function isTransactionSlaDueSoon(tx: TransactionRecord) {
  const thresholdHours = transactionSlaThreshold(tx);
  if (!thresholdHours || !tx.transactionTime || (tx.caseStatus || "OPEN") === "RESOLVED" || isTransactionSlaBreached(tx)) {
    return false;
  }
  const remainingHours = thresholdHours - ((Date.now() - new Date(tx.transactionTime).getTime()) / 3_600_000);
  const severity = (tx.priority || tx.riskLevel || "").toUpperCase();
  if (severity.includes("CRITICAL")) return remainingHours <= 0.25;
  if (severity.includes("HIGH")) return remainingHours <= 1;
  return remainingHours <= 6;
}

function transactionSlaThreshold(tx: TransactionRecord) {
  const severity = (tx.priority || tx.riskLevel || "").toUpperCase();
  if (severity.includes("CRITICAL")) return 1;
  if (severity.includes("HIGH")) return 4;
  if (severity.includes("MEDIUM")) return 24;
  return 24;
}

function normalizeTransactionSeverity(priority: string) {
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

function buildAnalystProfile(transactions: TransactionRecord[], analyst: string) {
  const analystTransactions = transactions.filter((tx) => (tx.assignedToName || "Unassigned") === analyst);
  return {
    analyst,
    total: analystTransactions.length,
    open: analystTransactions.filter((tx) => (tx.caseStatus || "OPEN") === "OPEN").length,
    escalated: analystTransactions.filter((tx) => tx.caseStatus === "ESCALATED").length,
    breached: analystTransactions.filter((tx) => isTransactionSlaBreached(tx)).length,
    resolved: analystTransactions.filter((tx) => tx.caseStatus === "RESOLVED").length
  };
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
