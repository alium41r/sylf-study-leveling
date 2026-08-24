"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import OAuthButtons from "../components/OAuthButtons";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import { motion } from "framer-motion";
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
    // Live sanitize to lowercase alphanumeric and underscores
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(raw.slice(0, 20));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (usernameStatus === "taken") {
      setError("This username is already taken. Please choose another.");
      return;
    }

    if (usernameStatus === "checking") {
      return;
    }

    setIsLoading(true);

    const validation = registerSchema.safeParse({ name, username, email, password });
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      setIsLoading(false);
      return;
    }

    let detectedTimezone = "UTC";
    try {
      detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      detectedTimezone = "UTC";
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, email, password, timezone: detectedTimezone }),
      });

      const data = await response.json();

      if (response.ok) {
        // Automatically log in and begin onboarding
        login(data.token, data.user);
        window.location.href = "/onboarding";
      } else {
        setError(data.error || "Registration failed. Please try again.");
      }
    } catch {
      setError("Network error. Unable to contact authentication server.");
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
      className="min-h-screen flex items-center justify-center px-4 py-12 relative"
      style={{ background: "var(--bg-void)" }}
    >
      {/* Background ambient effect */}
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
            INITIALIZE PLAYER DATA
          </p>
          <h1
            className="text-3xl font-bold uppercase tracking-wide"
            style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--text-primary)" }}
          >
            Create Account
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Register qualifications to awaken as an E-Rank Scholar.
          </p>
        </div>

        {/* Error notification */}
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
            <div className="w-full border-t border-border-subtle" />
          </div>
          <span
            className="relative px-4 text-xs uppercase tracking-widest font-bold"
            style={{ background: "var(--bg-abyss)", color: "var(--text-muted)" }}
          >
            OR CREDENTIALS
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="stat-label block mb-1">Display Name</label>
            <input
              type="text"
              placeholder="Your full name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              disabled={isLoading}
              maxLength={30}
            />
          </div>

          <div>
            <label className="stat-label block mb-1">Scholar Username</label>
            <div className="relative">
              <input
                type="text"
                placeholder="your_username"
                required
                minLength={3}
                maxLength={20}
                value={username}
                onChange={handleUsernameChange}
                className={`input-field font-mono text-sm pr-8 ${
                  usernameStatus === "taken" || usernameStatus === "invalid"
                    ? "border-red-500/70 focus:border-red-500"
                    : usernameStatus === "available"
                    ? "border-green-500/70 focus:border-green-500"
                    : ""
                }`}
                disabled={isLoading}
              />
              {usernameStatus === "checking" && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-white/20 border-t-accent-primary rounded-full animate-spin" />
              )}
            </div>

            {/* Real-time username feedback */}
            {usernameMsg && (
              <p
                className={`text-xs mt-1 font-['Rajdhani'] font-semibold ${
                  usernameStatus === "taken" || usernameStatus === "invalid"
                    ? "text-red-400"
                    : usernameStatus === "available"
                    ? "text-green-400"
                    : "text-text-muted"
                }`}
              >
                {usernameMsg}
              </p>
            )}

            {!usernameMsg && (
              <p className="text-[0.65rem] mt-1" style={{ color: "var(--text-muted)" }}>
                3-20 characters: lowercase letters, numbers, and underscores only.
              </p>
            )}
          </div>

          <div>
            <label className="stat-label block mb-1">Email Address</label>
            <input
              type="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
              className="input-field"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="stat-label block mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="At least 6 characters"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pr-10"
                disabled={isLoading}
                autoComplete="new-password"
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
            <PasswordStrengthMeter password={password} />
          </div>

          <button
            type="submit"
            className="btn-primary mt-2 w-full flex items-center justify-center gap-2"
            disabled={isLoading || !isFormValid}
            style={{ opacity: isLoading || !isFormValid ? 0.6 : 1, cursor: isFormValid ? "pointer" : "not-allowed" }}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>INITIALIZING SCHOLAR...</span>
              </>
            ) : (
              <span>INITIALIZE SCHOLAR</span>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <div className="text-center mt-6">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Already have an active link?{" "}
            <Link
              href="/login?force=true"
              className="font-bold hover:underline"
              style={{ color: "var(--accent-text-light)" }}
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
