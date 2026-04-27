import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import History from "./pages/History";
import Alerts from "./pages/Alerts";
import Transactions from "./pages/Transactions";
import Cases from "./pages/Cases";
import Admin from "./pages/Admin";
import Detection from "./pages/Detection";
import Profile from "./pages/Profile";
import Simulation from "./pages/Simulation";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import RequireAuth from "./components/RequireAuth";
import { clearSession, getSession } from "./services/auth";
import { getDashboardOverview, logoutSession } from "./services/alertService";
import { useEffect, useState } from "react";
import type { DashboardOverview } from "./services/alertService";
import "./styles/layout.css";
import { AppSettingsProvider, useAppSettings } from "./context/AppSettingsContext";
import { getNotificationPolicy, shouldMaskSensitiveData } from "./settings/appSettings";

const titleMap: Record<string, string> = {
  "/": "Dashboard",
  "/history": "History",
  "/alerts": "Alerts",
  "/detection": "Detection",
  "/analytics": "Analytics",
  "/transactions": "Transactions",
  "/cases": "Case Management",
  "/admin": "Admin",
  "/simulation": "Simulation",
  "/settings": "Settings",
  "/profile": "Profile",
  "/signup": "Signup",
  "/forgot-password": "Forgot Password",
  "/reset-password": "Update Password"
};

export default function App() {
  return (
    <AppSettingsProvider>
      <AppShell />
    </AppSettingsProvider>
  );
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [showAlertPopup, setShowAlertPopup] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem("detectiq-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const session = getSession();
  const publicRoutes = ["/login", "/signup", "/forgot-password", "/reset-password"];
  const canAccessAdmin = session?.role === "ADMIN";
  const isAnalyst = session?.role === "ANALYTICS";
  const { settings, appName, defaultDashboardRoute } = useAppSettings();
  const notificationPolicy = getNotificationPolicy(settings);
  const title = location.pathname === "/" && isAnalyst ? "Analyst Dashboard" : titleMap[location.pathname] || appName;
  const lastSyncLabel = overview?.lastSyncAt ? new Date(overview.lastSyncAt).toLocaleString() : "Waiting for sync...";

  const loadOverview = async () => {
    try {
      setOverview(await getDashboardOverview());
    } catch {
      setOverview(null);
    }
  };

  useEffect(() => {
    const syncHandler = () => loadOverview();
    window.addEventListener("fraud:sync", syncHandler);
    queueMicrotask(() => {
      void loadOverview();
    });
    return () => window.removeEventListener("fraud:sync", syncHandler);
  }, []);

  useEffect(() => {
    if (!session || publicRoutes.includes(location.pathname)) {
      setShowAlertPopup(false);
      return;
    }

    const hasHighPriorityAlerts = Number(overview?.highAlerts || 0) + Number(overview?.criticalAlerts || 0) > 0;
    const hasUnreadAlerts = Number(overview?.unreadAlerts || 0) > 0;
    const popupKey = `detectiq-login-popup-${session.email || session.token}`;

    if (notificationPolicy.inAppPopups && (hasHighPriorityAlerts || hasUnreadAlerts) && !sessionStorage.getItem(popupKey)) {
      setShowAlertPopup(true);
    } else {
      setShowAlertPopup(false);
    }
  }, [location.pathname, notificationPolicy.inAppPopups, overview, session, publicRoutes]);

  useEffect(() => {
    if (!showAlertPopup || !notificationPolicy.soundAlert) {
      return;
    }
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      const audioContext = new AudioContextCtor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.value = 0.03;
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      window.setTimeout(() => {
        oscillator.stop();
        audioContext.close().catch(() => undefined);
      }, 180);
    } catch {
      // Ignore autoplay restrictions and audio failures.
    }
  }, [notificationPolicy.soundAlert, showAlertPopup]);

  useEffect(() => {
    try {
      window.localStorage.setItem("detectiq-sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }, [sidebarCollapsed]);

  const handleSync = async () => {
    window.dispatchEvent(new Event("fraud:sync"));
    await loadOverview();
  };

  const handleAlerts = async () => {
    await loadOverview();
    navigate("/alerts");
  };

  const handleLogout = async () => {
    if (session?.email || session?.token) {
      sessionStorage.removeItem(`detectiq-login-popup-${session.email || session.token}`);
    }
    try {
      await logoutSession();
    } catch {
      // Ignore logout API failures and fall back to local sign-out.
    }
    clearSession();
    navigate("/login");
  };

  if (publicRoutes.includes(location.pathname)) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!canAccessAdmin && location.pathname === "/admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <RequireAuth>
      <div className={`app-layout${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <Sidebar collapsed={sidebarCollapsed} />
        <div className="main-shell">
          <div className="topbar">
            <div className="topbar-left">
              <button
                className="icon-pill topbar-toggle"
                onClick={() => setSidebarCollapsed((value) => !value)}
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                type="button"
              >
                <span aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span>
              </button>
              <div className="topbar-title-group">
                <div className="topbar-eyebrow">DetectIQ Operations Console</div>
                <div className="topbar-title-row">
                  <h2 style={{ margin: 0 }}>{title}</h2>
                  <span className="topbar-badge">{canAccessAdmin ? "Admin" : "Analyst"}</span>
                </div>
                <div className="topbar-meta">
                  <span className="topbar-meta-item">Live sync</span>
                  <span className="topbar-meta-item">{lastSyncLabel}</span>
                  <span className="topbar-meta-item">{shouldMaskSensitiveData(settings) ? "Sensitive data masked" : "Sensitive data visible"}</span>
                </div>
              </div>
            </div>
            <div className="topbar-right">
              <span className="chip topbar-chip approved">{overview?.unreadAlerts || 0} Unread</span>
              <span className={`chip topbar-chip ${canAccessAdmin ? "high" : "approved"}`}>
                {canAccessAdmin ? "Admin" : "Analyst"}
              </span>
              <span className="chip topbar-chip approved">{shouldMaskSensitiveData(settings) ? "Masked Data On" : "Masked Data Off"}</span>
              <button className="icon-pill nav-action" onClick={handleSync} title="Sync Data" type="button">
                <span>⟳</span>
                <span>Sync Data</span>
              </button>
              <button className="icon-pill bell nav-action" onClick={handleAlerts} title="Alerts" type="button">
                <span>🔔</span>
                <span className="badge-floating">{overview?.unreadAlerts || 0}</span>
              </button>
              {canAccessAdmin ? <button className="pill nav-action" onClick={() => navigate("/admin")} type="button">ADMIN</button> : null}
              <button className="pill nav-action" onClick={() => navigate("/settings")} type="button">Settings</button>
              <button className="pill logout nav-action" onClick={handleLogout} type="button">Logout</button>
              <button
                className="pill user-pill user-profile-button nav-action"
                onClick={() => navigate("/profile")}
                title="Open Profile"
                type="button"
              >
                <span aria-hidden="true" className="user-pill-avatar">PR</span>
                {session?.userName || session?.email || "admin"}
              </button>
            </div>
          </div>
          <div className="content-scroll">
            <Routes>
              <Route path="/" element={defaultDashboardRoute !== "/" ? <Navigate to={defaultDashboardRoute} replace /> : <Dashboard syncKey={overview?.lastSyncAt || ""} />} />
              <Route path="/history" element={<History syncKey={overview?.lastSyncAt || ""} />} />
              <Route path="/alerts" element={<Alerts syncKey={overview?.lastSyncAt || ""} />} />
              <Route path="/detection" element={<Detection syncKey={overview?.lastSyncAt || ""} />} />
              <Route path="/analytics" element={<Analytics syncKey={overview?.lastSyncAt || ""} />} />
              <Route path="/transactions" element={<Transactions syncKey={overview?.lastSyncAt || ""} />} />
              <Route path="/cases" element={<Cases syncKey={overview?.lastSyncAt || ""} />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/simulation" element={<Simulation />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/signup" element={<Navigate to="/login" replace />} />
              <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
          {showAlertPopup ? (
            <div className="popup-overlay" role="dialog" aria-modal="true" aria-label="Login alert notification">
              <div className="popup-card">
                <div className="popup-badge">Alert Notice</div>
                <h3>HIGH_RISK and CRITICAL_RISK alerts are ready for review</h3>
                <p className="muted">
                  The system found unread high-priority alerts after your login. Please review them in the Alerts page as soon as possible.
                </p>
                <div className="cards-inline" style={{ marginTop: 12 }}>
                  <span className="chip high">Critical: {overview?.criticalAlerts || 0}</span>
                  <span className="chip medium">High: {overview?.highAlerts || 0}</span>
                  <span className="chip approved">Unread: {overview?.unreadAlerts || 0}</span>
                </div>
                <div className="action-row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
                  <button className="pill" onClick={() => navigate("/alerts")}>Open Alerts</button>
                  <button
                    className="btn-accent"
                    onClick={() => {
                      if (session?.email || session?.token) {
                        sessionStorage.setItem(`detectiq-login-popup-${session.email || session.token}`, "1");
                      }
                      setShowAlertPopup(false);
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </RequireAuth>
  );
}
