import { NavLink } from "react-router-dom";
import { getSession } from "../services/auth";
import { useAppSettings } from "../context/AppSettingsContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/history", label: "History", icon: "history" },
  { to: "/alerts", label: "Alerts", icon: "alerts" },
  { to: "/detection", label: "Detection", icon: "detection" },
  { to: "/analytics", label: "Analytics", icon: "analytics" },
  { to: "/transactions", label: "Transactions", icon: "transactions" },
  { to: "/cases", label: "Cases", icon: "cases" },
  { to: "/simulation", label: "Simulation", icon: "simulation" },
  { to: "/settings", label: "Settings", icon: "settings" },
  { to: "/profile", label: "Profile", icon: "profile" },
  { to: "/admin", label: "Admin", icon: "admin" }
];

export default function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const session = getSession();
  const { appName } = useAppSettings();
  const items = session?.role === "ADMIN" ? navItems : navItems.filter((item) => item.to !== "/admin");

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="logo">
        <span className="sidebar-brand-mark" aria-hidden="true" />
        <div className="sidebar-brand-copy">
          <div style={{ fontSize: 15, fontWeight: 700 }}>{appName}</div>
          <div style={{ fontSize: 12, color: "#9fb2d9" }}>Monitor & Respond</div>
        </div>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `side-link${isActive ? " active" : ""}`}
            title={collapsed ? item.label : undefined}
          >
            <span className="side-link-icon" aria-hidden="true">
              <NavGlyph kind={item.icon} />
            </span>
            <span style={{ flex: 1 }}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div style={{ color: "#9fb2d9", fontSize: 12 }}>Signed in as</div>
        <div className="sidebar-footer-value">{session?.email || "admin@console.local"}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Operational</div>
      </div>
    </aside>
  );
}

function NavGlyph({ kind }: { kind: string }) {
  switch (kind) {
    case "dashboard":
      return <svg viewBox="0 0 24 24"><path d="M4 13h7V4H4v9zm9 7h7V10h-7v10zM4 20h7v-5H4v5zm9-12h7V4h-7v4z" /></svg>;
    case "history":
      return <svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 1 0 8.95 10H20a7 7 0 1 1-2.05-4.95L15 11h6V5l-2.26 2.26A9 9 0 0 0 13 3zm-1 4v6l5 3" /></svg>;
    case "alerts":
      return <svg viewBox="0 0 24 24"><path d="M12 22a2.4 2.4 0 0 0 2.2-1.5H9.8A2.4 2.4 0 0 0 12 22zm6-6H6l1.5-1.8V10a4.5 4.5 0 0 1 9 0v4.2L18 16z" /></svg>;
    case "detection":
      return <svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V5l-8-3zm0 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" /></svg>;
    case "analytics":
      return <svg viewBox="0 0 24 24"><path d="M4 19h16M6 17V9m6 8V5m6 12v-6" /></svg>;
    case "transactions":
      return <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h10M4 17h16M18 6l2 1-2 1m-9 4 2 1-2 1m10 4 2 1-2 1" /></svg>;
    case "cases":
      return <svg viewBox="0 0 24 24"><path d="M5 5h14v14H5zm3 3h8M8 12h8M8 16h5" /></svg>;
    case "simulation":
      return <svg viewBox="0 0 24 24"><path d="M5 19h14M7 17V9m5 8V5m5 12v-4" /></svg>;
    case "settings":
      return <svg viewBox="0 0 24 24"><path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5zm8 3.5-.9-.5.1-1.1-1.8-3.1-1.1.2-.6-.9-3.4 0-.6.9-1.1-.2-1.8 3.1.1 1.1-.9.5v4l.9.5-.1 1.1 1.8 3.1 1.1-.2.6.9 3.4 0 .6-.9 1.1.2 1.8-3.1-.1-1.1.9-.5v-4z" /></svg>;
    case "profile":
      return <svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-7 9a7 7 0 0 1 14 0" /></svg>;
    case "admin":
      return <svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V6l-8-3zm-1 5h2v6h-2zm0 8h2v2h-2z" /></svg>;
    default:
      return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /></svg>;
  }
}
