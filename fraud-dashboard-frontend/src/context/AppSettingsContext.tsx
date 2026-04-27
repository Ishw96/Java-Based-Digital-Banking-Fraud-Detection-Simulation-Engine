import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSettingsProfile } from "../services/alertService";
import { getPlatformPolicies, type PlatformPolicies } from "../services/platformService";
import { getSession } from "../services/auth";
import {
  cloneSettings,
  getRole,
  getSettingsDefaults,
  getSettingsStorageKey,
  loadStoredSettings,
  mergeDeep,
  resolveApplicationName,
  resolveDefaultDashboardRoute,
  resolveThemeMode,
  type SettingsState
} from "../settings/appSettings";

type AppSettingsContextValue = {
  role: "ADMIN" | "ANALYTICS";
  settings: SettingsState;
  policies: PlatformPolicies | null;
  appName: string;
  defaultDashboardRoute: string;
  loaded: boolean;
  refreshSettings: () => Promise<void>;
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(() => getSession());
  const role = getRole(session?.role);
  const storageKey = getSettingsStorageKey(role, session?.email);
  const defaults = useMemo(() => getSettingsDefaults(role), [role]);
  const [settings, setSettings] = useState<SettingsState>(() => loadStoredSettings(storageKey, defaults));
  const [policies, setPolicies] = useState<PlatformPolicies | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refreshSettings = useCallback(async () => {
    const cached = loadStoredSettings(storageKey, defaults);
    setSettings(cached);

    if (!session?.email) {
      setPolicies(null);
      setLoaded(true);
      return;
    }

    try {
      const profile = await getSettingsProfile();
      const merged = mergeDeep(cloneSettings(cached), profile.settings || {});
      setSettings(merged);
      localStorage.setItem(storageKey, JSON.stringify(merged));
    } catch {
      // Keep the cached settings if the backend is unavailable.
    }

    try {
      setPolicies(await getPlatformPolicies());
    } catch {
      setPolicies(null);
    } finally {
      setLoaded(true);
    }
  }, [defaults, session?.email, storageKey]);

  useEffect(() => {
    const syncSession = () => setSession(getSession());
    const syncSettings = () => {
      void refreshSettings();
    };
    window.addEventListener("detectiq:session-changed", syncSession);
    window.addEventListener("detectiq:settings-updated", syncSettings);
    return () => {
      window.removeEventListener("detectiq:session-changed", syncSession);
      window.removeEventListener("detectiq:settings-updated", syncSettings);
    };
  }, [refreshSettings]);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      const cached = loadStoredSettings(storageKey, defaults);
      if (active) {
        setSettings(cached);
        setLoaded(false);
      }
      if (!session?.email) {
        if (active) setPolicies(null);
        if (active) setLoaded(true);
        return;
      }
      try {
        const profile = await getSettingsProfile();
        if (!active) return;
        const merged = mergeDeep(cloneSettings(cached), profile.settings || {});
        setSettings(merged);
        localStorage.setItem(storageKey, JSON.stringify(merged));
      } catch {
        // Keep cache when the API is unavailable.
      }
      try {
        const nextPolicies = await getPlatformPolicies();
        if (active) setPolicies(nextPolicies);
      } catch {
        if (active) setPolicies(null);
      } finally {
        if (active) setLoaded(true);
      }
    };
    void sync();
    return () => {
      active = false;
    };
  }, [defaults, session?.email, storageKey]);

  useEffect(() => {
    const theme = resolveThemeMode(role, settings);
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [role, settings]);

  const value = useMemo<AppSettingsContextValue>(() => ({
    role,
    settings,
    policies,
    appName: policies?.applicationName || resolveApplicationName(settings),
    defaultDashboardRoute: resolveDefaultDashboardRoute(role, settings),
    loaded,
    refreshSettings
  }), [loaded, policies, role, settings, refreshSettings]);

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error("useAppSettings must be used within AppSettingsProvider");
  }
  return context;
}
