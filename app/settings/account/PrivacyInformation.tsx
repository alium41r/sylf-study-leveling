"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../../components/AuthProvider";
import { SettingsRowGroup } from "../../components/SettingsRowGroup";
import { SettingsRow } from "../../components/SettingsRow";
import { PrivacyLevel } from "@/lib/privacy-types";
import { fetchCachedJSON, clearClientCache } from "@/lib/client-data-cache";

import styles from "@/app/settings/components/SystemHubPage.module.css";
import { Eye, Shield, Users, Lock, Check, AlertCircle } from "lucide-react";

export default function PrivacyInformation() {
  const { user, isLoading } = useAuth();
  
  const [privacyState, setPrivacyState] = useState<Record<string, string>>({
    profileVisibility: "PUBLIC",
    showOnlineStatus: "PUBLIC",
    showCurrentSession: "PUBLIC",
    showStudyHours: "PUBLIC",
    showRank: "PUBLIC",
    showAchievements: "PUBLIC",
    allowFriendRequests: "PUBLIC",
    allowDirectMessages: "FRIENDS",
  });

  const [initialState, setInitialState] = useState<Record<string, string> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string | null }>({ type: null, message: null });
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    async function fetchPrivacy() {
      if (!user) return;
      try {
        // Stale-while-revalidate: reopening account paints instantly.
        const data = await fetchCachedJSON<{ id?: number; userId?: number; [key: string]: any }>(
          "/api/user/privacy",
          {},
          { ttlMs: 30_000, staleMs: 120_000 }
        );
        if (data) {
          // Strip out id and userId
          const { id, userId, ...settings } = data;
          setPrivacyState(settings);
          setInitialState(settings);
        }
      } catch (err) {
        console.error("Failed to load privacy settings", err);
      } finally {
        setIsFetching(false);
      }
    }
    fetchPrivacy();
  }, [user?.id]);

  const isDirty = initialState && JSON.stringify(privacyState) !== JSON.stringify(initialState);

  // Unsaved changes warning on window unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPrivacyState((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    if (status.type) setStatus({ type: null, message: null });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDirty) return;
    
    setIsSaving(true);
    setStatus({ type: null, message: null });

    try {
      const res = await fetch("/api/user/privacy", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(privacyState),
      });

      const data = await res.json();

      if (res.ok) {
        clearClientCache();
        setStatus({ type: "success", message: data.message || "Privacy settings updated." });
        setInitialState(privacyState); // Reset dirty state
        
        // Clear success message after 3 seconds
        setTimeout(() => setStatus({ type: null, message: null }), 3000);
      } else {
        setStatus({ type: "error", message: data.error || "An error occurred." });
      }
    } catch (error) {
      setStatus({ type: "error", message: "Failed to connect to the server." });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || isFetching) {
    return (
      <div className="animate-pulse pt-2 space-y-6">
        <div className="h-32 rounded-xl bg-[var(--sub-surface)]"></div>
        <div className="h-32 rounded-xl bg-[var(--sub-surface)]"></div>
      </div>
    );
  }

  const PrivacySelect = ({ name, value }: { name: string, value: string }) => (
    <select
      name={name}
      value={value}
      onChange={handleSelectChange}
      disabled={isSaving}
      className={styles.configSelect}
      style={{ width: "auto", minWidth: "150px", height: "38px", padding: "0 32px 0 12px", fontSize: "0.85rem" }}
    >
      <option value={PrivacyLevel.PUBLIC}>Public</option>
      <option value={PrivacyLevel.GROUPS}>Groups & Friends</option>
      <option value={PrivacyLevel.FRIENDS}>Friends Only</option>
      <option value={PrivacyLevel.PRIVATE}>Private (Only Me)</option>
    </select>
  );

  return (
    <form onSubmit={handleSave} className="space-y-6 pt-1 relative">
      {status.message && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 font-['Rajdhani'] font-bold ${
            status.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
          }`}
        >
          {status.type === 'success' ? (
            <Check className="w-4 h-4 shrink-0 text-emerald-500" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          )}
          <span>{status.message}</span>
        </div>
      )}


      {/* Visibility & Status */}
      <div>
        <h3 className="text-xs font-['Rajdhani'] font-bold uppercase tracking-widest text-[var(--accent)] mb-3 flex items-center gap-2">
          <Eye className="w-3.5 h-3.5" />
          <span>Visibility & Online Telemetry</span>
        </h3>
        <SettingsRowGroup>
          <SettingsRow
            label="Profile Visibility"
            description="Control who can view your profile at a baseline level."
          >
            <PrivacySelect name="profileVisibility" value={privacyState.profileVisibility} />
          </SettingsRow>
          
          <SettingsRow
            label="Show Online Status"
            description="Let others see when you are actively using the system."
          >
            <PrivacySelect name="showOnlineStatus" value={privacyState.showOnlineStatus} />
          </SettingsRow>

          <SettingsRow
            label="Broadcast Study Sessions"
            description="Display your active study sessions and current subject."
          >
            <PrivacySelect name="showCurrentSession" value={privacyState.showCurrentSession} />
          </SettingsRow>
        </SettingsRowGroup>
      </div>

      {/* Profile Data */}
      <div>
        <h3 className="text-xs font-['Rajdhani'] font-bold uppercase tracking-widest text-[var(--accent)] mb-3 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5" />
          <span>Hunter Progress & Profile Data</span>
        </h3>
        <SettingsRowGroup>
          <SettingsRow
            label="Show Study Hours"
            description="Display your total accumulated study time, streak, and cognitive stats."
          >
            <PrivacySelect name="showStudyHours" value={privacyState.showStudyHours} />
          </SettingsRow>
          
          <SettingsRow
            label="Show Hunter Rank"
            description="Make your current rank (E to S) and Level visible to others."
          >
            <PrivacySelect name="showRank" value={privacyState.showRank} />
          </SettingsRow>
          
          <SettingsRow
            label="Show Achievements"
            description="Allow others to see the titles and badges you have earned."
          >
            <PrivacySelect name="showAchievements" value={privacyState.showAchievements} />
          </SettingsRow>
        </SettingsRowGroup>
      </div>

      {/* Social & Interactions */}
      <div>
        <h3 className="text-xs font-['Rajdhani'] font-bold uppercase tracking-widest text-[var(--accent)] mb-3 flex items-center gap-2">
          <Users className="w-3.5 h-3.5" />
          <span>Social Boundaries & Communications</span>
        </h3>
        <SettingsRowGroup>
          <SettingsRow
            label="Allow Friend Requests"
            description="Let other scholars send you friend requests."
          >
            <PrivacySelect name="allowFriendRequests" value={privacyState.allowFriendRequests} />
          </SettingsRow>
          
          <SettingsRow
            label="Allow Direct Messages"
            description="Receive messages from users. Private disables all incoming DMs."
          >
            <PrivacySelect name="allowDirectMessages" value={privacyState.allowDirectMessages} />
          </SettingsRow>
        </SettingsRowGroup>
      </div>

      <div className="border-t border-[var(--subtle-line)] pt-5 flex justify-end">
        <button 
          type="submit" 
          className={`${styles.btnPrimary} w-full sm:w-auto`}
          disabled={!isDirty || isSaving}
        >
          {isSaving ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    </form>
  );
}
