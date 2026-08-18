"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../../components/AuthProvider";
import { SettingsRowGroup } from "../../components/SettingsRowGroup";
import { SettingsRow } from "../../components/SettingsRow";
import { PrivacyLevel } from "@/lib/privacy-types";

export default function PrivacyInformation() {
  const { token, isLoading } = useAuth();
  
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
      if (!token) return;
      try {
        const res = await fetch("/api/user/privacy", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
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
  }, [token]);

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
    if (!isDirty || !token) return;
    
    setIsSaving(true);
    setStatus({ type: null, message: null });

    try {
      const res = await fetch("/api/user/privacy", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(privacyState),
      });

      const data = await res.json();

      if (res.ok) {
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
      <div className="animate-pulse pt-2 space-y-8">
        <div className="bg-white/5 border border-white/10 rounded h-[140px]"></div>
        <div className="bg-white/5 border border-white/10 rounded h-[140px]"></div>
      </div>
    );
  }

  const PrivacySelect = ({ name, value }: { name: string, value: string }) => (
    <select
      name={name}
      value={value}
      onChange={handleSelectChange}
      disabled={isSaving}
      className="input-field text-sm shrink-0 bg-bg-void border-border-subtle focus:border-accent-cyan"
      style={{ padding: "6px 12px", width: "auto", minWidth: "140px" }}
    >
      <option value={PrivacyLevel.PUBLIC}>Public</option>
      <option value={PrivacyLevel.GROUPS}>Groups & Friends</option>
      <option value={PrivacyLevel.FRIENDS}>Friends Only</option>
      <option value={PrivacyLevel.PRIVATE}>Private (Only Me)</option>
    </select>
  );

  return (
    <form onSubmit={handleSave} className="space-y-8 pt-2 relative">
      {status.message && (
        <div className={`p-4 rounded border text-sm ${
          status.type === 'success' 
            ? 'bg-accent-green/10 border-accent-green/30 text-accent-green' 
            : 'bg-red-950/20 border-red-900/50 text-accent-red'
        }`}>
          {status.message}
        </div>
      )}

      {/* Visibility & Status */}
      <div>
        <h3 className="text-sm font-['Rajdhani'] font-bold uppercase tracking-widest text-accent-text-light mb-4">
          Visibility & Status
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
        <h3 className="text-sm font-['Rajdhani'] font-bold uppercase tracking-widest text-accent-text-light mb-4">
          Profile Data
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
        <h3 className="text-sm font-['Rajdhani'] font-bold uppercase tracking-widest text-accent-text-light mb-4">
          Social & Interactions
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

      <div className="border-t border-border-subtle pt-6 flex justify-end">
        <button 
          type="submit" 
          className={`px-6 py-2.5 rounded-xl font-['Rajdhani'] font-bold tracking-wider uppercase text-white transition-all shadow-md ${
            !isDirty || isSaving 
              ? "bg-accent-primary-dim opacity-50 cursor-not-allowed border border-border-subtle" 
              : "bg-accent-primary hover:bg-accent-primary-mid active:scale-95"
          }`} 
          disabled={!isDirty || isSaving}
        >
          {isSaving ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    </form>
  );
}
