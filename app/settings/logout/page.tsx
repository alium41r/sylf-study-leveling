"use client";

import { useAuth } from "@/app/components/AuthProvider";
import { useRouter } from "next/navigation";
import { useState } from "react";
import BackToSettings from "@/app/components/BackToSettings";
import styles from "../components/SystemHubPage.module.css";
import { LogOut, ShieldAlert, CheckCircle2 } from "lucide-react";

export default function LogoutSettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  const handleCancel = () => {
    router.push("/settings");
  };

  return (
    <div className={styles.hubContainer}>
      <div className={styles.topGlow} aria-hidden="true" />

      <div className={styles.contentWrapper}>
        <BackToSettings />

        <div className="flex flex-col items-center justify-center min-h-[60vh] py-12">
          <div className={`${styles.configSectionCard} w-full max-w-lg p-6 sm:p-8 text-center relative`}>
            {/* Warning Icon Badge */}
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center border border-red-500/30 bg-red-500/10 text-red-500 mb-5 shadow-[0_0_24px_rgba(239,68,68,0.15)]">
              <LogOut className="w-8 h-8" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold font-['Rajdhani'] uppercase tracking-wider text-[var(--ink)] mb-2">
              Terminate Scholar Session?
            </h1>

            <p className="text-sm text-[var(--muted)] max-w-md mx-auto mb-6">
              You are about to sign out of your current device session. You will need your login credentials or connected OAuth provider to sign back in.
            </p>

            {/* User Session Snapshot */}
            {user && (
              <div className="p-4 rounded-xl border border-[var(--sub-border)] bg-[var(--sub-surface)] flex items-center justify-between gap-3 text-left mb-6">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent-dim)] border border-[var(--line)] flex items-center justify-center font-['Rajdhani'] font-extrabold text-base text-[var(--accent)] shrink-0">
                    {user.hunterRank || "E"}
                  </div>
                  <div className="min-w-0">
                    <div className="font-['Rajdhani'] font-bold text-sm text-[var(--ink)] truncate">
                      {user.name || user.username}
                    </div>
                    <div className="text-xs text-[var(--muted)] truncate font-mono">
                      @{user.username} · Level {user.level || 1}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-['Rajdhani'] font-bold shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Synced</span>
                </div>
              </div>
            )}

            {/* Progress Safe Notice */}
            <div className="p-3 rounded-xl bg-[var(--chip-bg)] border border-[var(--sub-border)] text-xs text-[var(--quiet)] flex items-center gap-2 text-left mb-6">
              <ShieldAlert className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span>
                Your quests, level progression, focus logs, and currency balances are securely recorded in the cloud.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isLoggingOut}
                className={`${styles.btnSecondary} w-full sm:w-auto px-6 py-2.5`}
              >
                Stay Logged In
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                disabled={isLoggingOut}
                className={`${styles.btnDanger} w-full sm:w-auto px-6 py-2.5`}
              >
                {isLoggingOut ? "Signing Out..." : "Sign Out"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
