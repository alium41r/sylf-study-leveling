"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, email, password }),
      });

      if (response.ok) {
        router.push("/login");
      } else {
        const data = await response.json();
        setError(data.error || "Registration failed");
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

      <div className="system-card p-8 w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <p
            className="text-xs tracking-widest mb-2"
            style={{ color: "var(--accent-primary)", fontFamily: "'Rajdhani', sans-serif" }}
          >
            CREATE ACCOUNT
          </p>
          <h1
            className="text-3xl font-bold"
            style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--text-primary)" }}
          >
            Create Account
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Fill in your details to get started.
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

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <div>
            <label className="stat-label block mb-1">Full Name</label>
            <input
              type="text"
              placeholder="Your name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="stat-label block mb-1">Username</label>
            <input
              type="text"
              placeholder="unique_username"
              required
              minLength={3}
              maxLength={20}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="input-field"
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Letters, numbers, and underscores only</p>
          </div>

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
              placeholder="Minimum 6 characters"
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
            {isLoading ? "Creating..." : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Already have an account?{" "}
          <Link
            href="/login"
            className="transition-colors"
            style={{ color: "var(--accent-primary)" }}
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
