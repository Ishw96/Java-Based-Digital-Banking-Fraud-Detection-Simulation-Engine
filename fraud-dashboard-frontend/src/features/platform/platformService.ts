import { apiClient } from "../../services/apiClient";

export interface SecurityPolicy {
  mfaRequired: boolean;
  sessionTimeoutMinutes: number;
  rateLimitPerMinute: number;
  passwordPolicy: string;
  defaultRole: string;
}

export interface NotificationPolicy {
  toastPopupsEnabled: boolean;
  soundAlertEnabled: boolean;
  smtpServer: string;
  senderEmail: string;
  alertLevel: string;
}

export interface FraudDecisionPolicy {
  modelVersion: string;
  fallbackMode: boolean;
  fraudThreshold: number;
  ruleWeight: number;
  mlWeight: number;
}

export interface SimulationPolicy {
  defaultTransactionsPerMinute: number;
  burstEnabled: boolean;
  burstSize: number;
  burstIntervalMinutes: number;
  allowCustomScenarios: boolean;
  replayStoreRetention: string;
}

export interface PlatformPolicies {
  role: string;
  applicationName: string;
  security: SecurityPolicy;
  notifications: NotificationPolicy;
  fraudDecision: FraudDecisionPolicy;
  simulation: SimulationPolicy;
}

export interface PlatformHealthComponent {
  name: string;
  status: string;
  detail: string;
}

export interface PlatformHealth {
  status: string;
  generatedAt: string;
  components: PlatformHealthComponent[];
}

export interface PlatformMetrics {
  generatedAt: string;
  activeSessions: number;
  unreadAlertBacklog: number;
  reportingSchedules: number;
  reportingRunsLast24Hours: number;
  deliveryFailuresLast24Hours: number;
  deliverySuccessLast24Hours: number;
  simulationEventsLast24Hours: number;
  auditEventsLast24Hours: number;
  pendingMfaChallenges: number;
  totalUsers: number;
}

export interface MlMetadata {
  status: string;
  endpoint: string;
  modelVersion: string;
  trainingDatasetVersion: string;
  threshold: number;
  timeoutMs: number;
  fallbackMode: string;
  detail: string;
}

export interface PlatformAuditEntry {
  id: number;
  category: string;
  actionType: string;
  actorEmail?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  scope?: string | null;
  status?: string | null;
  correlationId?: string | null;
  detail?: string | null;
  createdAt: string;
}

export async function getPlatformPolicies() {
  const response = await apiClient.get("platform/policies");
  return response.data as PlatformPolicies;
}

export async function getPlatformHealth() {
  const response = await apiClient.get("platform/health");
  return response.data as PlatformHealth;
}

export async function getPlatformMetrics() {
  const response = await apiClient.get("platform/metrics");
  return response.data as PlatformMetrics;
}

export async function getMlMetadata() {
  const response = await apiClient.get("ml/metadata");
  return response.data as MlMetadata;
}

export async function getPlatformAudit(category?: string) {
  const response = await apiClient.get("platform/audit", {
    params: category ? { category } : undefined
  });
  return response.data as PlatformAuditEntry[];
}
