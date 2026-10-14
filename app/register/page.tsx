"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import OAuthButtons from "../components/OAuthButtons";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import { AuthSplitLayout } from "../components/auth/AuthSplitLayout";
import styles from "../components/auth/AuthLayout.module.css";
import {
  ArrowRight,
  Eye,
  EyeOff,
  User,
  AtSign,
  Mail,
  Lock,
} from "lucide-react";
import { z } from "zod";

const registerSchema = z.object({
  name: z
    .string()
    .min(1, "Display name is required.")
    .max(30, "Name cannot exceed 30 characters."),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters.")
    .max(20, "Username must be at most 20 characters.")
    .regex(
      /^[a-z0-9_]+$/,
      "Username can only contain lowercase letters, numbers, and underscores."
    ),
  email: z.string().email("Please provide a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

function RegisterForm() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [usernameCheck, setUsernameCheck] = useState<{
    value: string;
    status: "idle" | "available" | "taken";
    message: string;
  } | null>(null);
  const usernameInvalid =
    username.length > 0 &&
    (username.length < 3 || !/^[a-z0-9_]+$/.test(username));
  const usernameStatus = !username
    ? "idle"
    : usernameInvalid
      ? "invalid"
      : usernameCheck?.value === username
        ? usernameCheck.status
        : "checking";
  const usernameMsg = !username
    ? ""
    : usernameInvalid
      ? "Use at least 3 lowercase letters, numbers, or underscores."
      : usernameCheck?.value === username
        ? usernameCheck.message
        : "Checking availability…";

  const router = useRouter();
  const { login } = useAuth();

  // Cancel stale lookups so a previous username can never update the current field.
  useEffect(() => {
    if (!username || usernameInvalid) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auth/check-username?username=${encodeURIComponent(username)}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        if (controller.signal.aborted) return;
        setUsernameCheck({
          value: username,
          status: data.available ? "available" : "taken",
          message: data.available
            ? "✓ Username is available"
            : data.error || "This username is already taken.",
        });
      } catch {
        if (!controller.signal.aborted)
          setUsernameCheck({ value: username, status: "idle", message: "" });
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [username, usernameInvalid]);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleanVal = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(cleanVal);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (usernameStatus === "taken" || usernameStatus === "invalid") {
      setError(usernameMsg || "Please choose a valid available username.");
      return;
    }

    setIsLoading(true);

    const validation = registerSchema.safeParse({
      name,
      username,
      email,
      password,
    });
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        login(data.user);
        router.push("/onboarding");
      } else {
        setError(data.error || "Registration failed. Please try again.");
      }
    } catch {
      setError("Network error. Could not reach authentication servers.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthSplitLayout greeting="A little curiosity goes a long way.">
      <div className={styles.formContent}>
        <h1 className={styles.headline}>
          <span className={styles.headlinePrimary}>A new chapter.</span>
        </h1>

        {/* Error notification */}
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

        {/* Registration Form */}
        <form
          onSubmit={handleRegister}
          className={styles.formGroup}
          aria-busy={isLoading}
        >
          <div>
            <label className={styles.fieldLabel} htmlFor="displayName">
              Display Name
            </label>
            <div className={styles.inputWrapper}>
              <User className={styles.inputIcon} />
              <input
                id="displayName"
                type="text"
                placeholder="Your full name"
                required
                maxLength={30}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={styles.inputField}
                disabled={isLoading}
                autoComplete="name"
              />
            </div>
          </div>

          <div>
            <label className={styles.fieldLabel} htmlFor="username">
              Username
            </label>
            <div className={styles.inputWrapper}>
              <AtSign className={styles.inputIcon} />
              <input
                id="username"
                type="text"
                placeholder="your_username"
                required
                minLength={3}
                maxLength={20}
                value={username}
                onChange={handleUsernameChange}
                className={styles.inputField}
                disabled={isLoading}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="username-hint username-status"
                aria-invalid={
                  usernameStatus === "taken" || usernameStatus === "invalid"
                }
              />
            </div>
            <p
              id="username-status"
              className={styles.usernameStatus}
              data-status={usernameStatus}
              role="status"
            >
              {usernameMsg}
            </p>
            <p id="username-hint" className={styles.fieldHint}>
              3–20 characters. Letters, numbers, and underscores.
            </p>
          </div>

          <div>
            <label className={styles.fieldLabel} htmlFor="email">
              Email Address
            </label>
            <div className={styles.inputWrapper}>
              <Mail className={styles.inputIcon} />
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.inputField}
                disabled={isLoading}
                autoComplete="email"
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
                placeholder="At least 6 characters"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.inputField}
                disabled={isLoading}
                autoComplete="new-password"
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
            <div className={styles.strengthMeter}>
              <PasswordStrengthMeter password={password} />
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
                <span>Creating your account…</span>
              </>
            ) : (
              <>
                <span>Create account</span>
                <ArrowRight aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <p className={styles.footerText}>
          Already have an account?{" "}
          <Link href="/login" className={styles.footerLink}>
            Sign in
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.loadingPage} role="status">
          Opening your sanctuary…
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
