"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import OAuthButtons from "../components/OAuthButtons";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import { AuthSplitLayout } from "../components/auth/AuthSplitLayout";
import styles from "../components/auth/AuthLayout.module.css";
import { motion } from "framer-motion";
import {
  Eye,
  EyeOff,
  User,
  AtSign,
  Mail,
  Lock,
} from "lucide-react";
import { SystemApertureIcon } from "@/app/components/icons";
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
  const { login } = useAuth();

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
          <span>THE SYSTEM • REGISTRATION</span>
        </div>

        {/* Editorial Heading */}
        <h1 className={styles.headline}>
          <span className={styles.headlinePrimary}>Create your account.</span>
          <span className={styles.headlineAccent}>Begin your next chapter.</span>
        </h1>
        <p className={styles.subheadline}>
          Start your journey to calmer, more focused study sessions.
        </p>

        {/* Error notification */}
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

        {/* Registration Form */}
        <form onSubmit={handleRegister} className={styles.formGroup}>
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
            <div className="flex items-center justify-between mb-1">
              <label className={styles.fieldLabel} htmlFor="username">
                Scholar Username
              </label>
              {username && (
                <span
                  className={`text-[10px] font-mono tracking-wider font-semibold ${
                    usernameStatus === "available"
                      ? "text-emerald-400"
                      : usernameStatus === "taken" || usernameStatus === "invalid"
                      ? "text-red-400"
                      : "text-slate-400"
                  }`}
                >
                  {usernameMsg}
                </span>
              )}
            </div>
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
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              3-20 characters: lowercase letters, numbers, and underscores only.
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
            <div className={styles.inputWrapper}>
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
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <PasswordStrengthMeter password={password} />
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>INITIALIZING SCHOLAR...</span>
              </>
            ) : (
              <>
                <SystemApertureIcon size={16} />
                <span>INITIALIZE SCHOLAR</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <p className={styles.footerText}>
          Already have an active link?{" "}
          <Link href="/login" className={styles.footerLink}>
            ACCESS SYSTEM
          </Link>
        </p>
      </motion.div>
    </AuthSplitLayout>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#070913]">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
