"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { AuthSplitLayout } from "../components/auth/AuthSplitLayout";
import styles from "../components/auth/AuthLayout.module.css";

// The token travels in the address's fragment, so it is never sent to a server in a request line, a log or a Referer header. It is read once, and then it
// leaves the address bar and the history entry. Null is the server's answer and the first paint, and an empty string means there was no token.
let captured: string | undefined;
function readToken() {
  if (captured === undefined) {
    const found = new URLSearchParams(window.location.hash.slice(1)).get("token");
    captured = found ?? "";
    if (found) window.history.replaceState(null, "", window.location.pathname);
  }
  return captured;
}
const watchNothing = () => () => undefined;

export default function ResetPasswordPage() {
  const token = useSyncExternalStore<string | null>(watchNothing, readToken, () => null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length < 6) return setError("Use at least 6 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setDone(true);
      else setError(data.error || "Something went wrong. Try again in a moment.");
    } catch {
      setError("Network error. Could not connect to system.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthSplitLayout greeting="A fresh start.">
      <div className={styles.formContent}>
        <h1 className={styles.headline}><span className={styles.headlinePrimary}>Choose a new password.</span></h1>
        {done ? (
          <>
            <div className={styles.notice} role="status"><ShieldCheck className="w-4 h-4 shrink-0" /><span>Your password is changed, and every device was signed out. Sign in with the new one.</span></div>
            <p className={styles.footerText}><Link href="/login" className={styles.footerLink}>Sign in</Link></p>
          </>
        ) : token === "" ? (
          <>
            <div className={`${styles.notice} ${styles.errorNotice}`} role="alert"><span>This link isn&apos;t complete. Open it again from your email, or ask for a new one.</span></div>
            <p className={styles.footerText}><Link href="/forgot-password" className={styles.footerLink}>Ask for a new link</Link></p>
          </>
        ) : (
          <>
            {error && <div className={`${styles.notice} ${styles.errorNotice}`} role="alert"><span>{error}</span></div>}
            <form onSubmit={submit} className={styles.formGroup} aria-busy={isLoading}>
              <div>
                <label className={styles.fieldLabel} htmlFor="new-password">New password</label>
                <div className={styles.inputWrapper} data-private-field>
                  <Lock className={styles.inputIcon} />
                  <input id="new-password" type={showPassword ? "text" : "password"} placeholder="At least 6 characters" required value={password} onChange={(event) => setPassword(event.target.value)} className={styles.inputField} disabled={isLoading || token === null} autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className={styles.passwordToggle} aria-pressed={showPassword} disabled={isLoading} aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className={styles.fieldLabel} htmlFor="confirm-password">Again, to be sure</label>
                <div className={styles.inputWrapper} data-private-field>
                  <Lock className={styles.inputIcon} />
                  <input id="confirm-password" type={showPassword ? "text" : "password"} required value={confirm} onChange={(event) => setConfirm(event.target.value)} className={styles.inputField} disabled={isLoading || token === null} autoComplete="new-password" />
                </div>
              </div>
              <button type="submit" className={styles.submitBtn} disabled={isLoading || token === null}>
                <span>{isLoading ? "Saving…" : "Change password"}</span>
                {!isLoading && <ArrowRight aria-hidden="true" />}
              </button>
            </form>
          </>
        )}
      </div>
    </AuthSplitLayout>
  );
}
