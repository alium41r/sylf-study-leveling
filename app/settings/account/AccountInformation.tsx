"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { TimezoneService } from "@/lib/timezone-service";
import { getAccountCapability } from "./services/account-capability";
import styles from "@/app/settings/components/SystemHubPage.module.css";
import { Check, Copy, Clock, ShieldCheck, AlertCircle, RefreshCw, Send } from "lucide-react";

export default function AccountInformation() {
  const { user, isLoading, mutateUser, refreshStats, login } = useAuth();

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
    if (!user) return;
    if (verificationCooldown > 0) return;

    setIsSendingVerification(true);
    setVerificationFeedback(null);
    

    try {
      const result = await getAccountCapability().sendEmailVerification();
      if (result.ok) {
        setVerificationFeedback(result.message || "Verification link sent to your email.");
        setVerificationCooldown(30);
      } else {
        setVerificationFeedback(result.error || "Failed to send verification link.");
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
      const result = await getAccountCapability().updateAccount({
        username: formData.username,
        name: formData.name,
        email: formData.email,
        timezone: formData.timezone,
      });

      if (result.ok) {
        if (result.data?.user) {
          login(result.data.user);
        }
        setStatus({
          type: "success",
          message: result.message || "Account preferences updated successfully.",
        });
        await refreshStats();
      } else {
        // Rollback optimistic update
        mutateUser(user);
        setStatus({
          type: "error",
          message: result.error || "Failed to update account information.",
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
      <div className="animate-pulse space-y-6 pt-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="h-16 rounded-xl bg-[var(--sub-surface)]"></div>
          <div className="h-16 rounded-xl bg-[var(--sub-surface)]"></div>
          <div className="h-16 rounded-xl bg-[var(--sub-surface)] md:col-span-2"></div>
        </div>
        <div className="border-t border-[var(--subtle-line)] pt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="h-20 rounded-xl bg-[var(--sub-surface)]"></div>
          <div className="h-20 rounded-xl bg-[var(--sub-surface)]"></div>
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
    <form onSubmit={handleSave} className="space-y-7 pt-1">
      {status.message && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 font-['Rajdhani'] font-bold ${
            status.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
              : "bg-rose-500/10 border-rose-500/30 text-rose-500"
          }`}
        >
          {status.type === "success" ? (
            <Check className="w-4 h-4 shrink-0 text-emerald-500" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          )}
          <span>{status.message}</span>
        </div>
      )}

      {/* Editable Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
        <div>
          <label className={styles.configLabel}>
            Scholar Username
          </label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            className={styles.configInput}
            placeholder="unique_username"
            disabled={isSaving}
            maxLength={20}
          />
          <p className={styles.configHelper}>
            3-20 characters: lowercase letters, numbers, and underscores only.
          </p>
        </div>

        <div>
          <label className={styles.configLabel}>
            Display Name
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className={styles.configInput}
            placeholder="Enter display name"
            disabled={isSaving}
            maxLength={30}
          />
          <p className={styles.configHelper}>
            Appears on your hunter badge and ranking leaderboards.
          </p>
        </div>

        <div className="md:col-span-2">
          <label className={styles.configLabel}>
            Email Address
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className={styles.configInput}
            placeholder="scholar@example.com"
            disabled={isSaving}
          />
          <p className={styles.configHelper}>
            Changing your email address will reset your status to Unverified and require re-verification.
          </p>
        </div>
      </div>

      {/* Timezone & Regional Schedule Settings */}
      <div className="border-t border-[var(--subtle-line)] pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-['Rajdhani'] uppercase tracking-widest font-bold text-[var(--ink)]">
              Timezone & Schedule Alignment
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Controls daily AI quota resets, weekly quest deadlines (Sunday midnight), and calendar timestamps.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAutoDetectTimezone}
            disabled={isSaving}
            className={styles.btnSecondary}
            style={{ padding: "6px 14px", fontSize: "0.75rem" }}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Auto-Detect</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          <div>
            <label className={styles.configLabel}>
              Configured Timezone
            </label>
            <select
              name="timezone"
              value={formData.timezone}
              onChange={handleChange}
              disabled={isSaving}
              className={styles.configSelect}
            >
              {Array.from(new Set(timezoneOptions.map((t) => t.region))).map((region) => (
                <optgroup key={region} label={region}>
                  {timezoneOptions
                    .filter((t) => t.region === region)
                    .map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label} ({tz.offset})
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="p-4 rounded-xl border border-[var(--sub-border)] bg-[var(--sub-surface)] flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <span className={styles.configLabel} style={{ marginBottom: 0 }}>
                Current Local Time
              </span>
              <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
            </div>
            <div className="font-mono text-xl font-bold text-[var(--accent)] mt-1 tracking-wider">
              {liveTime || "Calculating..."}
            </div>
            <span className="text-[0.68rem] text-[var(--quiet)] mt-0.5">
              Active: {formData.timezone}
            </span>
          </div>
        </div>
      </div>

      {/* Read-Only System Identity Info */}
      <div className="border-t border-[var(--subtle-line)] pt-6">
        <h3 className="text-sm font-['Rajdhani'] uppercase tracking-widest mb-4 font-bold text-[var(--ink)]">
          System Identity Ledger
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl border border-[var(--sub-border)] bg-[var(--sub-surface)]">
            <span className={styles.configLabel}>Scholar ID</span>
            <div className="flex items-center justify-between mt-1 gap-2">
              <span className="font-mono text-base font-bold text-[var(--ink)] truncate">
                {scholarId}
              </span>
              <button
                type="button"
                onClick={handleCopyId}
                className={styles.btnSecondary}
                style={{ padding: "4px 10px", fontSize: "0.7rem", flexShrink: 0 }}
                title="Copy Scholar ID"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[var(--sub-border)] bg-[var(--sub-surface)]">
            <span className={styles.configLabel}>Joined System</span>
            <span className="font-['Rajdhani'] font-bold text-base text-[var(--ink)] block mt-1 truncate">
              {joinDate}
            </span>
          </div>

          <div className="p-4 rounded-xl border border-[var(--sub-border)] bg-[var(--sub-surface)]">
            <span className={styles.configLabel}>Account Standing</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="font-['Rajdhani'] font-bold text-base text-emerald-500">
                Active
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[var(--sub-border)] bg-[var(--sub-surface)]">
            <span className={styles.configLabel}>Verification</span>
            <div className="flex items-center justify-between mt-1 gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isVerified
                      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                      : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                  }`}
                />
                <span
                  className={`font-['Rajdhani'] font-bold text-base ${
                    isVerified ? "text-emerald-500" : "text-amber-500"
                  }`}
                >
                  {isVerified ? "Verified" : "Unverified"}
                </span>
              </div>
              {!isVerified && (
                <button
                  type="button"
                  onClick={handleSendVerification}
                  disabled={isSendingVerification || verificationCooldown > 0}
                  className={styles.btnSecondary}
                  style={{ padding: "4px 10px", fontSize: "0.7rem", flexShrink: 0 }}
                >
                  {isSendingVerification ? (
                    "Sending..."
                  ) : verificationCooldown > 0 ? (
                    `${verificationCooldown}s`
                  ) : (
                    "Verify"
                  )}
                </button>
              )}
            </div>
            {verificationFeedback && (
              <p
                className={`text-[0.7rem] font-['Rajdhani'] mt-1.5 ${
                  verificationFeedback.includes("sent")
                    ? "text-emerald-500"
                    : "text-rose-500"
                }`}
              >
                {verificationFeedback}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--subtle-line)] pt-5 flex justify-end">
        <button
          type="submit"
          className={`${styles.btnPrimary} w-full sm:w-auto`}
          disabled={!isDirty || isSaving}
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

