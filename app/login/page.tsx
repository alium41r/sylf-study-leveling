"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import { motion } from "framer-motion";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        login(data.token, data.user);
        router.push("/dashboard");
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--bg-void)" }}
    >
      {/* Background effect */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, var(--accent-primary-dim) 0%, transparent 60%)",
        }}
      />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="system-card p-8 w-full max-w-md relative z-10"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <p
            className="text-xs tracking-widest mb-2"
            style={{ color: "var(--accent-primary)", fontFamily: "'Rajdhani', sans-serif" }}
          >
            SYSTEM LOGIN
          </p>
          <h1
            className="text-3xl font-bold"
            style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--text-primary)" }}
          >
            Login
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Enter your credentials to continue.
          </p>
        </div>

        {error && (
          <div
            className="system-message msg-warning mb-4 text-sm"
            style={{ color: "var(--accent-red)" }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="stat-label block mb-1">Email</label>
            <input
              type="email"
              placeholder="scholar@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="stat-label block mb-1">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
            />
          </div>

          <button
            type="submit"
            className="btn-primary mt-4 w-full"
            disabled={isLoading}
            style={{ opacity: isLoading ? 0.6 : 1 }}
          >
            {isLoading ? "Verifying..." : "Login"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="transition-colors"
            style={{ color: "var(--accent-primary)" }}
          >
            Create Account
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
