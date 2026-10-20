"use client";

import React, { useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import { SettingsRowGroup } from "../../components/SettingsRowGroup";
import { SettingsRow } from "../../components/SettingsRow";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertTriangle, X } from "lucide-react";
import { prepareNotesLogout, cancelNotesLogout } from "@/lib/notes/session";
import { getAccountCapability } from "./services/account-capability";
import styles from "../components/SystemHubPage.module.css";

interface DangerAction {
  id: "logout" | "logout_all" | "reset_progress" | "delete_account";
  label: string;
  description: string;
  actionText: string;
}

export default function DangerZone() {
  const { user, logout, refreshStats } = useAuth();
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
    setIsSubmitting(true);setFeedback(null);
    try { await logout(); router.push("/login"); }
    catch(error) { setFeedback({type:"error",message:error instanceof Error?error.message:"Sign out could not finish. Keep this tab open and try again."}); }
    finally {setIsSubmitting(false);}
  };

  // 2. Log Out All Devices (Password Gated)
  const handleLogoutAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      await prepareNotesLogout(user ? String(user.id) : null);
      const result = await getAccountCapability().logoutAllDevices(password);

      if (result.ok) {
        await logout();
        router.push("/login");
      } else {
        cancelNotesLogout(user ? String(user.id) : null);
        setFeedback({ type: "error", message: result.error || "Failed to revoke all sessions." });
      }
    } catch (error) {
      cancelNotesLogout(user ? String(user.id) : null);
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Could not revoke sessions. Keep this tab open and try again." });
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
      const result = await getAccountCapability().sendSecurityCode(action);

      if (result.ok) {
        setFeedback({ type: "success", message: result.message || "Verification code sent to your email." });
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
        setFeedback({ type: "error", message: result.error || "Failed to send code." });
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
      const result = await getAccountCapability().resetProgress(payload);

      if (result.ok) {
        if (refreshStats) await refreshStats();
        setFeedback({ type: "success", message: result.message || "Progress reset successfully! Starting at Level 1." });
        setTimeout(() => {
          handleCloseModal();
          router.push("/dashboard");
        }, 1200);
      } else {
        setFeedback({ type: "error", message: result.error || "Failed to reset progression." });
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
      const result = await getAccountCapability().deleteAccount(payload);

      if (result.ok) {
        logout();
        router.push("/register");
      } else {
        setFeedback({ type: "error", message: result.error || "Failed to delete account." });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error. Could not delete account." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pt-1">
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
              className="px-3.5 py-1.5 rounded-xl font-['Rajdhani'] font-bold text-xs uppercase tracking-wider transition-all border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white shrink-0"
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
            <p className="text-[var(--muted)] text-sm">
              Are you sure you want to sign out of your account on this device?
            </p>
            {feedback?.type === "error" && <p role="alert" className="text-sm text-red-500">{feedback.message}</p>}
            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--subtle-line)]">
              <button onClick={handleCloseModal} className={styles.btnSecondary}>
                Cancel
              </button>
              <button onClick={handleLogout} disabled={isSubmitting} className={styles.btnDanger}>
                {isSubmitting ? "Signing Out..." : "Log Out"}
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* ─── 2. Log Out All Devices Modal (Password Protected) ─── */}
      {activeModal === "logout_all" && (
        <ModalWrapper title="Log Out Everywhere" onClose={handleCloseModal} danger={true}>
          <form onSubmit={handleLogoutAll} className="space-y-4">
            <p className="text-[var(--muted)] text-sm">
              This will revoke all active authentication sessions across all browsers and devices. Enter your account password to confirm.
            </p>

            <div>
              <label className={styles.configLabel}>Account Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className={styles.configInput}
                  style={{ paddingRight: "40px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {feedback && (
              <p className={`text-xs font-['Rajdhani'] font-bold ${feedback.type === "success" ? "text-emerald-500" : "text-rose-500"}`}>
                {feedback.message}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--subtle-line)]">
              <button type="button" onClick={handleCloseModal} className={styles.btnSecondary}>
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting || !password} className={styles.btnDanger}>
                {isSubmitting ? "Revoking..." : "Revoke All Sessions"}
              </button>
            </div>
          </form>
        </ModalWrapper>
      )}

      {/* ─── 3. Reset Progress Modal ─── */}
      {activeModal === "reset_progress" && (
        <ModalWrapper title="Reset Hunter Progress" onClose={handleCloseModal} danger={true}>
          <form onSubmit={handleResetProgress} className="space-y-4">
            <p className="text-[var(--muted)] text-sm">
              This action will reset your level back to <strong className="text-[var(--accent)] font-bold">Level 1</strong>, XP to 0, and clear your active quest log. Your account identity and unlocked cosmetics will remain intact.
            </p>

            {isVerified ? (
              <>
                <div className="p-3.5 bg-[var(--sub-surface)] border border-[var(--sub-border)] rounded-xl flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[var(--quiet)] block">
                      Security Code Destination
                    </span>
                    <span className="text-sm text-[var(--ink)] font-mono truncate block">{user?.email || "Registered Email"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendCode("RESET_PROGRESS")}
                    disabled={isSendingCode || cooldown > 0}
                    className="shrink-0 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--accent-dim)] text-[var(--accent)] hover:bg-[var(--accent-strong)] hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSendingCode ? "Sending..." : cooldown > 0 ? `Resend (${cooldown}s)` : "Send Code"}
                  </button>
                </div>

                <div>
                  <label className={styles.configLabel}>6-Digit Verification Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    required
                    className={styles.configInput}
                    style={{ textAlign: "center", letterSpacing: "0.3em", fontSize: "1.1rem" }}
                  />
                </div>
              </>
            ) : (
              <div>
                <p className="text-xs text-amber-500 mb-2">
                  ℹ️ Your email is unverified. Enter your account password to confirm reset:
                </p>
                <label className={styles.configLabel}>Account Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className={styles.configInput}
                    style={{ paddingRight: "40px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {feedback && (
              <p className={`text-xs font-['Rajdhani'] font-bold ${feedback.type === "success" ? "text-emerald-500" : "text-rose-500"}`}>
                {feedback.message}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--subtle-line)]">
              <button type="button" onClick={handleCloseModal} className={styles.btnSecondary}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (isVerified ? otpCode.length !== 6 : !password)}
                className={styles.btnDanger}
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
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-500 leading-relaxed flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>
                <strong>WARNING:</strong> This action permanently deletes your Scholar account, all study history, quests, level progression, and social records. <strong>This action CANNOT be undone.</strong>
                <span className="block mt-3">Account deletion also removes your Notes unlock key. Export unsynchronized Notes from every device before deleting your account. Retained encrypted browser copies alone cannot replace that key.</span>
              </span>
            </div>

            {isVerified ? (
              <>
                <div className="p-3.5 bg-[var(--sub-surface)] border border-[var(--sub-border)] rounded-xl flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[var(--quiet)] block">
                      Confirmation Code Destination
                    </span>
                    <span className="text-sm text-[var(--ink)] font-mono truncate block">{user?.email || "Registered Email"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendCode("DELETE_ACCOUNT")}
                    disabled={isSendingCode || cooldown > 0}
                    className="shrink-0 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSendingCode ? "Sending..." : cooldown > 0 ? `Resend (${cooldown}s)` : "Send Code"}
                  </button>
                </div>

                <div>
                  <label className={styles.configLabel}>6-Digit Verification Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    required
                    className={styles.configInput}
                    style={{ textAlign: "center", letterSpacing: "0.3em", fontSize: "1.1rem" }}
                  />
                </div>
              </>
            ) : (
              <div>
                <p className="text-xs text-red-400 mb-2">
                  ℹ️ Your email is unverified. Enter your account password to confirm permanent deletion:
                </p>
                <label className={styles.configLabel}>Account Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className={styles.configInput}
                    style={{ paddingRight: "40px" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {feedback && (
              <p className={`text-xs font-['Rajdhani'] font-bold ${feedback.type === "success" ? "text-emerald-500" : "text-rose-500"}`}>
                {feedback.message}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--subtle-line)]">
              <button type="button" onClick={handleCloseModal} className={styles.btnSecondary}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (isVerified ? otpCode.length !== 6 : !password)}
                className={styles.btnDanger}
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
    <div className={styles.configModalBackdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={danger ? styles.configModalCardDanger : styles.configModalCard}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--muted)] hover:text-[var(--ink)] transition-colors p-1.5 rounded-lg hover:bg-[var(--chip-bg)]"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>
        <h2
          className={`text-lg sm:text-xl font-bold mb-4 font-['Rajdhani'] uppercase tracking-wider ${
            danger ? "text-red-500" : "text-[var(--ink)]"
          }`}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
