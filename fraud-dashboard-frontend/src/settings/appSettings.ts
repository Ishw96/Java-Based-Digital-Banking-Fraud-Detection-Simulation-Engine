import { ML_ENGINE_URL } from "../config/runtime";

export type AppRole = "ADMIN" | "ANALYTICS";

export type SettingsState = Record<string, any>;

export const adminDefaults: SettingsState = {
  general: {
    applicationName: "DetectIQ",
    theme: "Dark",
    language: "English",
    timeZone: "Asia/Kolkata",
    dateFormat: "DD/MM/YYYY",
    defaultDashboard: "Dashboard"
  },
  engine: {
    modelVersion: "v2.0",
    fallbackMode: true,
    featureEngineering: "1h",
    defaultRuleActivation: true,
    ruleTuning: true,
    fraudThreshold: "0.1049",
    ruleWeight: "0.6",
    mlWeight: "0.4"
  },
  simulation: {
    defaultTransactionsPerMinute: 120,
    burstEnabled: true,
    burstSize: 25,
    burstInterval: 5,
    allowCustomScenarios: true,
    replayStoreRetention: "30 days"
  },
  notifications: {
    enableToastPopups: true,
    soundAlert: true,
    smtpServer: "smtp.company.local",
    senderEmail: "no-reply@detectiq.local",
    alertLevel: "HIGH, CRITICAL"
  },
  security: {
    sessionTimeout: 30,
    mfaRequired: true,
    passwordPolicy: "8 chars, 1 uppercase, 1 digit",
    defaultRole: "Analyst",
    rateLimiting: 100
  },
  data: {
    transactionsRetention: 90,
    fraudResultsRetention: 365,
    anonymizeSensitiveFields: true,
    automaticBackup: "Daily"
  },
  integrations: {
    mlEngineUrl: ML_ENGINE_URL,
    mlTimeout: 3000,
    geolocationApi: "https://api.ip2location.com/v2/",
    webhookExternal: "https://hooks.example.com/detectiq"
  },
  monitoring: {
    apiHealthCheckInterval: 30,
    mlHealthCheck: true,
    databaseHealthCheck: true,
    prometheusExporter: true
  },
  ui: {
    logo: "detectiq-logo.png",
    favicon: "detectiq.ico",
    dashboardLayout: "Grid",
    enableDarkMode: true
  }
};

export const analystDefaults: SettingsState = {
  profile: {
    displayName: "",
    emailAddress: "",
    theme: "Dark",
    defaultDashboard: "Dashboard",
    timeZone: "Asia/Kolkata",
    dateFormat: "DD/MM/YYYY"
  },
  notifications: {
    inAppPopups: true,
    soundAlert: true,
    emailAlerts: true,
    emailFrequency: "Digest (hourly)",
    minimumPriority: "Critical"
  },
  dashboard: {
    showSummaryCards: true,
    showRealTimeMetrics: true,
    showFraudTrendChart: true,
    showTopRulesChart: true,
    showTransactionStream: true,
    defaultTablePageSize: 25
  },
  simulation: {
    defaultSimulationMode: "Continuous",
    defaultScenario: "Mixed",
    defaultTransactionsPerMinute: 120,
    riskMultiplier: "1.5",
    autoStopEnabled: false,
    autoStopAfter: "5000 transactions",
    replaySnapshotName: "replay-{yyyyMMdd}-{user}"
  },
  alerts: {
    defaultAlertView: "Unread alerts only",
    autoMarkAsRead: false,
    highlightCriticalAlerts: true,
    groupAlertsByRule: true
  },
  export: {
    defaultExportFormat: "Excel",
    includeHeaders: true,
    anonymizeSensitiveData: true,
    exportDestination: "Download"
  },
  advanced: {
    debugMode: false,
    showMlScoreInAlerts: true,
    ruleToggleQuickPanel: true
  }
};

export function getRole(role?: string | null): AppRole {
  return role && role.trim().toUpperCase() === "ADMIN" ? "ADMIN" : "ANALYTICS";
}

export function getSettingsDefaults(role?: string | null): SettingsState {
  return cloneSettings(getRole(role) === "ADMIN" ? adminDefaults : analystDefaults);
}

export function getSettingsStorageKey(role?: string | null, email?: string | null) {
  if (getRole(role) === "ADMIN") {
    return "detectiq-settings-admin-global";
  }
  const normalizedEmail = normalizeEmail(email);
  return `detectiq-settings-analyst-${normalizedEmail || "profile"}`;
}

export function loadStoredSettings(storageKey: string, defaults: SettingsState) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return cloneSettings(defaults);
    return mergeDeep(cloneSettings(defaults), JSON.parse(raw));
  } catch {
    return cloneSettings(defaults);
  }
}

export function cloneSettings(settings: SettingsState) {
  return JSON.parse(JSON.stringify(settings)) as SettingsState;
}

export function mergeDeep(target: SettingsState, source: SettingsState): SettingsState {
  Object.keys(source || {}).forEach((key) => {
    const sourceValue = source[key];
    if (sourceValue && typeof sourceValue === "object" && !Array.isArray(sourceValue)) {
      target[key] = mergeDeep({ ...(target[key] || {}) }, sourceValue);
    } else {
      target[key] = sourceValue;
    }
  });
  return target;
}

export function resolveApplicationName(settings?: SettingsState) {
  const appName = settings?.general?.applicationName?.trim();
  return appName || "DetectIQ";
}

export function resolveDefaultDashboardRoute(role?: string | null, settings?: SettingsState) {
  const normalizedRole = getRole(role);
  const dashboard = normalizedRole === "ADMIN" ? settings?.general?.defaultDashboard : settings?.profile?.defaultDashboard;
  switch (dashboard) {
    case "Simulation":
      return normalizedRole === "ADMIN" ? "/simulation" : "/";
    case "Analytics":
      return "/analytics";
    case "Transactions":
      return normalizedRole === "ADMIN" ? "/transactions" : "/transactions";
    case "Dashboard":
    default:
      return "/";
  }
}

export function shouldMaskSensitiveData(settings?: SettingsState) {
  return settings?.data?.anonymizeSensitiveFields !== false;
}

export function getDefaultTablePageSize(settings?: SettingsState) {
  const value = Number(settings?.dashboard?.defaultTablePageSize || 25);
  return [10, 25, 50, 100].includes(value) ? value : 25;
}

export function shouldShowDashboardWidget(settings?: SettingsState, key?: "showSummaryCards" | "showRealTimeMetrics" | "showFraudTrendChart" | "showTopRulesChart" | "showTransactionStream") {
  if (!key) return true;
  return settings?.dashboard?.[key] !== false;
}

export function getNotificationPolicy(settings?: SettingsState) {
  return {
    inAppPopups: settings?.notifications?.inAppPopups !== false,
    soundAlert: settings?.notifications?.soundAlert !== false,
    emailAlerts: settings?.notifications?.emailAlerts !== false,
    highlightCriticalAlerts: settings?.alerts?.highlightCriticalAlerts !== false,
    groupAlertsByRule: settings?.alerts?.groupAlertsByRule !== false,
    defaultAlertView: settings?.alerts?.defaultAlertView || "Unread alerts only"
  };
}

export function resolveThemeMode(role?: string | null, settings?: SettingsState) {
  const normalizedRole = getRole(role);
  const rawTheme = normalizedRole === "ADMIN" ? settings?.general?.theme : settings?.profile?.theme;
  const theme = String(rawTheme || "Dark").trim().toLowerCase();
  if (settings?.ui?.enableDarkMode === false) {
    return "light";
  }
  if (theme === "system") {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) {
      return "light";
    }
    return "dark";
  }
  return theme === "light" ? "light" : "dark";
}

function normalizeEmail(email?: string | null) {
  return (email || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
