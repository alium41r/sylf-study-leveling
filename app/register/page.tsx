"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import OAuthButtons from "../components/OAuthButtons";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Sparkles,
  Eye,
  EyeOff,
  ShieldCheck,
  User,
  AtSign,
  Mail,
  Lock,
  Zap,
} from "lucide-react";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(1, "Display name is required.").max(30, "Name cannot exceed 30 characters."),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters.")
    .max(20, "Username must be at most 20 characters.")
    .regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores."),
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

  // Live Username Availability State
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [usernameMsg, setUsernameMsg] = useState("");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  // Clear previous session if forced
  useEffect(() => {
    const isForce = searchParams.get("force") === "true";
    if (isForce && typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user_data");
    }
  }, [searchParams]);

  // Debounced check username availability
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!username) {
      setUsernameStatus("idle");
      setUsernameMsg("");
      return;
    }

    if (username.length < 3) {
      setUsernameStatus("invalid");
      setUsernameMsg("Username must be at least 3 characters.");
      return;
    }

    if (!/^[a-z0-9_]+$/.test(username)) {
      setUsernameStatus("invalid");
      setUsernameMsg("Only lowercase letters, numbers, and underscores allowed.");
      return;
    }

    setUsernameStatus("checking");
    setUsernameMsg("Checking availability...");

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(username)}`);
        const data = await res.json();
        if (data.available) {
          setUsernameStatus("available");
          setUsernameMsg("✓ Username is available");
        } else {
          setUsernameStatus("taken");
          setUsernameMsg(data.error || "This username is already taken.");
        }
      } catch {
        setUsernameStatus("idle");
        setUsernameMsg("");
      }
    }, 350);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [username]);

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

    const validation = registerSchema.safeParse({ name, username, email, password });
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
        login(data.token, data.user);
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

  const isFormValid =
    name.trim().length > 0 &&
    username.length >= 3 &&
    usernameStatus === "available" &&
    email.includes("@") &&
    password.length >= 6;

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
        className="absolute bottom-10 left-10 w-[400px] h-[400px] pointer-events-none -z-10 opacity-20"
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
          <span>REGISTRATION: ACTIVE</span>
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
        <div className="text-center mb-6">
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
            <span>INITIALIZE PLAYER DATA</span>
          </div>

          <h1
            className="text-3xl sm:text-4xl font-extrabold uppercase tracking-wider text-text-primary mb-1"
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              letterSpacing: "0.08em",
            }}
          >
            Create Account
          </h1>
          <p className="text-xs mt-1.5 text-text-muted">
            Register qualifications to awaken as an E-Rank Scholar.
          </p>
        </div>

        {/* Error notification */}
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

        {/* Registration Form */}
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs uppercase font-bold text-text-muted tracking-wider font-['Rajdhani'] mb-1.5">
              Display Name
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-text-muted pointer-events-none">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Your full name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-sm py-3 pl-10 pr-4 rounded-xl border border-border-subtle bg-bg-void/90 text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 focus:outline-none transition-all"
                disabled={isLoading}
                maxLength={30}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase font-bold text-text-muted tracking-wider font-['Rajdhani'] mb-1.5">
              Scholar Username
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-text-muted pointer-events-none">
                <AtSign className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="your_username"
                required
                minLength={3}
                maxLength={20}
                value={username}
                onChange={handleUsernameChange}
                className={`w-full font-mono text-sm py-3 pl-10 pr-10 rounded-xl border bg-bg-void/90 text-text-primary placeholder:text-text-muted focus:outline-none transition-all ${
                  usernameStatus === "taken" || usernameStatus === "invalid"
                    ? "border-red-500/70 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                    : usernameStatus === "available"
                    ? "border-emerald-500/70 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    : "border-border-subtle focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20"
                }`}
                disabled={isLoading}
              />
              {usernameStatus === "checking" && (
                <div className="absolute right-3.5 w-4 h-4 border-2 border-white/20 border-t-accent-primary rounded-full animate-spin" />
              )}
            </div>

            {/* Real-time username feedback */}
            {usernameMsg && (
              <p
                className={`text-xs mt-1.5 font-['Rajdhani'] font-semibold ${
                  usernameStatus === "taken" || usernameStatus === "invalid"
                    ? "text-red-400"
                    : usernameStatus === "available"
                    ? "text-emerald-400"
                    : "text-text-muted"
                }`}
              >
                {usernameMsg}
              </p>
            )}

            {!usernameMsg && (
              <p className="text-[11px] mt-1.5 text-text-muted font-['Rajdhani']">
                3-20 characters: lowercase letters, numbers, and underscores only.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase font-bold text-text-muted tracking-wider font-['Rajdhani'] mb-1.5">
              Email Address
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-text-muted pointer-events-none">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
                className="w-full text-sm py-3 pl-10 pr-4 rounded-xl border border-border-subtle bg-bg-void/90 text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 focus:outline-none transition-all"
                disabled={isLoading}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase font-bold text-text-muted tracking-wider font-['Rajdhani'] mb-1.5">
              Password
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-text-muted pointer-events-none">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="At least 6 characters"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-sm py-3 pl-10 pr-11 rounded-xl border border-border-subtle bg-bg-void/90 text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 focus:outline-none transition-all"
                disabled={isLoading}
                autoComplete="new-password"
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
            <PasswordStrengthMeter password={password} />
          </div>

          <button
            type="submit"
            className="btn-primary mt-3 w-full py-3.5 rounded-xl text-sm sm:text-base font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:shadow-[0_0_20px_var(--accent-primary-mid)] active:scale-[0.99] transition-all"
            disabled={isLoading || !isFormValid}
            style={{
              opacity: isLoading || !isFormValid ? 0.6 : 1,
              cursor: isFormValid ? "pointer" : "not-allowed",
            }}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>INITIALIZING SCHOLAR...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>INITIALIZE SCHOLAR</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <div className="text-center mt-7">
          <p className="text-xs text-text-muted font-medium">
            Already have an active link?{" "}
            <Link
              href="/login?force=true"
              className="font-bold hover:underline text-accent-text-light font-['Rajdhani'] ml-1 transition-colors"
            >
              Access System
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: "var(--bg-void)", color: "var(--text-muted)" }}
        >
          Loading System Registration...
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
