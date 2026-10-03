"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import OAuthButtons from "../components/OAuthButtons";
import { AuthSplitLayout } from "../components/auth/AuthSplitLayout";
import styles from "../components/auth/AuthLayout.module.css";
import { motion } from "framer-motion";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  Mail,
  Lock,
} from "lucide-react";
import { SystemApertureIcon } from "@/app/components/icons";
import { z } from "zod";

const loginSchema = z.object({
  identifier: z.string().min(1, "Please enter your email or username."),
  password: z.string().min(1, "Password is required."),
});

function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  // Extract query params for feedback
  useEffect(() => {
    const errorParam = searchParams.get("error");
    const registeredParam = searchParams.get("registered");
    const verifiedParam = searchParams.get("verified");

    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
    if (registeredParam) {
      setInfoMessage("Registration complete. Please authenticate to initialize your system.");
    }
    if (verifiedParam) {
      setInfoMessage("Your email has been verified. Welcome back, Scholar.");
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfoMessage("");
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
          redirectTarget && redirectTarget.startsWith("/") && !redirectTarget.startsWith("//")
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
    <AuthSplitLayout>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full flex flex-col"
      >
        {/* Subtle System Badge */}
        <div className={styles.systemBadge}>
          <SystemApertureIcon size={13} className="text-cyan-400" />
          <span>THE SYSTEM • AUTHENTICATION</span>
        </div>

        {/* Editorial Heading */}
        <h1 className={styles.headline}>
          <span className={styles.headlinePrimary}>Welcome back.</span>
          <span className={styles.headlineAccent}>Good to see you again.</span>
        </h1>
        <p className={styles.subheadline}>
          Log in to continue your journey, and pick up right where you left off.
        </p>

        {/* Info Notification */}
        {infoMessage && (
          <div className="p-3 mb-4 rounded-xl border text-xs flex items-center gap-2.5 bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="p-3 mb-4 rounded-xl border text-xs flex items-center gap-2.5 bg-red-500/10 border-red-500/30 text-red-400">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
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
          <span className={styles.dividerPill}>OR CREDENTIALS</span>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleLogin} className={styles.formGroup}>
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
            <div className={styles.inputWrapper}>
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
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>AUTHENTICATING...</span>
              </>
            ) : (
              <>
                <SystemApertureIcon size={16} />
                <span>ACCESS SYSTEM</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <p className={styles.footerText}>
          Don&apos;t have an account?{" "}
          <Link href="/register?force=true" className={styles.footerLink}>
            SIGN UP
          </Link>
        </p>
      </motion.div>
    </AuthSplitLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#070913]">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
