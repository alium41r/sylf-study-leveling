"use client";

import React, { useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import { SettingsRowGroup } from "../../components/SettingsRowGroup";
import { SettingsRow } from "../../components/SettingsRow";
import { useRouter } from "next/navigation";

interface DangerAction {
  id: "logout" | "logout_all" | "reset_progress" | "delete_account";
  label: string;
  description: string;
  actionText: string;
}

export default function DangerZone() {
  const { user, token, logout, refreshStats } = useAuth();
  const router = useRouter();

  const isVerified = user?.verificationStatus === "VERIFIED";

  const [activeModal, setActiveModal] = useState<"logout" | "logout_all" | "reset_progress" | "delete_account" | null>(null);

  // Modal Inputs & States
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const actions: DangerAction[] = [
    {
      id: "logout",
      label: "Log Out",
      description: "Sign out of your account on this device.",
      actionText: "Log Out",
    },
    {
      id: "logout_all",
      label: "Log Out All Devices",
      description: "Sign out from everywhere. Useful if you suspect your account has been compromised.",
      actionText: "Log Out Everywhere",
    },
    {
      id: "reset_progress",
      label: "Reset Progress",
      description: "Erase your hunter rank, level, and XP. This keeps your account active but starts you from Level 1.",
      actionText: "Reset Progress",
    },
    {
      id: "delete_account",
      label: "Delete Account",
      description: "Permanently erase your account, study data, quests, and all associations. This cannot be undone.",
      actionText: "Delete Account",
    },
  ];

  const handleOpenModal = (id: DangerAction["id"]) => {
    setActiveModal(id);
    setPassword("");
    setOtpCode("");
    setFeedback(null);
    setCooldown(0);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setActiveModal(null);
    setPassword("");
    setOtpCode("");
    setFeedback(null);
  };

  // 1. Log Out (This device)
  const handleLogout = async () => {
    setIsSubmitting(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Proceed with local logout regardless
    } finally {
      logout();
      router.push("/login");
    }
  };

  // 2. Log Out All Devices (Password Gated)
  const handleLogoutAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/auth/logout-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (res.ok) {
        logout();
        router.push("/login");
      } else {
        setFeedback({ type: "error", message: data.error || "Failed to revoke all sessions." });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error. Could not revoke sessions." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Send Security OTP (for Verified Accounts)
  const handleSendCode = async (action: "RESET_PROGRESS" | "DELETE_ACCOUNT") => {
    if (cooldown > 0 || isSendingCode) return;
    setIsSendingCode(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/user/security/send-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (res.ok) {
        setFeedback({ type: "success", message: data.message || "Verification code sent to your email." });
        setCooldown(30);
        const timer = setInterval(() => {
          setCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setFeedback({ type: "error", message: data.error || "Failed to send code." });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error. Failed to send verification code." });
    } finally {
      setIsSendingCode(false);
    }
  };

  // 3. Reset Progress (OTP for Verified, Password for Unverified)
  const handleResetProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerified && otpCode.length !== 6) return;
    if (!isVerified && !password) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const payload = isVerified ? { code: otpCode } : { password };
      const res = await fetch("/api/user/reset-progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        if (refreshStats) await refreshStats();
        setFeedback({ type: "success", message: "Progress reset successfully! Starting at Level 1." });
        setTimeout(() => {
          handleCloseModal();
          router.push("/dashboard");
        }, 1200);
      } else {
        setFeedback({ type: "error", message: data.error || "Failed to reset progression." });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error. Failed to reset progression." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Delete Account (OTP for Verified, Password for Unverified)
  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerified && otpCode.length !== 6) return;
    if (!isVerified && !password) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const payload = isVerified ? { code: otpCode } : { password };
      const res = await fetch("/api/user/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        logout();
        router.push("/register");
      } else {
        setFeedback({ type: "error", message: data.error || "Failed to delete account." });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error. Could not delete account." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pt-2">
      <SettingsRowGroup danger={true}>
        {actions.map((action) => (
          <SettingsRow
            key={action.id}
            label={action.label}
            description={action.description}
            danger={true}
          >
            <button 
              onClick={() => handleOpenModal(action.id)} 
              className="btn-danger shrink-0"
              style={{ padding: "6px 16px", fontSize: "0.75rem" }}
            >
              {action.actionText}
            </button>
          </SettingsRow>
        ))}
      </SettingsRowGroup>

      {/* ─── 1. Log Out Modal ─── */}
      {activeModal === "logout" && (
        <ModalWrapper title="Log Out" onClose={handleCloseModal}>
          <div className="space-y-4">
            <p className="text-gray-300 text-sm">
              Are you sure you want to sign out of your account on this device?
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t border-border-subtle">
              <button onClick={handleCloseModal} className="btn-secondary text-xs px-4 py-2">
                Cancel
              </button>
              <button onClick={handleLogout} disabled={isSubmitting} className="btn-danger text-xs px-4 py-2">
                {isSubmitting ? "Signing Out..." : "Log Out"}
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* ─── 2. Log Out All Devices Modal (Password Protected) ─── */}
      {activeModal === "logout_all" && (
        <ModalWrapper title="Log Out Everywhere" onClose={handleCloseModal}>
          <form onSubmit={handleLogoutAll} className="space-y-4">
            <p className="text-gray-300 text-sm">
              This will revoke all active authentication sessions across all browsers and devices. Enter your account password to confirm.
            </p>

            <div>
              <label className="stat-label block mb-1 text-xs">Account Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="input-field w-full text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPassword ? "👁" : "👁‍🗨"}
                </button>
              </div>
            </div>

            {feedback && (
              <p className={`text-xs font-[Rajdhani] ${feedback.type === "success" ? "text-accent-green" : "text-accent-red"}`}>
                {feedback.message}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-border-subtle">
              <button type="button" onClick={handleCloseModal} className="btn-secondary text-xs px-4 py-2">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting || !password} className="btn-danger text-xs px-4 py-2">
                {isSubmitting ? "Revoking..." : "Revoke All Sessions"}
              </button>
            </div>
          </form>
        </ModalWrapper>
      )}

      {/* ─── 3. Reset Progress Modal ─── */}
      {activeModal === "reset_progress" && (
        <ModalWrapper title="Reset Hunter Progress" onClose={handleCloseModal}>
          <form onSubmit={handleResetProgress} className="space-y-4">
            <p className="text-gray-300 text-sm">
              This action will reset your level back to <strong className="text-accent-primary-light">Level 1</strong>, XP to 0, and clear your active quest log. Your account identity and unlocked cosmetics will remain intact.
            </p>

            {isVerified ? (
              <>
                <div className="p-3 bg-black/40 border border-white/10 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-text-muted block">
                      Security Code Destination
                    </span>
                    <span className="text-sm text-text-primary font-mono">{user?.email || "Registered Email"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendCode("RESET_PROGRESS")}
                    disabled={isSendingCode || cooldown > 0}
                    className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded border border-accent-primary-mid bg-accent-primary-dim text-accent-primary-light hover:bg-accent-primary hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSendingCode ? "Sending..." : cooldown > 0 ? `Resend (${cooldown}s)` : "Send Code"}
                  </button>
                </div>

                <div>
                  <label className="stat-label block mb-1 text-xs">6-Digit Verification Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    required
                    className="input-field w-full text-center tracking-[0.4em] font-mono text-lg font-bold"
                  />
                </div>
              </>
            ) : (
              <div>
                <p className="text-xs text-amber-400/90 mb-2">
                  ℹ️ Your email is unverified. Enter your account password to confirm reset:
                </p>
                <label className="stat-label block mb-1 text-xs">Account Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="input-field w-full text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? "👁" : "👁‍🗨"}
                  </button>
                </div>
              </div>
            )}

            {feedback && (
              <p className={`text-xs font-[Rajdhani] ${feedback.type === "success" ? "text-accent-green" : "text-accent-red"}`}>
                {feedback.message}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-border-subtle">
              <button type="button" onClick={handleCloseModal} className="btn-secondary text-xs px-4 py-2">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (isVerified ? otpCode.length !== 6 : !password)}
                className="btn-danger text-xs px-4 py-2"
              >
                {isSubmitting ? "Resetting..." : "Confirm Reset"}
              </button>
            </div>
          </form>
        </ModalWrapper>
      )}

      {/* ─── 4. Delete Account Modal (High Danger) ─── */}
      {activeModal === "delete_account" && (
        <ModalWrapper title="PERMANENT ACCOUNT DELETION" onClose={handleCloseModal} danger={true}>
          <form onSubmit={handleDeleteAccount} className="space-y-4">
            <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-300 leading-relaxed">
              ⚠️ <strong>WARNING:</strong> This action permanently deletes your Scholar account, all study history, quests, level progression, and social records. <strong>This action CANNOT be undone.</strong>
            </div>

            {isVerified ? (
              <>
                <div className="p-3 bg-black/40 border border-white/10 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-text-muted block">
                      Confirmation Code Destination
                    </span>
                    <span className="text-sm text-text-primary font-mono">{user?.email || "Registered Email"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendCode("DELETE_ACCOUNT")}
                    disabled={isSendingCode || cooldown > 0}
                    className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSendingCode ? "Sending..." : cooldown > 0 ? `Resend (${cooldown}s)` : "Send Code"}
                  </button>
                </div>

                <div>
                  <label className="stat-label block mb-1 text-xs">6-Digit Verification Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    required
                    className="input-field w-full text-center tracking-[0.4em] font-mono text-lg font-bold border-red-900/50 focus:border-red-500"
                  />
                </div>
              </>
            ) : (
              <div>
                <p className="text-xs text-red-300/90 mb-2">
                  ℹ️ Your email is unverified. Enter your account password to confirm permanent deletion:
                </p>
                <label className="stat-label block mb-1 text-xs">Account Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="input-field w-full text-sm pr-10 border-red-900/50 focus:border-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? "👁" : "👁‍🗨"}
                  </button>
                </div>
              </div>
            )}

            {feedback && (
              <p className={`text-xs font-[Rajdhani] ${feedback.type === "success" ? "text-accent-green" : "text-accent-red"}`}>
                {feedback.message}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-border-subtle">
              <button type="button" onClick={handleCloseModal} className="btn-secondary text-xs px-4 py-2">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (isVerified ? otpCode.length !== 6 : !password)}
                className="btn-danger text-xs px-4 py-2"
              >
                {isSubmitting ? "Deleting..." : "Permanently Delete Account"}
              </button>
            </div>
          </form>
        </ModalWrapper>
      )}
    </div>
  );
}

function ModalWrapper({
  title,
  onClose,
  children,
  danger = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`system-card relative w-full max-w-md p-6 z-10 flex flex-col ${
          danger ? "border-red-900/60 shadow-[0_0_30px_rgba(239,68,68,0.25)]" : "shadow-2xl border-border-subtle"
        }`}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold"
        >
          ✕
        </button>
        <h2
          className={`text-xl font-bold mb-4 font-rajdhani uppercase tracking-wide ${
            danger ? "text-accent-red" : "text-accent-primary-light"
          }`}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
