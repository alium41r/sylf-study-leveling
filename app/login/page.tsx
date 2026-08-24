"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import OAuthButtons from "../components/OAuthButtons";
import { motion } from "framer-motion";
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
    const isForce = searchParams.get("force") === "true";

    if (isForce && typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user_data");
    }

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
        login(data.token, data.user);
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
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 relative"
      style={{ background: "var(--bg-void)" }}
    >
      {/* Background ambient lighting */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, var(--accent-primary-dim) 0%, transparent 70%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="system-card p-8 w-full max-w-md relative z-10 border rounded-2xl shadow-card"
        style={{
          background: "var(--bg-abyss)",
          borderColor: "var(--border-subtle)",
        }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <p
            className="text-xs tracking-[0.2em] uppercase font-bold mb-2"
            style={{ color: "var(--accent-text-light)", fontFamily: "'Rajdhani', sans-serif" }}
          >
            THE SYSTEM • AUTHENTICATION
          </p>
          <h1
            className="text-3xl font-bold uppercase tracking-wide"
            style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--text-primary)" }}
          >
            System Login
          </h1>
        </div>

        {/* Info Notification */}
        {infoMessage && (
          <div
            className="p-3 mb-4 rounded border text-xs flex items-center gap-2"
            style={{
              background: "rgba(34, 197, 94, 0.1)",
              borderColor: "rgba(34, 197, 94, 0.3)",
              color: "var(--accent-green)",
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{infoMessage}</span>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div
            className="p-3 mb-4 rounded border text-xs flex items-center gap-2"
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              borderColor: "rgba(239, 68, 68, 0.3)",
              color: "var(--accent-red)",
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* OAuth Buttons */}
        <OAuthButtons isLoading={isLoading} />

        {/* Divider */}
        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" style={{ borderColor: "var(--border-subtle)" }} />
          </div>
          <span
            className="relative px-3 text-[0.65rem] tracking-widest uppercase font-bold font-['Rajdhani']"
            style={{ background: "var(--bg-abyss)", color: "var(--text-muted)" }}
          >
            OR CREDENTIALS
          </span>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="stat-label block mb-1">Email or Username</label>
            <input
              type="text"
              placeholder="Email or username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="input-field"
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="stat-label">Password</label>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Your password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pr-10"
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                style={{ color: "var(--text-muted)" }}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary mt-2 w-full flex items-center justify-center gap-2"
            disabled={isLoading}
            style={{ opacity: isLoading ? 0.7 : 1 }}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>AUTHENTICATING...</span>
              </>
            ) : (
              <span>ACCESS SYSTEM</span>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          Don&apos;t have an account?{" "}
          <Link
            href="/register?force=true"
            className="font-bold transition-colors uppercase tracking-wider hover:underline"
            style={{ color: "var(--accent-text-light)" }}
          >
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-void)" }}>
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent-primary)", borderTopColor: "transparent" }} />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
