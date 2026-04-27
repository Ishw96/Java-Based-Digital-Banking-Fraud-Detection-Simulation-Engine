import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import PasswordField from "../components/PasswordField";
import { getAdminRecipients, signupUser } from "../services/alertService";
import { validateSignupFields } from "../utils/validation";

export default function Signup() {
  const [userName, setUserName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [adminContacts, setAdminContacts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getAdminRecipients().then(setAdminContacts).catch(() => setAdminContacts([]));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const validationError = validateSignupFields({ userName, phoneNumber, email, password, confirmPassword, invitationCode });
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      await signupUser({ userName, phoneNumber, email, password, confirmPassword, invitationCode });
      setSuccess("Signup complete. You can log in now.");
      setTimeout(() => navigate("/login"), 1000);
    } catch {
      setError("Signup failed. Check the invitation code and your inputs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <form className="login-card wide" onSubmit={onSubmit}>
        <p className="muted" style={{ margin: 0 }}>DetectIQ Access</p>
        <h1 style={{ marginTop: 8 }}>Analyst Signup</h1>
        <p className="muted">Role is locked by invitation code. Admins provision access from the console.</p>
        <div className="mini-panel" style={{ marginTop: 16 }}>
          <div className="muted">Password rules</div>
          <div style={{ marginTop: 8, color: "#cfe0ff", lineHeight: 1.7, fontSize: 13 }}>
            Exactly 8 characters with at least 1 uppercase, 1 lowercase, 1 digit, and 1 special character.
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>User Name</span>
            <input value={userName} onChange={(e) => setUserName(e.target.value)} />
          </label>
          <label className="field">
            <span>Phone Number</span>
            <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} inputMode="numeric" maxLength={10} />
          </label>
          <label className="field">
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Invitation Code</span>
            <input value={invitationCode} onChange={(e) => setInvitationCode(e.target.value)} placeholder="INV-78X9P" />
          </label>
          <label className="field">
            <span>Password</span>
            <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <label className="field">
            <span>Confirm Password</span>
            <PasswordField value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </label>
        </div>
        <div className="role-lock">Role: ANALYTICS (locked by invitation code)</div>
        {error ? <div className="error-box">{error}</div> : null}
        {success ? <div className="success-box">{success}</div> : null}
        <button className="btn-accent" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Creating account..." : "Create Account"}
        </button>
        <div className="auth-links">
          <Link to="/login">Back to Login</Link>
          <Link to="/forgot-password">Forgot Password</Link>
        </div>
        <div className="mini-panel" style={{ marginTop: 18 }}>
          <div className="muted" style={{ marginBottom: 8 }}>Admin contacts</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {adminContacts.length ? adminContacts.map((item) => <span key={item} className="chip approved">{item}</span>) : <span className="muted">No contacts configured</span>}
          </div>
        </div>
      </form>
    </div>
  );
}
