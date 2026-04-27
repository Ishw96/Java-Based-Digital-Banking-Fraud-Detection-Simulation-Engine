import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { clearSession, getSession, isAuthenticated, isSessionExpired } from "../services/auth";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const session = getSession();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (isSessionExpired(session)) {
    clearSession();
    return <Navigate to="/login" replace state={{ from: location.pathname, message: "Session expired. Please log in again." }} />;
  }

  return children;
}
