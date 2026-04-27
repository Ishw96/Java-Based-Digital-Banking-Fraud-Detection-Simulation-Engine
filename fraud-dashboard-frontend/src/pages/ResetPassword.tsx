import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PasswordField from "../components/PasswordField";
import { updatePassword, validatePasswordResetToken } from "../services/alertService";

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8}$/;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const [recoveredEmail, setRecoveredEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    const validateToken = async () => {
      if (!token) {
        if (active) {
          setError("Verification link is invalid or expired.");
          setValidating(false);
        }
        return;
      }

      try {
        const res = await validatePasswordResetToken(token);
        if (!active) {
          return;
        }
        setMessage(res.message);
        setRecoveredEmail(res.email || "");
        setError("");
      } catch (err) {
        if (!active) {
          return;
        }
        if (axios.isAxiosError(err)) {
          setError(String(err.response?.data?.message || "Verification link is invalid or expired."));
        } else {
          setError("Verification link is invalid or expired.");
        }
        setMessage("");
      } finally {
        if (active) {
          setValidating(false);
        }
      }
    };

    void validateToken();

    return () => {
      active = false;
    };
  }, [token]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!PASSWORD_PATTERN.test(password)) {
      setError("Password must be exactly 8 characters with uppercase, lowercase, digit, and special character.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await updatePassword({
        token,
        password,
        confirmPassword
      });
      navigate("/login", {
        replace: true,
        state: { passwordUpdated: true, message: res.message, email: recoveredEmail }
      });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(String(err.response?.data?.message || "Unable to update password. Please request a new reset email."));
      } else {
        setError("Unable to update password. Please request a new reset email.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={onSubmit}>
        <p className="muted" style={{ margin: 0 }}>DetectIQ Access</p>
        <h1 style={{ marginTop: 8 }}>Update Password</h1>
        <p className="muted">Verify your new password and finish the secure recovery flow.</p>
        {validating ? <div className="mini-panel">Validating your recovery link...</div> : null}
        {!validating && error ? <div className="error-box">{error}</div> : null}
        {!validating && message ? <div className="success-box">{message}</div> : null}
        {!validating && !error ? (
          <>
            <label className="field">
              <span>New Password</span>
              <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <label className="field">
              <span>Confirm Password</span>
              <PasswordField value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <button className="btn-accent" type="submit" disabled={submitting} style={{ width: "100%" }}>
              {submitting ? "Updating password..." : "Update Password"}
            </button>
            <div className="mini-panel" style={{ marginTop: 16 }}>
              <div className="muted">Password Rules</div>
              <ul style={{ marginTop: 10, paddingLeft: 18, color: "#cfe0ff", lineHeight: 1.8 }}>
                <li>Exactly 8 characters.</li>
                <li>At least 1 uppercase, 1 lowercase, 1 digit, and 1 special character.</li>
              </ul>
            </div>
          </>
        ) : null}
        <div className="auth-links">
          <Link to="/forgot-password">Back to Forgot Password</Link>
          <Link to="/login">Go to Login</Link>
        </div>
      </form>
    </div>
  );
}
