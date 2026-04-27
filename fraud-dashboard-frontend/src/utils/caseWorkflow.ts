import type { AlertLifecycle, AlertTimelineEntry, BulkAlertActionResult } from "../services/alertService";

export function buildCaseStatusOptions(currentStatus?: string | null, allowedTransitions?: string[] | null) {
  const values = [currentStatus || "OPEN", ...(allowedTransitions || [])].filter(Boolean);
  return Array.from(new Set(values));
}

export function intersectCaseTransitions(items: AlertLifecycle[]) {
  if (!items.length) return [];
  const first = new Set(items[0].allowedCaseTransitions || []);
  return Array.from(first).filter((status) => items.every((item) => (item.allowedCaseTransitions || []).includes(status)));
}

export function summarizeBulkActionResult(result: BulkAlertActionResult): { tone: "success" | "warning" | "error"; message: string } {
  const failedTransactions = result.results
    .filter((item) => !item.success)
    .map((item) => `${item.transactionId}: ${item.message}`)
    .slice(0, 3);

  const tone = result.failureCount === 0 ? "success" : result.successCount === 0 ? "error" : "warning";
  return {
    tone: tone as "success" | "warning" | "error",
    message: failedTransactions.length
      ? `${result.message} ${failedTransactions.join(" | ")}`
      : result.message
  };
}

export function formatTimelineActor(entry: AlertTimelineEntry) {
  const actor = entry.actorName || entry.actorEmail || "System";
  const role = entry.actorRole ? ` (${entry.actorRole})` : "";
  return `${actor}${role}`;
}
