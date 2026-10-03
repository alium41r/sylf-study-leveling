"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { useAuth } from "../../components/AuthProvider";
import { SettingsRowGroup } from "../../components/SettingsRowGroup";
import { SettingsRow } from "../../components/SettingsRow";
import { getAccountCapability } from "./services/account-capability";

import styles from "@/app/settings/components/SystemHubPage.module.css";
import { Lock, Shield, KeyRound } from "lucide-react";

export default function SecurityInformation() {
  const { user, isLoading, login } = useAuth();
  
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: "password" | "2fa" | null;
  }>({ isOpen: false, type: null });

  // Password Modal State
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string | null }>({ type: null, message: null });

  const openModal = (type: "password" | "2fa") => {
    setModalState({ isOpen: true, type });
    setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setStatus({ type: null, message: null });
  };
  
  const closeModal = () => {
    if (isSaving) return;
    setModalState({ isOpen: false, type: null });
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswords((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    if (status.type) setStatus({ type: null, message: null });
  };

  const submitPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      setStatus({ type: "error", message: "New password and confirmation do not match." });
      return;
    }
    if (passwords.currentPassword === passwords.newPassword) {
      setStatus({ type: "error", message: "New password must be different from current password." });
      return;
    }

    setIsSaving(true);
    setStatus({ type: null, message: null });

    try {
      const result = await getAccountCapability().changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
        confirmPassword: passwords.confirmPassword,
      });

      if (result.ok) {
        setStatus({ type: "success", message: result.message || "Password updated successfully." });
        // Replace current session seamlessly
        if (user) {
          login(user);
        }
        // Auto close after 1.5s on success
        setTimeout(() => {
          setModalState({ isOpen: false, type: null });
        }, 1500);
      } else {
        setStatus({ type: "error", message: result.error || "An error occurred." });
      }
    } catch {
      setStatus({ type: "error", message: "Failed to connect to the server." });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="animate-pulse pt-2">
        <div className="h-28 rounded-xl bg-[var(--sub-surface)]"></div>
      </div>
    );
  }

  return (
    <div className="pt-1 relative">
      <SettingsRowGroup>
        <SettingsRow
          icon={<KeyRound className="w-5 h-5" />}
          label="Account Password"
          description="Update your cryptographic key and maintain strong defense barriers."
        >
          <button
            type="button"
            onClick={() => openModal("password")}
            className={styles.btnSecondary}
            style={{ padding: "6px 14px", fontSize: "0.75rem" }}
          >
            Change Password
          </button>
        </SettingsRow>

        <SettingsRow
          icon={<Shield className="w-5 h-5" />}
          label={
            <span className="flex items-center gap-2">
              <span>Two-Factor Authentication (2FA)</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-['Rajdhani'] font-bold uppercase tracking-wider ${styles.chip}`}>
                Off
              </span>
            </span>
          }
          description="Enforce secondary authenticator validation upon session initialization."
        >
          <button
            type="button"
            onClick={() => openModal("2fa")}
            className={styles.btnPrimary}
            style={{ padding: "6px 14px", fontSize: "0.75rem" }}
          >
            Configure 2FA
          </button>
        </SettingsRow>
      </SettingsRowGroup>

      {/* Custom Password Modal */}
      {modalState.isOpen && modalState.type === "password" && (
        <div className={styles.configModalBackdrop}>
          <div className="absolute inset-0" onClick={closeModal} />
          <div className={`${styles.configModalCard} relative z-10 flex flex-col`}>
            <button 
              type="button"
              onClick={closeModal}
              disabled={isSaving}
              className="absolute top-5 right-5 text-[var(--quiet)] hover:text-[var(--ink)] disabled:opacity-50 p-1 rounded-lg hover:bg-[var(--sub-surface)] transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-dim)] border border-[var(--accent-mid)] text-[var(--accent)] flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-extrabold font-['Rajdhani'] uppercase tracking-wider text-[var(--ink)]">
                Update Password
              </h2>
            </div>

            {status.message && (
              <div
                className={`mb-4 p-3 rounded-xl border text-xs font-['Rajdhani'] font-bold ${
                  status.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                }`}
              >
                {status.message}
              </div>
            )}

            <form onSubmit={submitPasswordChange} className="space-y-4">
              <div>
                <label className={styles.configLabel}>Current Password</label>
                <input 
                  type="password" 
                  name="currentPassword"
                  value={passwords.currentPassword}
                  onChange={handlePasswordChange}
                  disabled={isSaving}
                  className={styles.configInput} 
                  required
                />
              </div>
              <div>
                <label className={styles.configLabel}>New Password</label>
                <input 
                  type="password" 
                  name="newPassword"
                  value={passwords.newPassword}
                  onChange={handlePasswordChange}
                  disabled={isSaving}
                  className={styles.configInput} 
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className={styles.configLabel}>Confirm New Password</label>
                <input 
                  type="password" 
                  name="confirmPassword"
                  value={passwords.confirmPassword}
                  onChange={handlePasswordChange}
                  disabled={isSaving}
                  className={styles.configInput} 
                  required
                  minLength={6}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--subtle-line)]">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSaving}
                  className={styles.btnSecondary}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className={styles.btnPrimary}
                >
                  {isSaving ? "Saving..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2FA Placeholder Modal */}
      <ConfirmationModal
        isOpen={modalState.isOpen && modalState.type === "2fa"}
        onClose={closeModal}
        onConfirm={() => {
          // Placeholder trigger
        }}
        title="Enable Two-Factor Auth"
        message={
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Enabling 2FA will require you to use an authenticator app (like Google Authenticator or 1Password) each time you log in.
            </p>
            <div className="p-3.5 bg-[var(--sub-surface)] border border-[var(--sub-border)] rounded-xl text-center text-xs text-[var(--muted)] font-['Rajdhani']">
              <span>2FA Backend architecture initialized. Full multi-factor rollout scheduled in next milestone.</span>
            </div>
          </div>
        }
        confirmText="Acknowledge"
      />
    </div>
  );
}

