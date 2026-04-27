import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import PasswordField from "../components/PasswordField";
import { changePassword } from "../services/alertService";
import { clearSession, getSession } from "../services/auth";

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8}$/;

const getPasswordChecks = (password: string) => [
  { label: "Exactly 8 characters", passed: password.length === 8 },
  { label: "At least 1 uppercase letter", passed: /[A-Z]/.test(password) },
  { label: "At least 1 lowercase letter", passed: /[a-z]/.test(password) },
  { label: "At least 1 digit", passed: /\d/.test(password) },
  { label: "At least 1 special character", passed: /[^A-Za-z0-9]/.test(password) }
];

const getPasswordStrength = (password: string) => {
  if (!password) {
    return { label: "Start typing to check password rules", tone: "muted" };
  }

  const passedChecks = getPasswordChecks(password).filter((check) => check.passed).length;
  if (PASSWORD_PATTERN.test(password)) {
    return { label: "Strong password", tone: "strong" };
  }
  if (passedChecks >= 3) {
    return { label: "Almost there", tone: "medium" };
  }
  return { label: "Weak password", tone: "weak" };
};

export default function Profile() {
  const session = getSession();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordChecks = getPasswordChecks(newPassword);
  const passwordStrength = getPasswordStrength(newPassword);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!session?.email) {
      setError("No signed-in user was found.");
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All password fields are required.");
      return;
    }
    if (!PASSWORD_PATTERN.test(newPassword)) {
      setError("Password must be exactly 8 characters with uppercase, lowercase, digit, and special character.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await changePassword({
        email: session.email,
        currentPassword,
        newPassword,
        confirmPassword
      });
      clearSession();
      navigate("/login", {
        replace: true,
        state: { passwordUpdated: true, message: res.message, email: session.email }
      });
    } catch (err) {
      if (typeof err === "object" && err && "response" in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response;
        setError(response?.data?.message || "Unable to update your password right now.");
      } else {
        setError("Unable to update your password right now.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="section">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ marginTop: 0 }}>Profile</h3>
          <p className="muted">Review your signed-in account details and update your password securely.</p>
        </div>
        <div className="cards-inline">
          <span className={`chip ${session?.role === "ADMIN" ? "high" : "approved"}`}>{session?.role || "USER"}</span>
          <span className="chip approved">{session?.email || "No email"}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <div className="section" style={{ background: "#0f1a2b" }}>
          <h4 style={{ marginTop: 0 }}>Account Details</h4>
          <div className="mini-panel" style={{ display: "grid", gap: 10 }}>
            <div>
              <div className="muted">User Name</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{session?.userName || "Unknown User"}</div>
            </div>
            <div>
              <div className="muted">Email</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{session?.email || "Unknown Email"}</div>
            </div>
            <div>
              <div className="muted">Role</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{session?.role || "Unknown Role"}</div>
            </div>
          </div>
        </div>

        <form className="section" style={{ background: "#0f1a2b" }} onSubmit={onSubmit}>
          <h4 style={{ marginTop: 0 }}>Change Password</h4>
          <p className="muted">Use your current password, then choose a new password that follows the same security rules.</p>
          <label className="field">
            <span>Current Password</span>
            <PasswordField value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="field">
            <span>New Password</span>
            <PasswordField value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <div className="password-checklist" aria-live="polite">
            <div className={`password-strength ${passwordStrength.tone}`}>{passwordStrength.label}</div>
            <div className="password-checklist-title">Password rules</div>
            <div className="password-checklist-grid">
              {passwordChecks.map((check) => (
                <div key={check.label} className={`password-check-item${check.passed ? " passed" : ""}`}>
                  <span className="password-check-icon" aria-hidden="true">{check.passed ? "✓" : "•"}</span>
                  <span>{check.label}</span>
                </div>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Confirm Password</span>
            <PasswordField value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </label>
          {error ? <div className="error-box">{error}</div> : null}
          <button className="btn-accent" type="submit" disabled={loading}>
            {loading ? "Updating Password..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
