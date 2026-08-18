"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { useProfileModal } from "@/app/components/ProfileModalContext";
import {
  CharacterConfig,
  getDefaultCharacterConfig,
} from "@/lib/character-traits";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X } from "lucide-react";
import { StudioHubView } from "./identity/StudioHubView";
import { CharacterStudioView } from "./identity/CharacterStudioView";
import { ProfileStudioView } from "./identity/ProfileStudioView";

export type IdentityViewMode = "hub" | "character-studio" | "profile-studio";

export function IdentityTab() {
  const { user, token, mutateUser } = useAuth();
  const { openProfile } = useProfileModal();

  const [viewMode, setViewMode] = useState<IdentityViewMode>("hub");

  // ─── Draft States (Persisted across sub-view navigation) ─────
  const [characterConfig, setCharacterConfig] = useState<CharacterConfig>(() => {
    return user?.characterConfig || getDefaultCharacterConfig(user?.username || "scholar");
  });

  const [savedConfig, setSavedConfig] = useState<CharacterConfig>(() => {
    return user?.characterConfig || getDefaultCharacterConfig(user?.username || "scholar");
  });

  const [activeCosmetics, setActiveCosmetics] = useState<any>({
    activeAvatar: user?.activeAvatar || "class_scholar",
    activeFrame: user?.activeFrame || "none",
    activeTitle: user?.activeTitle || "Novice",
    activeAura: user?.activeAura || "aura_monarch",
    activeNameColor: user?.activeNameColor || "default",
  });

  const [bannerUrl, setBannerUrl] = useState<string>(user?.bannerUrl || "");
  const [avatarUrl, setAvatarUrl] = useState<string>(user?.avatarUrl || "");
  const [bio, setBio] = useState<string>(user?.bio || "");
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(user?.socialLinks || {});

  const [stats, setStats] = useState<any>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  // ─── Initial Data Sync ─────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    fetch("/api/cosmetics", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => (res.ok ? res.json().catch(() => null) : null))
      .then((data) => {
        if (!data) return;
        if (data.active) {
          setActiveCosmetics(data.active);
        }
      })
      .catch(console.error);

    fetch("/api/profile/stats", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => (res.ok ? res.json().catch(() => null) : null))
      .then((data) => {
        if (data?.stats) setStats(data);
      })
      .catch(console.error)
      .finally(() => setInitialLoad(false));
  }, [token]);

  useEffect(() => {
    if (user) {
      if (user.characterConfig) {
        setCharacterConfig(user.characterConfig);
        setSavedConfig(user.characterConfig);
      }
      if (user.bannerUrl !== undefined) setBannerUrl(user.bannerUrl || "");
      if (user.avatarUrl !== undefined) setAvatarUrl(user.avatarUrl || "");
      if (user.bio !== undefined) setBio(user.bio || "");
      if (user.socialLinks) setSocialLinks(user.socialLinks);
    }
  }, [user]);

  if (!user || initialLoad) {
    return (
      <div className="p-12 text-center text-text-muted font-['Rajdhani'] animate-pulse">
        Accessing Scholar Identity Hub...
      </div>
    );
  }

  const hasUnsavedChanges =
    JSON.stringify(characterConfig) !== JSON.stringify(savedConfig) ||
    bannerUrl !== (user.bannerUrl || "") ||
    avatarUrl !== (user.avatarUrl || "") ||
    bio !== (user.bio || "") ||
    JSON.stringify(socialLinks) !== JSON.stringify(user.socialLinks || {});

  const handleSaveAll = async () => {
    if (saving || !token) return;
    setSaving(true);

    try {
      const res = await fetch("/api/profile/customization", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          characterConfig,
          bannerUrl: bannerUrl.trim() || null,
          avatarUrl: avatarUrl.trim() || null,
          bio: bio.trim() || null,
          activeAura: characterConfig.aura || activeCosmetics.activeAura || "none",
          activeFrame: activeCosmetics.activeFrame,
          activeTitle: activeCosmetics.activeTitle,
          activeAvatar: activeCosmetics.activeAvatar,
          activeNameColor: activeCosmetics.activeNameColor,
          socialLinks,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSavedConfig(characterConfig);
        mutateUser(data.user);
        setSaveToast(true);
        setTimeout(() => setSaveToast(false), 3000);
      }
    } catch (err) {
      console.error("Failed to save identity modifications:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ─── Save Success Toast Banner ─────────────────────────── */}
      <AnimatePresence>
        {saveToast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-['Rajdhani'] font-bold flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Identity configuration, sprite traits, and profile details saved successfully!</span>
            </div>
            <button
              type="button"
              onClick={() => setSaveToast(false)}
              className="text-emerald-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Sub-View Router Deck ───────────────────────────────── */}
      <AnimatePresence mode="wait">
        {viewMode === "hub" && (
          <motion.div
            key="hub"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <StudioHubView
              user={user}
              characterConfig={characterConfig}
              bannerUrl={bannerUrl}
              avatarUrl={avatarUrl}
              bio={bio}
              socialLinks={socialLinks}
              activeCosmetics={activeCosmetics}
              onNavigate={(view) => setViewMode(view)}
              onPreviewProfile={() => openProfile(user.username)}
              hasUnsavedChanges={hasUnsavedChanges}
              onSaveAll={handleSaveAll}
              saving={saving}
            />
          </motion.div>
        )}

        {viewMode === "character-studio" && (
          <motion.div
            key="character-studio"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <CharacterStudioView
              user={user}
              characterConfig={characterConfig}
              setCharacterConfig={setCharacterConfig}
              savedConfig={savedConfig}
              activeCosmetics={activeCosmetics}
              setActiveCosmetics={setActiveCosmetics}
              stats={stats}
              onBackToHub={() => setViewMode("hub")}
              onPreviewProfile={() => openProfile(user.username)}
              onSaveCharacter={handleSaveAll}
              saving={saving}
            />
          </motion.div>
        )}

        {viewMode === "profile-studio" && (
          <motion.div
            key="profile-studio"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <ProfileStudioView
              user={user}
              bannerUrl={bannerUrl}
              setBannerUrl={setBannerUrl}
              avatarUrl={avatarUrl}
              setAvatarUrl={setAvatarUrl}
              bio={bio}
              setBio={setBio}
              socialLinks={socialLinks}
              setSocialLinks={setSocialLinks}
              activeCosmetics={activeCosmetics}
              onBackToHub={() => setViewMode("hub")}
              onPreviewProfile={() => openProfile(user.username)}
              onSaveProfile={handleSaveAll}
              saving={saving}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
