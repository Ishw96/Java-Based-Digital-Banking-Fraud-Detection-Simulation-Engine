import { apiClient } from "../../services/apiClient";
import { getSession } from "../../services/auth";
import type { DeliveryLogEntry, ReportRunEntry, ReportingSchedule, ReportScope } from "./reportingModels";

export async function getReportingSchedules(scope: ReportScope) {
  const response = await apiClient.get("reporting/schedules", {
    params: { scope },
    headers: reportingHeaders()
  });
  return response.data as ReportingSchedule[];
}

export async function saveReportingSchedule(payload: Omit<ReportingSchedule, "lastRunAt" | "nextRunAt">) {
  const response = await apiClient.post("reporting/schedules", payload, {
    headers: reportingHeaders()
  });
  return response.data as ReportingSchedule;
}

export async function deleteReportingSchedule(id: string) {
  await apiClient.delete(`reporting/schedules/${encodeURIComponent(id)}`, {
    headers: reportingHeaders()
  });
}

export async function updateReportingScheduleActive(id: string, active: boolean) {
  const response = await apiClient.patch(`reporting/schedules/${encodeURIComponent(id)}/active`, null, {
    params: { active },
    headers: reportingHeaders()
  });
  return response.data as ReportingSchedule;
}

export async function getReportingRuns(scope: ReportScope) {
  const response = await apiClient.get("reporting/runs", {
    params: { scope },
    headers: reportingHeaders()
  });
  return response.data as ReportRunEntry[];
}

export async function getReportingDeliveries(scope: ReportScope) {
  const response = await apiClient.get("reporting/deliveries", {
    params: { scope },
    headers: reportingHeaders()
  });
  return response.data as DeliveryLogEntry[];
}

export async function runReportingSchedule(id: string) {
  const response = await apiClient.post(`reporting/schedules/${encodeURIComponent(id)}/run`, null, {
    headers: reportingHeaders()
  });
  return response.data as DeliveryLogEntry[];
}

export async function retryReportingDelivery(id: number) {
  const response = await apiClient.post(`reporting/deliveries/${id}/retry`, null, {
    headers: reportingHeaders()
  });
  return response.data as DeliveryLogEntry;
}

function reportingHeaders() {
  const session = getSession();
  if (!session?.email) {
    return {};
  }
  return {
    "X-Actor-Email": session.email,
    "X-Actor-Name": session.userName || session.email,
    "X-Actor-Role": session.role
  };
}
