"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import OAuthButtons from "../components/OAuthButtons";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Sparkles,
  Eye,
  EyeOff,
  ShieldCheck,
  Mail,
  Lock,
  Zap,
  Terminal,
  Shield,
} from "lucide-react";
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
      className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden"
      style={{ backgroundColor: "var(--bg-void)", color: "var(--text-primary)" }}
    >
      {/* ─── Layered Ambient Atmosphere ──────────────────────── */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] sm:w-[900px] h-[500px] pointer-events-none -z-10 opacity-30 dark:opacity-50"
        style={{
          background: "radial-gradient(ellipse at center, var(--accent-primary) 0%, rgba(0,0,0,0) 70%)",
          filter: "blur(100px)",
        }}
      />
      <div
        className="absolute bottom-10 right-10 w-[400px] h-[400px] pointer-events-none -z-10 opacity-20"
        style={{
          background: "radial-gradient(circle, var(--accent-primary-light) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      {/* Cyber Grid Texture */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.07] pointer-events-none -z-20"
        style={{
          backgroundImage:
            "linear-gradient(var(--accent-primary) 1px, transparent 1px), linear-gradient(90deg, var(--accent-primary) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* ─── Top Floating Navigation Bar ──────────────────────── */}
      <div className="w-full max-w-lg mb-6 flex items-center justify-between z-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-secondary hover:text-text-primary px-4 py-2 rounded-xl border border-border-subtle bg-bg-abyss/80 hover:border-accent-primary transition-all group backdrop-blur-md cursor-pointer shadow-sm hover:shadow-[0_0_15px_var(--accent-primary-dim)]"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform text-accent-primary-light" />
          <span>Back to Sylf</span>
        </Link>

        {/* Telemetry Status Chip */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border-subtle bg-bg-abyss/60 text-[10px] font-mono text-text-muted backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>PORTAL: SECURE</span>
        </div>
      </div>

      {/* ─── Main HUD System Terminal Card ────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-lg relative z-10 p-7 sm:p-10 rounded-2xl sm:rounded-3xl border border-border-active bg-bg-abyss/90 backdrop-blur-2xl shadow-2xl overflow-hidden"
        style={{
          boxShadow: "0 20px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px -10px var(--accent-primary-dim)",
        }}
      >
        {/* Glowing Top Neon Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-accent-primary to-transparent opacity-90 shadow-[0_0_12px_var(--accent-primary)]" />

        {/* Corner HUD Accents */}
        <div className="absolute top-3 left-3 w-2 h-2 border-t-2 border-l-2 border-accent-primary/60" />
        <div className="absolute top-3 right-3 w-2 h-2 border-t-2 border-r-2 border-accent-primary/60" />
        <div className="absolute bottom-3 left-3 w-2 h-2 border-b-2 border-l-2 border-accent-primary/60" />
        <div className="absolute bottom-3 right-3 w-2 h-2 border-b-2 border-r-2 border-accent-primary/60" />

        {/* Card Header */}
        <div className="text-center mb-7">
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] tracking-[0.25em] uppercase font-bold border mb-3.5 shadow-sm"
            style={{
              background: "var(--accent-primary-dim)",
              borderColor: "var(--accent-primary-mid)",
              color: "var(--accent-text-light)",
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            <Sparkles className="w-3.5 h-3.5 text-accent-primary-light animate-pulse" />
            <span>THE SYSTEM • AUTHENTICATION</span>
          </div>

          <h1
            className="text-3xl sm:text-4xl font-extrabold uppercase tracking-wider text-text-primary mb-1"
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              letterSpacing: "0.08em",
            }}
          >
            System Login
          </h1>
        </div>

        {/* Info Notification */}
        {infoMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="p-3.5 mb-5 rounded-xl border text-xs flex items-center gap-2.5 bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-['Rajdhani'] font-semibold"
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{infoMessage}</span>
          </motion.div>
        )}

        {/* Error Notification */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="p-3.5 mb-5 rounded-xl border text-xs flex items-center gap-2.5 bg-red-500/10 border-red-500/30 text-red-400 font-['Rajdhani'] font-semibold"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </motion.div>
        )}

        {/* OAuth Buttons */}
        <div className="mb-6">
          <OAuthButtons isLoading={isLoading} />
        </div>

        {/* Hairline Divider */}
        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border-subtle" />
          </div>
          <span
            className="relative px-3 py-0.5 text-[10px] tracking-[0.25em] uppercase font-bold font-['Rajdhani'] bg-bg-abyss text-text-muted border border-border-subtle/50 rounded-md"
          >
            OR CREDENTIALS
          </span>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs uppercase font-bold text-text-muted tracking-wider font-['Rajdhani'] mb-1.5">
              Email or Username
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-text-muted pointer-events-none">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Email or username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full text-sm py-3 pl-10 pr-4 rounded-xl border border-border-subtle bg-bg-void/90 text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 focus:outline-none transition-all"
                disabled={isLoading}
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs uppercase font-bold text-text-muted tracking-wider font-['Rajdhani']">
                Password
              </label>
            </div>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-text-muted pointer-events-none">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Your password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-sm py-3 pl-10 pr-11 rounded-xl border border-border-subtle bg-bg-void/90 text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 focus:outline-none transition-all"
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-text-muted hover:text-text-primary transition-colors cursor-pointer p-1 rounded"
                tabIndex={-1}
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
            className="btn-primary mt-3 w-full py-3.5 rounded-xl text-sm sm:text-base font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:shadow-[0_0_20px_var(--accent-primary-mid)] active:scale-[0.99] transition-all"
            disabled={isLoading}
            style={{ opacity: isLoading ? 0.7 : 1 }}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>AUTHENTICATING...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>ACCESS SYSTEM</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <p className="mt-7 text-center text-xs text-text-muted font-medium">
          Don&apos;t have an account?{" "}
          <Link
            href="/register?force=true"
            className="font-bold uppercase tracking-wider hover:underline text-accent-text-light font-['Rajdhani'] ml-1 transition-colors"
          >
            SIGN UP
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
