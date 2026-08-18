"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { TimezoneService } from "@/lib/timezone-service";

export default function AccountInformation() {
  const { user, token, isLoading, mutateUser, refreshStats, login } = useAuth();

  const [formData, setFormData] = useState({
    username: "",
    name: "",
    email: "",
    timezone: "UTC",
  });

  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error" | null;
    message: string | null;
  }>({ type: null, message: null });

  // Live local time clock for the selected timezone
  const [liveTime, setLiveTime] = useState("");
  const timezoneOptions = TimezoneService.getTimezoneList();

  // Email verification state
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [verificationCooldown, setVerificationCooldown] = useState(0);
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);

  // Initialize form data when user loads
  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || "",
        name: user.name || "",
        email: user.email || "",
        timezone: user.timezone || "UTC",
      });
    }
  }, [user]);

  // Live clock tick
  useEffect(() => {
    const updateClock = () => {
      try {
        const safeTz = TimezoneService.validateTimezone(formData.timezone) ? formData.timezone : "UTC";
        const formatted = new Intl.DateTimeFormat("en-US", {
          timeZone: safeTz,
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }).format(new Date());
        setLiveTime(formatted);
      } catch {
        setLiveTime("");
      }
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [formData.timezone]);

  // Handle verification cooldown timer
  useEffect(() => {
    if (verificationCooldown <= 0) return;
    const timer = setInterval(() => {
      setVerificationCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [verificationCooldown]);

  // Check if form data has unsaved modifications
  const isDirty = user
    ? formData.username !== (user.username || "") ||
      formData.name !== (user.name || "") ||
      formData.email !== (user.email || "") ||
      formData.timezone !== (user.timezone || "UTC")
    : false;

  const handleCopyId = () => {
    if (!user) return;
    const scholarId = user.scholarId || `#${user.id.toString().padStart(6, "0")}`;
    navigator.clipboard.writeText(scholarId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let sanitized = value;
    if (name === "username") {
      sanitized = value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    }
    setFormData((prev) => ({
      ...prev,
      [name]: sanitized,
    }));
    if (status.type) {
      setStatus({ type: null, message: null });
    }
  };

  const handleAutoDetectTimezone = () => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && TimezoneService.validateTimezone(detected)) {
        setFormData((prev) => ({
          ...prev,
          timezone: detected,
        }));
        if (status.type) {
          setStatus({ type: null, message: null });
        }
      }
    } catch {
      // Fallback silently if browser blocks timezone detection
    }
  };

  const handleSendVerification = async () => {
    if (!token && !user) return;
    if (verificationCooldown > 0) return;

    setIsSendingVerification(true);
    setVerificationFeedback(null);
    

    try {
      const res = await fetch("/api/auth/verify-email/send", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await res.json();
      if (res.ok) {
        setVerificationFeedback(data.message || "Verification link sent to your email.");
        
        setVerificationCooldown(30); // 60 seconds cooldown
      } else {
        setVerificationFeedback(data.error || "Failed to send verification link.");
      }
    } catch {
      setVerificationFeedback("Network error. Could not send verification link.");
    } finally {
      setIsSendingVerification(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDirty || !user) return;

    // Client-side validation
    if (formData.username.length < 3 || formData.username.length > 20) {
      setStatus({
        type: "error",
        message: "Username must be between 3 and 20 characters.",
      });
      return;
    }

    if (!/^[a-z0-9_]+$/.test(formData.username)) {
      setStatus({
        type: "error",
        message: "Username can only contain lowercase letters, numbers, and underscores.",
      });
      return;
    }

    if (!formData.name.trim() || formData.name.length > 30) {
      setStatus({
        type: "error",
        message: "Display name must be between 1 and 30 characters.",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email || !emailRegex.test(formData.email)) {
      setStatus({
        type: "error",
        message: "Please enter a valid email address.",
      });
      return;
    }

    if (!TimezoneService.validateTimezone(formData.timezone)) {
      setStatus({
        type: "error",
        message: "Please select a valid IANA timezone.",
      });
      return;
    }

    setIsSaving(true);
    setStatus({ type: null, message: null });

    // Optimistic Update
    mutateUser({
      ...user,
      username: formData.username,
      name: formData.name,
      email: formData.email,
      timezone: formData.timezone,
    });

    try {
      const res = await fetch("/api/user/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          username: formData.username,
          name: formData.name,
          email: formData.email,
          timezone: formData.timezone,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        if (data.token && data.user) {
          login(data.token, data.user);
        }
        setStatus({
          type: "success",
          message: data.message || "Account preferences updated successfully.",
        });
        await refreshStats();
      } else {
        // Rollback optimistic update
        mutateUser(user);
        setStatus({
          type: "error",
          message: data.error || "Failed to update account information.",
        });
      }
    } catch (err) {
      console.error(err);
      mutateUser(user);
      setStatus({
        type: "error",
        message: "Network error. Failed to connect to server.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="animate-pulse space-y-6 pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-14 rounded" style={{ background: "var(--bg-shadow)" }}></div>
          <div className="h-14 rounded" style={{ background: "var(--bg-shadow)" }}></div>
          <div className="h-14 rounded" style={{ background: "var(--bg-shadow)" }}></div>
        </div>
        <div className="border-t pt-6 grid grid-cols-1 md:grid-cols-2 gap-6" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="h-14 rounded" style={{ background: "var(--bg-shadow)" }}></div>
          <div className="h-14 rounded" style={{ background: "var(--bg-shadow)" }}></div>
        </div>
      </div>
    );
  }

  const scholarId = user.scholarId || `#${user.id.toString().padStart(6, "0")}`;
  const joinDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown Date";

  const isVerified = user.verificationStatus === "VERIFIED";

  return (
    <form onSubmit={handleSave} className="space-y-8 pt-2">
      {status.message && (
        <div
          className={`p-4 rounded border text-xs flex items-center gap-2 font-['Rajdhani'] ${
            status.type === "success"
              ? "bg-green-950/20 border-green-800/40 text-accent-green"
              : "bg-red-950/20 border-red-900/50 text-accent-red"
          }`}
          style={{
            color: status.type === "success" ? "var(--accent-green)" : "var(--accent-red)",
            borderColor: status.type === "success" ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)",
          }}
        >
          {status.type === "success" ? (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
          <span>{status.message}</span>
        </div>
      )}

      {/* Editable Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
        <div>
          <label className="block text-[0.7rem] font-['Rajdhani'] uppercase tracking-widest text-muted mb-2">
            Scholar Username
          </label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            className="input-field"
            placeholder="unique_username"
            disabled={isSaving}
            maxLength={20}
          />
          <p className="text-[0.65rem] mt-1" style={{ color: "var(--text-muted)" }}>
            3-20 characters: lowercase letters, numbers, and underscores only.
          </p>
        </div>

        <div>
          <label className="block text-[0.7rem] font-['Rajdhani'] uppercase tracking-widest text-muted mb-2">
            Display Name
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="input-field"
            placeholder="Enter display name"
            disabled={isSaving}
            maxLength={30}
          />
          <p className="text-[0.65rem] mt-1" style={{ color: "var(--text-muted)" }}>
            Appears on your hunter badge and ranking leaderboards.
          </p>
        </div>

        <div className="md:col-span-2">
          <label className="block text-[0.7rem] font-['Rajdhani'] uppercase tracking-widest text-muted mb-2">
            Email Address
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className="input-field"
            placeholder="scholar@example.com"
            disabled={isSaving}
          />
          <p className="text-[0.65rem] mt-1" style={{ color: "var(--text-muted)" }}>
            Changing your email address will reset your status to Unverified and require re-verification.
          </p>
        </div>
      </div>

      {/* Timezone & Regional Schedule Settings */}
      <div className="border-t pt-6" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3
              className="text-sm font-['Rajdhani'] uppercase tracking-widest font-bold"
              style={{ color: "var(--accent-primary-light)" }}
            >
              Timezone & Schedule Alignment
            </h3>
            <p className="text-[0.7rem] text-muted mt-0.5">
              Controls daily AI quota resets, weekly quest deadlines (Sunday midnight), and calendar timestamps.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAutoDetectTimezone}
            disabled={isSaving}
            className="text-[0.65rem] font-['Rajdhani'] uppercase tracking-widest px-3 py-1.5 rounded border transition-all flex items-center gap-1.5 hover:border-accent-primary"
            style={{
              background: "var(--bg-abyss)",
              borderColor: "var(--border-active)",
              color: "var(--accent-primary-light)",
            }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Auto-Detect
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-start">
          <div>
            <label className="block text-[0.7rem] font-['Rajdhani'] uppercase tracking-widest text-muted mb-2">
              Configured Timezone
            </label>
            <select
              name="timezone"
              value={formData.timezone}
              onChange={handleChange}
              disabled={isSaving}
              className="input-field w-full cursor-pointer"
              style={{
                background: "var(--bg-abyss)",
                color: "var(--text-primary)",
              }}
            >
              {Array.from(new Set(timezoneOptions.map((t) => t.region))).map((region) => (
                <optgroup key={region} label={region} style={{ background: "#0a0d14", color: "#60a5fa" }}>
                  {timezoneOptions
                    .filter((t) => t.region === region)
                    .map((tz) => (
                      <option key={tz.value} value={tz.value} style={{ background: "#06090e", color: "#e2e8f0" }}>
                        {tz.label} ({tz.offset})
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div
            className="p-3.5 rounded border flex flex-col justify-center"
            style={{
              background: "rgba(255, 255, 255, 0.02)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[0.65rem] font-['Rajdhani'] uppercase tracking-widest text-muted">
                Current Local Time
              </span>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: "var(--accent-primary)" }}
              />
            </div>
            <div
              className="font-mono text-base font-bold mt-1"
              style={{ color: "var(--accent-primary-light)" }}
            >
              {liveTime || "Calculating..."}
            </div>
            <span className="text-[0.6rem] text-muted mt-0.5">
              Active: {formData.timezone}
            </span>
          </div>
        </div>
      </div>

      {/* Read-Only System Identity Info */}
      <div className="border-t pt-6" style={{ borderColor: "var(--border-subtle)" }}>
        <h3
          className="text-sm font-['Rajdhani'] uppercase tracking-widest mb-6 font-bold"
          style={{ color: "var(--accent-primary-light)" }}
        >
          System Identity
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
          <div>
            <label className="block text-[0.7rem] font-['Rajdhani'] uppercase tracking-widest text-muted mb-1">
              Scholar ID
            </label>
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                {scholarId}
              </span>
              <button
                type="button"
                onClick={handleCopyId}
                className="text-[0.65rem] font-['Rajdhani'] uppercase tracking-widest px-3 py-1 rounded border transition-colors flex items-center gap-1 min-w-[70px] justify-center"
                style={{
                  background: "var(--bg-abyss)",
                  borderColor: "var(--border-subtle)",
                  color: copied ? "var(--accent-green)" : "var(--text-muted)",
                }}
              >
                {copied ? (
                  <span className="flex items-center gap-1" style={{ color: "var(--accent-green)" }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied
                  </span>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[0.7rem] font-['Rajdhani'] uppercase tracking-widest text-muted mb-1">
              Joined System
            </label>
            <span
              className="font-['Rajdhani'] font-semibold text-lg"
              style={{ color: "var(--text-primary)" }}
            >
              {joinDate}
            </span>
          </div>

          <div>
            <label className="block text-[0.7rem] font-['Rajdhani'] uppercase tracking-widest text-muted mb-1">
              Account Status
            </label>
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: "var(--accent-green)",
                  boxShadow: "0 0 10px rgba(34, 197, 94, 0.5)",
                }}
              />
              <span
                className="font-['Rajdhani'] font-semibold text-lg"
                style={{ color: "var(--text-primary)" }}
              >
                Active
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[0.7rem] font-['Rajdhani'] uppercase tracking-widest text-muted mb-1">
              Verification Status
            </label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                {isVerified ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: "var(--accent-green)",
                        boxShadow: "0 0 10px rgba(34, 197, 94, 0.5)",
                      }}
                    />
                    <span
                      className="font-['Rajdhani'] font-semibold text-lg"
                      style={{ color: "var(--accent-green)" }}
                    >
                      Verified
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          background: "var(--accent-red)",
                          boxShadow: "0 0 8px rgba(239, 68, 68, 0.5)",
                        }}
                      />
                      <span
                        className="font-['Rajdhani'] font-semibold text-lg"
                        style={{ color: "var(--accent-red)" }}
                      >
                        Unverified
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSendVerification}
                      disabled={isSendingVerification || verificationCooldown > 0}
                      className="text-[0.65rem] font-['Rajdhani'] uppercase tracking-widest px-3 py-1 rounded border transition-all flex items-center gap-1.5"
                      style={{
                        background: verificationCooldown > 0 ? "rgba(255,255,255,0.03)" : "var(--accent-primary-dim)",
                        borderColor: "var(--border-active)",
                        color: "var(--accent-primary-light)",
                        opacity: isSendingVerification || verificationCooldown > 0 ? 0.6 : 1,
                        cursor: isSendingVerification || verificationCooldown > 0 ? "not-allowed" : "pointer",
                      }}
                    >
                      {isSendingVerification ? (
                        <>
                          <div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent-primary-light)", borderTopColor: "transparent" }} />
                          <span>Sending...</span>
                        </>
                      ) : verificationCooldown > 0 ? (
                        <span>Resend in {verificationCooldown}s</span>
                      ) : (
                        <span>Send Link</span>
                      )}
                    </button>
                  </>
                )}
              </div>

              {verificationFeedback && (
                <div className="space-y-1 mt-1">
                  <p
                    className="text-[0.7rem] font-['Rajdhani']"
                    style={{
                      color: verificationFeedback.includes("sent") ? "var(--accent-green)" : "var(--accent-red)",
                    }}
                  >
                    {verificationFeedback}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t pt-6 flex justify-end" style={{ borderColor: "var(--border-subtle)" }}>
        <button
          type="submit"
          className="btn-primary flex items-center gap-2"
          disabled={!isDirty || isSaving}
          style={{ opacity: !isDirty || isSaving ? 0.5 : 1, cursor: !isDirty || isSaving ? "not-allowed" : "pointer" }}
        >
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>SAVING CHANGES...</span>
            </>
          ) : (
            <span>SAVE CHANGES</span>
          )}
        </button>
      </div>
    </form>
  );
}
