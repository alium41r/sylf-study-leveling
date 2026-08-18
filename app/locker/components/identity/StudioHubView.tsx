"use client";

import React from "react";
import { motion } from "framer-motion";
import { CharacterRenderer } from "@/app/components/character/CharacterRenderer";
import {
  CharacterConfig,
  SKIN_TONES,
  HAIR_STYLES,
  HAIR_COLORS,
  OUTFIT_STYLES,
  AURA_PRESETS,
} from "@/lib/character-traits";
import { getClassInfo } from "@/lib/cosmetics-catalog";
import {
  User,
  Sparkles,
  Palette,
  ArrowRight,
  Eye,
  Save,
  Globe,
  Award,
  Crown,
  Layers,
  FileText,
  Share2,
} from "lucide-react";

interface StudioHubViewProps {
  user: any;
  characterConfig: CharacterConfig;
  bannerUrl: string;
  avatarUrl: string;
  bio: string;
  socialLinks: Record<string, string>;
  activeCosmetics: any;
  onNavigate: (view: "character-studio" | "profile-studio") => void;
  onPreviewProfile: () => void;
  hasUnsavedChanges: boolean;
  onSaveAll: () => void;
  saving: boolean;
}

export function StudioHubView({
  user,
  characterConfig,
  bannerUrl,
  avatarUrl,
  bio,
  socialLinks,
  activeCosmetics,
  onNavigate,
  onPreviewProfile,
  hasUnsavedChanges,
  onSaveAll,
  saving,
}: StudioHubViewProps) {
  const classInfo = getClassInfo(activeCosmetics.activeAvatar || user.activeAvatar || "class_scholar");
  const outfitLabel = OUTFIT_STYLES.find((o) => o.value === characterConfig.outfit)?.label || "Scholar";
  const skinLabel = SKIN_TONES.find((s) => s.value === characterConfig.skin)?.label.split(" ")[0] || "Fair";
  const hairLabel = HAIR_COLORS.find((h) => h.value === characterConfig.hairColor)?.label.split(" ")[0] || "Black";
  const auraLabel = AURA_PRESETS.find((a) => a.id === characterConfig.aura)?.label.split(" ")[0] || "None";

  const connectedSocialsCount = Object.values(socialLinks || {}).filter((v) => Boolean(v?.trim())).length;

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* ─── Studio Hub Header ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="p-2 rounded-xl bg-accent-primary-dim border border-accent-primary-mid text-accent-text-light flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </span>
            <h2 className="text-2xl font-bold font-['Rajdhani'] text-text-primary tracking-wide">
              Identity Studio Hub
            </h2>
          </div>
          <p className="text-xs text-text-muted font-['Rajdhani']">
            Select a specialized studio workbench below to customize your sprite visuals, academic gear, and public profile dossier.
          </p>
        </div>

        {/* Global Hub Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onPreviewProfile}
            className="px-4 py-2.5 rounded-xl bg-bg-panel hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center gap-2 transition-all shadow-sm group"
            title="Preview Public Profile Modal"
          >
            <Eye className="w-4 h-4 text-accent-text-light group-hover:scale-110 transition-transform" />
            <span>Preview Profile</span>
          </button>

          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={onSaveAll}
              disabled={saving}
              className="btn-primary px-5 py-2.5 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-md animate-pulse"
              style={{
                background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
                color: "var(--text-primary)",
                border: "none",
              }}
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "Saving..." : "Save All Changes"}</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Studio Workbenches Portal Grid ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* ─── Portal Card 1: Character Studio ────────────────────── */}
        <motion.div
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          className="system-card bg-bg-panel/90 border border-border-subtle hover:border-accent-primary/60 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden shadow-xl group transition-all"
        >
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent-primary-dim/15 rounded-full blur-3xl pointer-events-none group-hover:bg-accent-primary-dim/25 transition-all" />

          <div>
            {/* Card Badge & Title */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-accent-primary-dim border border-accent-primary-mid text-accent-text-light">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold font-['Rajdhani'] text-text-primary tracking-wide">
                    Character Studio
                  </h3>
                  <span className="text-[10px] uppercase font-['Rajdhani'] font-bold text-accent-text-light tracking-widest block">
                    Full-Body Sprite Customizer
                  </span>
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-bg-abyss/80 border border-border-subtle text-text-secondary font-mono">
                Level {user.level || 1}
              </span>
            </div>

            <p className="text-xs text-text-muted font-['Rajdhani'] leading-relaxed mb-6">
              Build and style your full-body avatar, gear, optics, hair swatches, academic robes, and radiant holographic aura effects.
            </p>

            {/* Interactive Live Character Mini-Stage */}
            <div className="p-4 rounded-2xl bg-bg-abyss/80 border border-border-subtle/80 flex flex-col items-center justify-center relative overflow-hidden shadow-inner mb-6">
              <div className="py-2 scale-90 sm:scale-100 transform transition-transform">
                <CharacterRenderer
                  config={characterConfig}
                  seed={characterConfig.seed || user.username}
                  size={170}
                  showPedestal={true}
                  showAura={true}
                />
              </div>

              {/* Traits Breakdown Chips */}
              <div className="w-full grid grid-cols-4 gap-2 pt-3 border-t border-border-subtle/60 text-center text-xs font-['Rajdhani']">
                <div className="p-1.5 rounded-lg bg-bg-panel/70 border border-border-subtle">
                  <span className="text-[9px] text-text-muted block uppercase">Outfit</span>
                  <span className="font-bold text-text-primary capitalize truncate block text-[11px]">
                    {outfitLabel}
                  </span>
                </div>
                <div className="p-1.5 rounded-lg bg-bg-panel/70 border border-border-subtle">
                  <span className="text-[9px] text-text-muted block uppercase">Skin</span>
                  <span className="font-bold text-text-primary capitalize truncate block text-[11px]">
                    {skinLabel}
                  </span>
                </div>
                <div className="p-1.5 rounded-lg bg-bg-panel/70 border border-border-subtle">
                  <span className="text-[9px] text-text-muted block uppercase">Hair</span>
                  <span className="font-bold text-text-primary capitalize truncate block text-[11px]">
                    {hairLabel}
                  </span>
                </div>
                <div className="p-1.5 rounded-lg bg-bg-panel/70 border border-border-subtle">
                  <span className="text-[9px] text-text-muted block uppercase">Aura</span>
                  <span className="font-bold text-accent-text-light capitalize truncate block text-[11px]">
                    {auraLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            type="button"
            onClick={() => onNavigate("character-studio")}
            className="w-full py-3 px-4 rounded-xl bg-accent-primary hover:bg-accent-primary-light text-white text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md group/btn"
          >
            <span>Enter Character Studio</span>
            <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
          </button>
        </motion.div>

        {/* ─── Portal Card 2: Profile Studio ──────────────────────── */}
        <motion.div
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          className="system-card bg-bg-panel/90 border border-border-subtle hover:border-accent-primary/60 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden shadow-xl group transition-all"
        >
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/15 transition-all" />

          <div>
            {/* Card Badge & Title */}
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold font-['Rajdhani'] text-text-primary tracking-wide">
                    Profile Studio
                  </h3>
                  <span className="text-[10px] uppercase font-['Rajdhani'] font-bold text-emerald-400 tracking-widest block">
                    Public Dossier & Media Curating
                  </span>
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-bg-abyss/80 border border-border-subtle text-text-secondary font-mono">
                {connectedSocialsCount} Socials Linked
              </span>
            </div>

            <p className="text-xs text-text-muted font-['Rajdhani'] leading-relaxed mb-6">
              Curate your full-bleed profile banner, high-resolution circular avatar photo, academic thesis bio, and connected social media profiles.
            </p>

            {/* Interactive Live Mini-Dossier Stage */}
            <div className="rounded-2xl bg-bg-abyss/80 border border-border-subtle/80 overflow-hidden relative shadow-inner mb-6 flex flex-col">
              {/* Mini Banner Preview */}
              <div
                className="w-full h-24 bg-cover bg-center relative"
                style={{
                  backgroundImage: bannerUrl
                    ? `url(${bannerUrl})`
                    : "linear-gradient(135deg, rgba(124, 58, 237, 0.45) 0%, rgba(20, 10, 40, 0.9) 100%)",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-bg-abyss via-transparent to-black/30" />
              </div>

              {/* Mini Avatar + Name + Title */}
              <div className="px-5 pb-5 -mt-8 relative z-10 flex flex-col gap-3">
                <div className="flex items-end justify-between">
                  <div className="w-16 h-16 rounded-full border-2 border-border-subtle bg-bg-panel overflow-hidden shadow-lg flex items-center justify-center shrink-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl select-none">{classInfo?.fallbackIcon || "📖"}</span>
                    )}
                  </div>
                  <span className="text-[11px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2.5 py-1 rounded-lg bg-bg-panel border border-border-subtle text-accent-text-light">
                    {activeCosmetics.activeTitle || "Novice Scholar"}
                  </span>
                </div>

                <div>
                  <h4 className="text-base font-bold font-['Rajdhani'] text-text-primary leading-tight">
                    {user.name || user.username}
                  </h4>
                  <span className="text-xs text-text-muted font-mono">@{user.username}</span>
                </div>

                {/* Bio Snippet */}
                <p className="text-xs text-text-secondary font-['Rajdhani'] line-clamp-2 italic bg-bg-panel/50 p-2.5 rounded-xl border border-border-subtle/50">
                  {bio ? `"${bio}"` : "No thesis statement provided yet. Click to author your bio..."}
                </p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            type="button"
            onClick={() => onNavigate("profile-studio")}
            className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md group/btn"
          >
            <span>Enter Profile Studio</span>
            <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
          </button>
        </motion.div>
      </div>
    </div>
  );
}
