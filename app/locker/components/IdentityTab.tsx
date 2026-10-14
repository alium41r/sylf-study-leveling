"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { useProfileModal } from "@/app/components/ProfileModalContext";
import {
  CharacterConfig,
  getDefaultCharacterConfig,
} from "@/lib/character-traits";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-transport";
import { Check, X } from "lucide-react";
import { StudioHubView } from "./identity/StudioHubView";
import { PixelCustomizer } from "./identity/PixelCustomizer";
import { PixelStudio } from "./studio/PixelStudio";
import { drawsTheSameCompanion } from "./identity/pixel-customizer-options";
import { ProfileStudioView } from "./identity/ProfileStudioView";

export type IdentityViewMode =
  | "hub"
  | "pixel-customizer"
  | "pixel-studio"
  | "profile-studio";

export function IdentityTab() {
  const { user, mutateUser } = useAuth();
  const { openProfile } = useProfileModal();

  const params = useSearchParams();
  const router = useRouter();
  const requestedView = params.get("view");
  const viewMode: IdentityViewMode = requestedView === "pixel-studio" || requestedView === "profile-studio" ? requestedView : requestedView === "customizer" || requestedView === "pixel-customizer" || requestedView === "character-studio" ? "pixel-customizer" : "hub";
  const creationId = params.get("creation");
  const [saveError, setSaveError] = useState<string | null>(null);
  const location = (view: IdentityViewMode, id?: string) => `/locker?tab=identity${view === "hub" ? "" : `&view=${view}`}${id ? `&creation=${encodeURIComponent(id)}` : ""}`;
  const navigate = (view: IdentityViewMode, id?: string) => router.push(location(view, id), { scroll: false });

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
  const [connectedAccounts, setConnectedAccounts] = useState<{
    github?: string | null;
    discord?: string | null;
    instagram?: string | null;
  }>({});

  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  // ─── Initial Data Sync ─────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    apiFetch("/api/cosmetics")
      .then(async (res) => (res.ok ? res.json().catch(() => null) : null))
      .then((data) => {
        if (!data) return;
        if (data.active) {
          setActiveCosmetics(data.active);
        }
      })
      .catch(console.error);

    apiFetch("/api/user/connections")
      .then(async (res) => (res.ok ? res.json().catch(() => null) : null))
      .then((data) => {
        if (!data?.connections) return;
        const accs: { github?: string | null; discord?: string | null; instagram?: string | null } = {};
        data.connections.forEach((c: any) => {
          if (c.isLinked) {
            const provider = c.provider.toLowerCase();
            if (provider === "github") accs.github = c.username || c.email?.split("@")[0] || null;
            if (provider === "discord") accs.discord = c.username || null;
            if (provider === "instagram") accs.instagram = c.username || null;
          }
        });
        setConnectedAccounts(accs);
      })
      .catch(console.error);

  }, [user?.id]);

  useEffect(() => {
    const next = user?.characterConfig;
    if (!next || JSON.stringify(next) === JSON.stringify(savedConfig)) return;
    // Synchronize external equip/delete/stat refreshes without destroying a draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedConfig(next);
    if (drawsTheSameCompanion(characterConfig, savedConfig)) setCharacterConfig(next);
    else setSaveError('Your equipped companion changed elsewhere. Your unapplied choices are retained; Reset uses the latest saved companion.');
  }, [user?.characterConfig, savedConfig, characterConfig]);

  useEffect(() => {
    if (user) {
      if (user.characterConfig) {
        setCharacterConfig(user.characterConfig);
        setSavedConfig(user.characterConfig);
      }
      if (user.bannerUrl !== undefined) setBannerUrl(user.bannerUrl || "");
      if (user.avatarUrl !== undefined) setAvatarUrl(user.avatarUrl || "");
      if (user.bio !== undefined) setBio(user.bio || "");
    }
  }, [user?.id]);

  if (!user) {
    return (
      <div className="p-12 text-center text-text-muted font-['Rajdhani'] animate-pulse">
        Accessing Scholar Identity Hub...
      </div>
    );
  }

  const hasUnsavedChanges =
    !drawsTheSameCompanion(characterConfig, savedConfig) ||
    bannerUrl !== (user.bannerUrl || "") ||
    avatarUrl !== (user.avatarUrl || "") ||
    bio !== (user.bio || "");

  const handleSaveAll = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    try {
      const res = await apiFetch("/api/profile/customization", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
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
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSavedConfig(characterConfig);
        mutateUser(data.user);
        setSaveToast(true);
        setTimeout(() => setSaveToast(false), 3000);
      } else {
        const failure = await res.json();
        setSaveError(failure.error ?? "Could not save identity changes.");
      }
    } catch (err) {
      setSaveError("Could not save identity changes. Please retry.");
      console.error("Failed to save identity modifications:", err);
    } finally {
      setSaving(false);
    }
  };

  const applyCompanion = async (next: CharacterConfig) => {
    const response = await apiFetch("/api/profile/customization", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterConfig: next }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not apply companion changes.");
    setCharacterConfig(next); setSavedConfig(next); mutateUser(result.user);
  };

  return (
    <div className={viewMode === "pixel-studio" ? "flex flex-col h-full min-h-0" : "flex flex-col gap-6"}>
      {saveError && <p role="alert">{saveError}</p>}
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
              <span>Identity changes saved successfully!</span>
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
              characterConfig={savedConfig}
              bannerUrl={bannerUrl}
              avatarUrl={avatarUrl}
              bio={bio}
              connectedAccounts={connectedAccounts}
              activeCosmetics={activeCosmetics}
              onNavigate={navigate}
              onPreviewProfile={() => openProfile(user.username)}
              hasUnsavedChanges={hasUnsavedChanges}
              onSaveAll={handleSaveAll}
              saving={saving}
            />
          </motion.div>
        )}

        {/*
          The Pixel Display customizer.

          It shares this tab's draft, save, reset and toast — there is one
          persistence path and one ownership rule for the whole identity section,
          and this view is another way to edit the same draft.
        */}
        {viewMode === "pixel-customizer" && (
          <motion.div
            key="pixel-customizer"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <PixelCustomizer
              characterConfig={characterConfig}
              savedConfig={savedConfig}
              user={user}
              onChange={(patch) =>
                setCharacterConfig((prev) => ({ ...prev, ...patch }))
              }
              onReset={() => setCharacterConfig(savedConfig)}
              onSave={async () => { setSaving(true); try { await applyCompanion(characterConfig); } finally { setSaving(false); } }}
              onEdit={(id) => navigate("pixel-studio", id)}
              saving={saving}
              onBack={() => navigate("hub")}
            />
          </motion.div>
        )}

        {/* Studio saves artwork and can equip it through the same config owner. */}
        {viewMode === "pixel-studio" && (
          <motion.div
            key="pixel-studio"
            className="h-full min-h-0"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <PixelStudio
              characterConfig={savedConfig}
              onEquip={async (patch) => applyCompanion({ ...savedConfig, ...patch })}
              creationId={creationId}
              onSaved={(id) => router.replace(location("pixel-studio", id), { scroll: false })}
              saving={saving}
              onBack={() => navigate("hub")}
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
              connectedAccounts={connectedAccounts}
              activeCosmetics={activeCosmetics}
              onBackToHub={() => navigate("hub")}
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
