const AUTH_KEY = "detectiq-auth";

export type AuthSession = {
  token: string;
  email: string;
  userName?: string;
  role: string;
  issuedAt?: number;
  lastActivityAt?: number;
  sessionTimeoutMinutes?: number;
  mfaVerified?: boolean;
  mfaChallengeId?: string;
};

export function getSession(): AuthSession | null {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function setSession(session: AuthSession, emitEvent = true) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  if (emitEvent) {
    notifySessionChanged();
  }
}

export function clearSession() {
  localStorage.removeItem(AUTH_KEY);
  notifySessionChanged();
}

export function isAuthenticated() {
  return Boolean(getSession()?.token);
}

export function createSession(session: AuthSession, sessionTimeoutMinutes = 30) {
  const now = Date.now();
  return {
    ...session,
    issuedAt: now,
    lastActivityAt: now,
    sessionTimeoutMinutes
  };
}

export function touchSession() {
  const session = getSession();
  if (!session) return null;
  const next = { ...session, lastActivityAt: Date.now() };
  setSession(next, false);
  return next;
}

export function isSessionExpired(session?: AuthSession | null) {
  if (!session?.token) return true;
  const timeoutMinutes = Number(session.sessionTimeoutMinutes || 30);
  const startedAt = Number(session.lastActivityAt || session.issuedAt || 0);
  if (!startedAt) return false;
  return Date.now() - startedAt > timeoutMinutes * 60_000;
}

function notifySessionChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event("detectiq:session-changed"));
}
