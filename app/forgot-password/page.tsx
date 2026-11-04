"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { AuthSplitLayout } from "../components/auth/AuthSplitLayout";
import styles from "../components/auth/AuthLayout.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (response.ok) setSent(true);
      else setError((await response.json().catch(() => ({}))).error || "Something went wrong. Try again in a moment.");
    } catch {
      setError("Network error. Could not connect to system.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthSplitLayout greeting="It happens to everyone.">
      <div className={styles.formContent}>
        <h1 className={styles.headline}><span className={styles.headlinePrimary}>Choose a new password.</span></h1>
        {sent ? (
          <div className={styles.notice} role="status">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>If an account uses that email address, a link to choose a new password is on its way. It works once, for 30 minutes.</span>
          </div>
        ) : (
          <>
            {error && <div className={`${styles.notice} ${styles.errorNotice}`} role="alert"><span>{error}</span></div>}
            <form onSubmit={submit} className={styles.formGroup} aria-busy={isLoading}>
              <div>
                <label className={styles.fieldLabel} htmlFor="email">Email</label>
                <div className={styles.inputWrapper}>
                  <Mail className={styles.inputIcon} />
                  <input id="email" type="email" placeholder="The email you signed up with" required value={email} onChange={(event) => setEmail(event.target.value)} className={styles.inputField} disabled={isLoading} autoComplete="email" />
                </div>
              </div>
              <button type="submit" className={styles.submitBtn} disabled={isLoading}>
                <span>{isLoading ? "Sending…" : "Send the link"}</span>
                {!isLoading && <ArrowRight aria-hidden="true" />}
              </button>
            </form>
          </>
        )}
        <p className={styles.footerText}>
          Remembered it?{" "}
          <Link href="/login" className={styles.footerLink}>Sign in</Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
}
