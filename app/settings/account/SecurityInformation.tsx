"use client";

import React, { useState } from "react";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { useAuth } from "../../components/AuthProvider";
import { SettingsRowGroup } from "../../components/SettingsRowGroup";
import { SettingsRow } from "../../components/SettingsRow";

export default function SecurityInformation() {
  const { user, isLoading, login, token } = useAuth();
  
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
      const res = await fetch("/api/user/security", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "password",
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword,
          confirmPassword: passwords.confirmPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus({ type: "success", message: data.message });
        // Replace current session seamlessly
        if (data.token && user) {
          login(data.token, user);
        }
        // Auto close after 1.5s on success
        setTimeout(() => {
          setModalState({ isOpen: false, type: null });
        }, 1500);
      } else {
        setStatus({ type: "error", message: data.error || "An error occurred." });
      }
    } catch (error) {
      setStatus({ type: "error", message: "Failed to connect to the server." });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="animate-pulse pt-2">
        <div className="bg-white/5 border border-white/10 rounded h-[140px]"></div>
      </div>
    );
  }

  return (
    <div className="pt-2 relative">
      <SettingsRowGroup>
        <SettingsRow
          label="Password"
          description="Protect your account with a secure password."
        >
          <button onClick={() => openModal("password")} className="btn-secondary" style={{ padding: "6px 16px", fontSize: "0.75rem" }}>
            Change
          </button>
        </SettingsRow>

        <SettingsRow
          label={
            <>
              Two-Factor Authentication (2FA)
              <span className="text-[0.6rem] px-2 py-0.5 rounded bg-accent-primary-dim text-accent-cyan uppercase tracking-widest border border-accent-primary-mid">Off</span>
            </>
          }
          description="Protect your account with an extra layer of security."
        >
          <button onClick={() => openModal("2fa")} className="btn-primary" style={{ padding: "6px 16px", fontSize: "0.75rem" }}>
            Enable
          </button>
        </SettingsRow>
      </SettingsRowGroup>

      {/* Custom Password Modal */}
      {modalState.isOpen && modalState.type === "password" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="system-card relative w-full max-w-sm p-6 z-10 shadow-2xl">
            <button 
              onClick={closeModal}
              disabled={isSaving}
              className="absolute top-4 right-4 text-gray-400 hover:text-white disabled:opacity-50"
            >
              ✕
            </button>
            
            <h2 className="text-xl font-bold mb-4 font-rajdhani uppercase tracking-wide text-accent-cyan">
              Change Password
            </h2>

            {status.message && (
              <div className={`mb-4 p-3 rounded text-sm ${status.type === 'success' ? 'bg-accent-green/10 text-accent-green' : 'bg-red-950/20 text-accent-red border border-red-900/50'}`}>
                {status.message}
              </div>
            )}

            <form onSubmit={submitPasswordChange} className="space-y-4">
              <div>
                <label className="block text-[0.7rem] font-rajdhani uppercase tracking-widest text-muted mb-1">Current Password</label>
                <input 
                  type="password" 
                  name="currentPassword"
                  value={passwords.currentPassword}
                  onChange={handlePasswordChange}
                  disabled={isSaving}
                  className="input-field w-full" 
                  required
                />
              </div>
              <div>
                <label className="block text-[0.7rem] font-rajdhani uppercase tracking-widest text-muted mb-1">New Password</label>
                <input 
                  type="password" 
                  name="newPassword"
                  value={passwords.newPassword}
                  onChange={handlePasswordChange}
                  disabled={isSaving}
                  className="input-field w-full" 
                  required
                  minLength={6}
                />
              </div>
              <div className="mb-6">
                <label className="block text-[0.7rem] font-rajdhani uppercase tracking-widest text-muted mb-1">Confirm New Password</label>
                <input 
                  type="password" 
                  name="confirmPassword"
                  value={passwords.confirmPassword}
                  onChange={handlePasswordChange}
                  disabled={isSaving}
                  className="input-field w-full" 
                  required
                  minLength={6}
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={closeModal} disabled={isSaving} className="btn-secondary" style={{ padding: "8px 16px", fontSize: "0.85rem" }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} className="btn-primary" style={{ padding: "8px 16px", fontSize: "0.85rem" }}>
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
          <div className="space-y-4">
            <p className="text-gray-300">
              Enabling 2FA will require you to use an authenticator app (like Google Authenticator or Authy) each time you log in.
            </p>
            <div className="p-3 bg-black/40 border border-white/10 rounded text-center italic text-xs text-accent-primary-light">
              <span className="opacity-70">2FA Backend architecture initialized. Full integration coming soon...</span>
            </div>
          </div>
        }
        confirmText="Proceed"
      />
    </div>
  );
}
