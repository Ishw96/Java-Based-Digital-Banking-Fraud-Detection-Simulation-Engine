import { getSession } from "./auth";
import { apiClient } from "./apiClient";

export interface DashboardOverview {
  totalTransactions: number;
  totalAlerts: number;
  criticalAlerts: number;
  highAlerts: number;
  mediumAlerts: number;
  lowAlerts: number;
  blockedTransactions: number;
  approvedTransactions: number;
  unreadAlerts: number;
  alertRate: number;
  lastSyncAt: string;
  primaryRecipient: string;
}

export interface DecisionExplanationItem {
  code: string;
  category?: string | null;
  source?: string | null;
  title?: string | null;
  detail?: string | null;
  severity?: string | null;
  score?: number | null;
  weight?: number | null;
  flagged?: boolean | null;
}

export interface PerformancePoint {
  label: string;
  accuracy: number;
  precision: number;
  recall: number;
}

export interface ModelAnalytics {
  pipeline: string;
  algorithm: string;
  datasetSize: number;
  trainingRows: number;
  fraudDistribution: number;
  featureCount: number;
  trainingLoss: number;
  validationAccuracy: number;
  healthScore: number;
  optimalF1Threshold: number;
  optimalF2Threshold?: number;
  f1Score: number;
  f2Score?: number;
  precisionScore: number;
  recallScore: number;
  rocAuc: number;
  accuracy: number;
  trueNegative: number;
  falsePositive: number;
  falseNegative: number;
  truePositive: number;
  performanceOverTime: PerformancePoint[];
  topFeatures: string[];
}

export interface ApiActivity {
  endpoint: string;
  status: string;
  detail: string;
  timestamp: string;
}

export interface SimulationControl {
  running: boolean;
  scenario: string;
  profileName?: string;
  workspaceKey?: string;
  userId?: number;
  userEmail?: string;
  userName?: string;
  throughputPerMinute: number;
  burstSize: number;
  riskMultiplier: number;
  indiaShare?: number;
  usaShare?: number;
  highAmountShare?: number;
  scamMerchantShare?: number;
  deviceReuseShare?: number;
  burstIntervalMinutes?: number;
  burstDurationSeconds?: number;
  alertsBatchSize?: number;
  replayMode?: boolean;
  autoStopAfter?: string;
  activatedAt?: string | null;
  updatedAt: string;
}

export interface SystemHealth {
  apiStatus: string;
  ingestionStatus: string;
  healthScore: number;
  totalTransactions: number;
  totalAlerts: number;
  unreadAlerts: number;
  activeRules: number;
  projectedTransactions?: number;
  projectedFraudDetected?: number;
  projectedAlertsTriggered?: number;
  projectedFraudRate?: number;
  estimatedLoad?: number;
  estimatedLatencyMs?: number;
  simulationContext?: string;
  simulationUserId?: number;
  simulationUserEmail?: string;
  simulationUserName?: string;
  lastTransactionAt?: string | null;
  recentActivity: ApiActivity[];
}

export interface SimulationActivity {
  userId?: number;
  userName?: string;
  userEmail?: string;
  workspaceKey?: string;
  profileName?: string;
  actionType?: string;
  scenario?: string;
  detail?: string;
  running?: boolean;
  throughputPerMinute?: number;
  burstSize?: number;
  alertsGenerated?: number;
  fraudDetected?: number;
  projectedTransactions?: number;
  projectedFraudRate?: number;
  createdAt?: string;
}

export interface DetectionRule {
  id?: number;
  name: string;
  description: string;
  triggers: number;
  enabled: boolean;
  severity: string;
}

export interface RuleConfig {
  id: number;
  ruleName: string;
  thresholdValue: number | null;
  weight: number | null;
  active: boolean;
}

export interface TransactionRecord {
  transactionId: string;
  amount: number;
  transactionType: string;
  location: string;
  merchant: string;
  senderAccountNumber: string;
  receiverAccountNumber: string;
  status: string;
  fraudDetected: boolean;
  ruleTriggered: string;
  riskScore: number;
  mlScore: number;
  decisionOutcome?: string;
  caseStatus?: string;
  assignedToName?: string | null;
  latestCaseNote?: string | null;
  decisionExplanationItems?: DecisionExplanationItem[];
  decisionExplanations?: string[];
  priority: string;
  riskLevel: string;
  transactionTime: string;
}

export interface AlertLifecycle {
  transactionId: string;
  amount: number;
  transactionType: string;
  location: string;
  ruleTriggered: string;
  riskScore: number;
  priority: string;
  riskLevel: string;
  fraudDetected: boolean;
  evaluatedAt: string;
  actionType: string;
  readTimestamp: string | null;
  userName?: string | null;
  decisionOutcome?: string | null;
  caseStatus?: string | null;
  assignedToName?: string | null;
  assignedToEmail?: string | null;
  latestCaseNote?: string | null;
  decisionExplanationItems?: DecisionExplanationItem[];
  decisionExplanations?: string[];
  allowedCaseTransitions?: string[];
}

export interface AlertTimelineEntry {
  auditId: number;
  transactionId?: string | null;
  actionType: string;
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  assignedToName?: string | null;
  assignedToEmail?: string | null;
  caseStatus?: string | null;
  detail?: string | null;
  bulkOperationId?: string | null;
  readTimestamp?: string | null;
  happenedAt: string;
}

export interface BulkAlertActionItem {
  transactionId: string;
  success: boolean;
  message: string;
  bulkOperationId?: string | null;
  alert?: AlertLifecycle;
}

export interface BulkAlertActionResult {
  actionType: string;
  bulkOperationId: string;
  requestedCount: number;
  successCount: number;
  failureCount: number;
  message: string;
  results: BulkAlertActionItem[];
}

export interface UserRecord {
  userId: number;
  userName: string;
  phoneNumber: string;
  email: string;
  role: "ANALYTICS" | "ADMIN";
  invitationCode?: string;
  active: boolean;
  createdAt: string;
}

export interface InvitationCodeRecord {
  invitationCode: string;
  issuedBy?: string;
  role?: string;
  recipientEmail?: string;
}

export interface LoginResponse {
  success: boolean;
  token: string | null;
  email: string | null;
  userName?: string | null;
  role: string | null;
  mfaRequired?: boolean;
  challengeId?: string | null;
  challengeExpiresAt?: string | null;
  sessionTimeoutMinutes?: number | null;
  message?: string | null;
}

export const getAlerts = async () => {
  const res = await apiClient.get(`alerts?page=0&size=200`);
  return res.data.content;
};

export const getActiveAlerts = async () => {
  const res = await apiClient.get(`alerts?page=0&size=200`);
  return res.data.content as AlertLifecycle[];
};

export const getReadAlerts = async () => {
  const res = await apiClient.get(`alerts/read-history?page=0&size=200`);
  return res.data.content as AlertLifecycle[];
};

export const getUnreadCount = async () => {
  const res = await apiClient.get(`alerts/unread-count`);
  return Number(res.data.count || 0);
};

export const markAlertRead = async (transactionId: string) => {
  await apiClient.post(`alerts/${transactionId}/read`, null, {
    headers: alertActorHeaders()
  });
};

export const markAlertUnread = async (transactionId: string) => {
  await apiClient.post(`alerts/${transactionId}/unread`, null, {
    headers: alertActorHeaders()
  });
};

export const clearAlertBadge = async () => {
  await apiClient.post(`alerts/clear-badge`, null, { headers: alertActorHeaders() });
};

export const getAlertDetail = async (transactionId: string) => {
  const res = await apiClient.get(`alerts/${transactionId}`);
  return res.data as AlertLifecycle;
};

export const getAlertTimeline = async (transactionId: string) => {
  const res = await apiClient.get(`alerts/${transactionId}/timeline`);
  return res.data as AlertTimelineEntry[];
};

export const assignAlertCase = async (transactionId: string, payload: {
  assignedToName?: string;
  assignedToEmail?: string;
}) => {
  const res = await apiClient.post(`alerts/${transactionId}/assign`, payload, { headers: alertActorHeaders() });
  return res.data as AlertLifecycle;
};

export const updateAlertCaseStatus = async (transactionId: string, payload: {
  caseStatus: string;
  detail?: string;
}) => {
  const res = await apiClient.post(`alerts/${transactionId}/status`, payload, { headers: alertActorHeaders() });
  return res.data as AlertLifecycle;
};

export const addAlertCaseNote = async (transactionId: string, note: string) => {
  const res = await apiClient.post(`alerts/${transactionId}/notes`, { note }, { headers: alertActorHeaders() });
  return res.data as AlertLifecycle;
};

export const bulkAssignAlertCases = async (payload: {
  transactionIds: string[];
  assignedToName?: string;
  assignedToEmail?: string;
}) => {
  const res = await apiClient.post("alerts/bulk/assign", payload, { headers: alertActorHeaders() });
  return res.data as BulkAlertActionResult;
};

export const bulkUpdateAlertCaseStatus = async (payload: {
  transactionIds: string[];
  caseStatus: string;
  detail?: string;
}) => {
  const res = await apiClient.post("alerts/bulk/status", payload, { headers: alertActorHeaders() });
  return res.data as BulkAlertActionResult;
};

export const bulkAddAlertCaseNote = async (payload: {
  transactionIds: string[];
  note: string;
}) => {
  const res = await apiClient.post("alerts/bulk/notes", payload, { headers: alertActorHeaders() });
  return res.data as BulkAlertActionResult;
};

export const getTransactions = async () => {
  const res = await apiClient.get(`transactions?page=0&size=200`);
  return res.data.content as TransactionRecord[];
};

export const getDashboardOverview = async () => {
  const res = await apiClient.get(`dashboard/overview`);
  return res.data as DashboardOverview;
};

export const getModelAnalytics = async () => {
  const res = await apiClient.get(`dashboard/model`);
  return res.data as ModelAnalytics;
};

export const getDetectionRules = async () => {
  const res = await apiClient.get(`dashboard/detection-rules`);
  return res.data as DetectionRule[];
};

export const getRuleConfigs = async () => {
  const res = await apiClient.get(`rules`);
  return res.data as RuleConfig[];
};

export const updateRuleConfigActive = async (ruleName: string, active: boolean) => {
  const res = await apiClient.put(`rules/${encodeURIComponent(ruleName)}/active`, { active });
  return res.data as RuleConfig;
};

export const getAdminRecipients = async (): Promise<string[]> => {
  const res = await apiClient.get(`alerts/admin-recipients`);
  return res.data;
};

export const getTransactionById = async (transactionId: string) => {
  const res = await apiClient.get(`transactions/${transactionId}`);
  return res.data as TransactionRecord;
};

export const loginAdmin = async (email: string, password: string) => {
  const res = await apiClient.post(`auth/login`, { email, password });
  return res.data as LoginResponse;
};

export const logoutSession = async () => {
  await apiClient.post(`auth/logout`);
};

export const verifyLoginMfa = async (challengeId: string, code: string) => {
  const res = await apiClient.post(`auth/mfa/verify`, { challengeId, code });
  return res.data as LoginResponse;
};

export const signupUser = async (payload: {
  userName: string;
  phoneNumber: string;
  email: string;
  password: string;
  confirmPassword: string;
  invitationCode: string;
}) => {
  const res = await apiClient.post(`auth/signup`, payload);
  return res.data as UserRecord;
};

export const getUsers = async () => {
  const res = await apiClient.get(`users`);
  return res.data as UserRecord[];
};

export const createUser = async (payload: {
  userName: string;
  phoneNumber: string;
  email: string;
  role: "ANALYTICS" | "ADMIN";
  password: string;
}) => {
  const res = await apiClient.post(`users`, payload);
  return res.data as UserRecord;
};

export const deleteUser = async (id: number) => {
  await apiClient.delete(`users/${id}`);
};

export const changePassword = async (payload: {
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) => {
  const res = await apiClient.post(`users/change-password`, payload);
  return res.data as { success: boolean; message: string; email?: string };
};

export const createInvitationCode = async (role = "ANALYTICS", recipientEmail = "") => {
  const session = getSession();
  const issuedBy = encodeURIComponent(session?.userName || session?.email || "System Admin");
  const res = await apiClient.post(`auth/invitation-code?role=${encodeURIComponent(role)}&issuedBy=${issuedBy}&recipientEmail=${encodeURIComponent(recipientEmail)}`);
  return res.data as InvitationCodeRecord;
};

export interface InvitationCodeSummary {
  invitationCode: string;
  role?: string;
  issuedBy?: string;
  recipientEmail?: string;
}

export interface SettingsProfile {
  scope: string;
  role: string;
  ownerEmail?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
  settings: Record<string, unknown>;
}

export interface SettingsHistoryEntry {
  id: number;
  scope: string;
  role: string;
  ownerEmail?: string | null;
  updatedBy?: string | null;
  createdAt?: string | null;
  settings: Record<string, unknown>;
}

export const getInvitationCodes = async () => {
  const res = await apiClient.get(`auth/invitations`);
  return res.data as InvitationCodeSummary[];
};

export const getSimulationControl = async () => {
  const res = await apiClient.get(`ops/simulation`, { headers: simulationHeaders() });
  return res.data as SimulationControl;
};

export const updateSimulationControl = async (payload: SimulationControl) => {
  const res = await apiClient.put(`ops/simulation`, payload, { headers: simulationHeaders() });
  return res.data as SimulationControl;
};

export const getSystemHealth = async () => {
  const res = await apiClient.get(`ops/health`, { headers: simulationHeaders() });
  return res.data as SystemHealth;
};

export const publishSimulationAlerts = async (payload: {
  count: number;
  scenario?: string;
  workspaceKey?: string;
  profileName?: string;
}) => {
  const res = await apiClient.post(`ops/simulation/alerts`, payload, { headers: simulationHeaders() });
  return res.data as AlertLifecycle[];
};

export const replaySimulationAlerts = async () => {
  const res = await apiClient.get(`ops/simulation/replay`, { headers: simulationHeaders() });
  return res.data as AlertLifecycle[];
};

export const getSimulationActivity = async () => {
  const res = await apiClient.get(`ops/simulation/activity`, { headers: simulationHeaders() });
  return res.data as SimulationActivity[];
};

export const requestPasswordRecovery = async (email: string) => {
  const res = await apiClient.post(`auth/forgot-password`, { email });
  return res.data as { success: boolean; message: string };
};

export const validatePasswordResetToken = async (token: string) => {
  const res = await apiClient.get(`auth/forgot-password/validate`, {
    params: { token }
  });
  return res.data as { success: boolean; message: string; email?: string };
};

export const updatePassword = async (payload: {
  token: string;
  password: string;
  confirmPassword: string;
}) => {
  const res = await apiClient.post(`auth/reset-password`, payload);
  return res.data as { success: boolean; message: string; email?: string };
};

export const getSettingsProfile = async () => {
  const res = await apiClient.get(`settings`, { headers: settingsHeaders() });
  return res.data as SettingsProfile;
};

export const getAdminSettingsProfile = async () => {
  const res = await apiClient.get(`settings/admin`, { headers: settingsHeaders() });
  return res.data as SettingsProfile;
};

export const getSettingsHistory = async (role?: "ADMIN" | "ANALYTICS") => {
  const res = await apiClient.get(`settings/history`, {
    headers: settingsHeaders(),
    params: role ? { role } : undefined
  });
  return res.data as SettingsHistoryEntry[];
};

export const saveSettingsProfile = async (settings: Record<string, unknown>) => {
  const role = String(getSession()?.role || "").toUpperCase();
  const path = role === "ADMIN" ? "settings/admin" : "settings/profile";
  const res = await apiClient.post(path, { settings }, { headers: settingsHeaders() });
  return res.data as SettingsProfile;
};

function simulationHeaders() {
  const session = getSession();
  if (!session?.email) {
    return {};
  }
  return {
    "X-Actor-Email": session.email,
    "X-Actor-Name": session.userName || session.email
  };
}

function settingsHeaders() {
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

function alertActorHeaders() {
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

