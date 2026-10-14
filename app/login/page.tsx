"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import OAuthButtons from "../components/OAuthButtons";
import { AuthSplitLayout } from "../components/auth/AuthSplitLayout";
import styles from "../components/auth/AuthLayout.module.css";
import { ArrowRight, Eye, EyeOff, ShieldCheck, Mail, Lock } from "lucide-react";
import { z } from "zod";

const loginSchema = z.object({
  identifier: z.string().min(1, "Please enter your email or username."),
  password: z.string().min(1, "Password is required."),
});

function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setError] = useState("");
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const searchParams = useSearchParams();
  const { login } = useAuth();

  // URLSearchParams already decodes OAuth feedback. Keep it visible until submission.
  const error =
    submitError || (!feedbackDismissed ? searchParams.get("error") || "" : "");
  const infoMessage = feedbackDismissed
    ? ""
    : searchParams.get("verified")
      ? "Your email has been verified. Welcome back, Scholar."
      : searchParams.get("registered")
        ? "Your account is ready. Sign in to begin your journey."
        : "";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFeedbackDismissed(true);
    setIsLoading(true);

    const validation = loginSchema.safeParse({ identifier, password });
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await response.json();

      if (response.ok) {
        login(data.user);
        const redirectTarget = searchParams.get("redirect");
        const destination =
          redirectTarget &&
          redirectTarget.startsWith("/") &&
          !redirectTarget.startsWith("//")
            ? redirectTarget
            : data.user.hasCompletedOnboarding
              ? "/dashboard"
              : "/onboarding";
        window.location.href = destination;
      } else {
        setError(data.error || "Login failed. Check your credentials.");
      }
    } catch {
      setError("Network error. Could not connect to system.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthSplitLayout greeting="Your space is just as you left it.">
      <div className={styles.formContent}>
        <h1 className={styles.headline}>
          <span className={styles.headlinePrimary}>Welcome back.</span>
        </h1>

        {/* Info Notification */}
        {infoMessage && (
          <div className={styles.notice} role="status">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div
            className={`${styles.notice} ${styles.errorNotice}`}
            role="alert"
          >
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* OAuth Buttons */}
        <div className={styles.socialSection}>
          <OAuthButtons
            isLoading={isLoading}
            buttonClassName={styles.googleBtn}
          />
        </div>

        {/* Hairline Divider */}
        <div className={styles.credentialsDivider}>
          <div className={styles.dividerLine} />
          <span className={styles.dividerPill}>or continue with email</span>
        </div>

        {/* Credentials Form */}
        <form
          onSubmit={handleLogin}
          className={styles.formGroup}
          aria-busy={isLoading}
        >
          <div>
            <label className={styles.fieldLabel} htmlFor="identifier">
              Email or Username
            </label>
            <div className={styles.inputWrapper}>
              <Mail className={styles.inputIcon} />
              <input
                id="identifier"
                type="text"
                placeholder="Email or username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className={styles.inputField}
                disabled={isLoading}
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className={styles.fieldLabel} htmlFor="password">
              Password
            </label>
            <div className={styles.inputWrapper} data-private-field>
              <Lock className={styles.inputIcon} />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Your password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.inputField}
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={styles.passwordToggle}
                aria-pressed={showPassword}
                disabled={isLoading}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div
                  aria-hidden="true"
                  className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                />
                <span>Signing in…</span>
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <p className={styles.footerText}>
          Don&apos;t have an account?{" "}
          <Link href="/register?force=true" className={styles.footerLink}>
            Create an account
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.loadingPage} role="status">
          Opening your sanctuary…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
