import { useEffect, useState } from "react";
import type { InputHTMLAttributes } from "react";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  timeoutMs?: number;
};

export default function PasswordField({
  timeoutMs = 15000,
  value,
  className,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setVisible(false);
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [visible, timeoutMs, value]);

  return (
    <div className={`password-field-shell${className ? ` ${className}` : ""}`}>
      <input {...props} type={visible ? "text" : "password"} value={value} className="password-input" />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M10.58 10.58A2 2 0 0012 16a2 2 0 001.42-.58" />
            <path d="M9.88 5.09A10.94 10.94 0 0112 5c5.05 0 9.27 3.11 10 7-0.29 1.55-1.19 2.97-2.53 4.09" />
            <path d="M6.71 6.72C4.68 7.82 3.24 9.73 2 12c0.73 3.89 4.95 7 10 7 1.61 0 3.14-.32 4.5-.89" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
