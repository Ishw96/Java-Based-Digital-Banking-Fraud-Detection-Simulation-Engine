import { useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { Link, useSearchParams } from "react-router-dom";
import { requestPasswordRecovery } from "../services/alertService";

export default function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(searchParams.get("message") || "");
  const [error, setError] = useState(searchParams.get("error") || "");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    setLoading(true);
    try {
      const res = await requestPasswordRecovery(email.trim());
      setMessage(res.message);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(String(err.response?.data?.message || "Unable to start recovery right now."));
      } else {
        setError("Unable to start recovery right now.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={onSubmit}>
        <p className="muted" style={{ margin: 0 }}>DetectIQ Access</p>
        <h1 style={{ marginTop: 8 }}>Forgot Password</h1>
        <p className="muted">Enter your email and we will send an interactive verification email with approve / deny buttons.</p>
        <label className="field">
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {error ? <div className="error-box">{error}</div> : null}
        {message ? <div className="success-box">{message}</div> : null}
        <button className="btn-accent" type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Sending verification..." : "Send Verification Email"}
        </button>
        <div className="mini-panel" style={{ marginTop: 16 }}>
          <div className="muted">What happens next</div>
          <ul style={{ marginTop: 10, paddingLeft: 18, color: "#cfe0ff", lineHeight: 1.8 }}>
            <li>The email includes two buttons: Yes, it's me and No, it's not me.</li>
            <li>Yes redirects to the secure update-password page.</li>
            <li>No returns here and blocks the reset attempt with an invalid-user warning.</li>
          </ul>
        </div>
        <div className="auth-links">
          <Link to="/login">Back to Login</Link>
          <Link to="/signup">Go to Signup</Link>
        </div>
      </form>
    </div>
  );
}
