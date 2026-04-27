import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PasswordField from "../components/PasswordField";
import { getSettingsProfile, loginAdmin, verifyLoginMfa } from "../services/alertService";
import { createSession, setSession } from "../services/auth";
import { validateLoginFields } from "../utils/validation";
import { resolveDefaultDashboardRoute } from "../settings/appSettings";
import { useAppSettings } from "../context/AppSettingsContext";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const authState = location.state as { from?: string; message?: string; passwordUpdated?: boolean; email?: string } | null;
  const [email, setEmail] = useState(authState?.passwordUpdated ? authState.email || "" : "");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaMessage, setMfaMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { settings } = useAppSettings();
  const successMessage = authState?.passwordUpdated
    ? authState.message || "Password updated successfully. Please log in."
    : "";
  const noticeMessage = !authState?.passwordUpdated && authState?.message ? authState.message : "";

  const handleInitialLogin = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validateLoginFields({ email, password });
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError("");
    setMfaMessage("");
    setMfaRequired(false);
    setMfaChallengeId("");
    setMfaCode("");
    try {
      const res = await loginAdmin(email, password);
      if (!res.success) {
        throw new Error("Invalid credentials");
      }
      if (res.mfaRequired) {
        setMfaRequired(true);
        setMfaChallengeId(res.challengeId || "");
        setMfaMessage(res.message || "Verification code sent to your email.");
        setPassword("");
        setError("");
        return;
      }
      await finalizeLogin(res);
    } catch (err) {
      setError(extractMessage(err, "Login failed. Check your credentials."));
    } finally {
      setLoading(false);
    }
  };

  const verifyMfa = async (e: FormEvent) => {
    e.preventDefault();
    if (!mfaChallengeId || !mfaCode.trim()) {
      setError("Enter the verification code sent to your email.");
      return;
    }
    setLoading(true);
    setError("");
    setMfaMessage("");
    try {
      const res = await verifyLoginMfa(mfaChallengeId, mfaCode.trim());
      if (!res.success || !res.token) {
        throw new Error(res.message || "Verification failed");
      }
      await finalizeLogin(res);
    } catch (err) {
      setError(extractMessage(err, "Verification failed"));
    } finally {
      setLoading(false);
    }
  };

  const finalizeLogin = async (res: Awaited<ReturnType<typeof loginAdmin>>) => {
    const timeoutMinutes = res.sessionTimeoutMinutes || Number(settings?.security?.sessionTimeout || 30);
    setSession(createSession({
      token: res.token || "",
      email: res.email || email,
      userName: res.userName || res.email || email,
      role: res.role || "ADMIN"
    }, timeoutMinutes));
    const profile = await getSettingsProfile().catch(() => null);
    const defaultRoute = resolveDefaultDashboardRoute(res.role || "ANALYTICS", profile?.settings || undefined);
    navigate(authState?.from || defaultRoute);
  };

  const extractMessage = (err: unknown, fallback: string) => {
    const maybeError = err as { response?: { data?: { message?: string } }; message?: string };
    return maybeError?.response?.data?.message || maybeError?.message || fallback;
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={mfaRequired ? verifyMfa : handleInitialLogin}>
        <p className="muted" style={{ margin: 0 }}>DetectIQ Access</p>
        <h1 style={{ marginTop: 8 }}>Login</h1>
        <p className="muted">Access the fraud operations console with your assigned role.</p>
        <label className="field">
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {mfaRequired ? (
          <label className="field">
            <span>Verification Code</span>
            <input
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              placeholder="Enter 6-digit code"
            />
          </label>
        ) : null}
        {successMessage ? <div className="success-box">{successMessage}</div> : null}
        {noticeMessage ? <div className="success-box">{noticeMessage}</div> : null}
        {mfaMessage ? <div className="success-box">{mfaMessage}</div> : null}
        {error ? <div className="error-box">{error}</div> : null}
        <button className="btn-accent" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Please wait..." : mfaRequired ? "Verify Code" : "Login"}
        </button>
        <div className="auth-links">
          <Link to="/forgot-password">Forgot Password</Link>
          <Link to="/signup">Signup</Link>
        </div>
      </form>
    </div>
  );
}
