"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { CharacterRenderer } from "@/app/components/character/CharacterRenderer";
import {
  CharacterConfig,
  generateRandomCharacterConfig,
  SKIN_TONES,
  HAIR_STYLES,
  HAIR_COLORS,
  OUTFIT_STYLES,
  EYEWEAR_STYLES,
  ACCESSORY_STYLES,
  AURA_PRESETS,
} from "@/lib/character-traits";
import { COSMETICS_CATALOG } from "@/lib/cosmetics-catalog";
import {
  User,
  Scissors,
  Shirt,
  Glasses,
  Crown,
  Sparkles,
  Award,
  Dices,
  RotateCcw,
  Save,
  ArrowLeft,
  Eye,
  X,
  Palette,
} from "lucide-react";

type TraitCategory = "SKIN" | "HAIR" | "ATTIRE" | "EYEWEAR" | "ACCESSORIES" | "AURAS" | "CLASS";

const TRAIT_TABS: { key: TraitCategory; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "SKIN", label: "Skin & Base", icon: User },
  { key: "HAIR", label: "Hair & Cut", icon: Scissors },
  { key: "ATTIRE", label: "Outfits & Robes", icon: Shirt },
  { key: "EYEWEAR", label: "Eyewear & Optics", icon: Glasses },
  { key: "ACCESSORIES", label: "Headgear", icon: Crown },
  { key: "AURAS", label: "Auras & Pedestals", icon: Sparkles },
  { key: "CLASS", label: "Class & Titles", icon: Award },
];

interface CharacterStudioViewProps {
  user: any;
  characterConfig: CharacterConfig;
  setCharacterConfig: React.Dispatch<React.SetStateAction<CharacterConfig>>;
  savedConfig: CharacterConfig;
  activeCosmetics: any;
  setActiveCosmetics: React.Dispatch<React.SetStateAction<any>>;
  stats: any;
  onBackToHub: () => void;
  onPreviewProfile: () => void;
  onSaveCharacter: () => void;
  saving: boolean;
}

export function CharacterStudioView({
  user,
  characterConfig,
  setCharacterConfig,
  savedConfig,
  activeCosmetics,
  setActiveCosmetics,
  stats,
  onBackToHub,
  onPreviewProfile,
  onSaveCharacter,
  saving,
}: CharacterStudioViewProps) {
  const [activeTab, setActiveTab] = useState<TraitCategory>("SKIN");

  const updateTrait = <K extends keyof CharacterConfig>(key: K, value: CharacterConfig[K]) => {
    setCharacterConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleRandomize = () => {
    const randomized = generateRandomCharacterConfig();
    setCharacterConfig(randomized);
  };

  const handleReset = () => {
    setCharacterConfig(savedConfig);
  };

  const isConfigChanged = JSON.stringify(characterConfig) !== JSON.stringify(savedConfig);
  const currentXP = user.currentXP || 0;
  const requiredXP = stats?.nextUnlock?.requiredXP || 1000;
  const xpPercent = Math.min(100, Math.round((currentXP / requiredXP) * 100));

  const outfitLabel = OUTFIT_STYLES.find((o) => o.value === characterConfig.outfit)?.label || "Scholar";
  const skinLabel = SKIN_TONES.find((s) => s.value === characterConfig.skin)?.label.split(" ")[0] || "Fair";
  const hairColorLabel = HAIR_COLORS.find((h) => h.value === characterConfig.hairColor)?.label.split(" ")[0] || "Black";
  const auraLabel = AURA_PRESETS.find((a) => a.id === characterConfig.aura)?.label.split(" ")[0] || "None";

  return (
    <div className="system-card rounded-2xl bg-bg-panel/70 border border-white/10 shadow-2xl backdrop-blur-xl p-5 sm:p-7 relative overflow-hidden flex flex-col gap-6">
      {/* Top Accent Gradient Border */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-accent-primary/60 to-transparent" />

      {/* ─── Studio Header Bar ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToHub}
            className="p-2.5 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-white/10 hover:border-accent-primary text-text-secondary hover:text-text-primary transition-all flex items-center gap-2 text-xs font-['Rajdhani'] font-bold group shadow-sm"
            title="Return to Studio Hub"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Studio Hub</span>
          </button>

          <div>
            <h2 className="text-2xl font-bold font-['Rajdhani'] text-text-primary flex items-center gap-2 tracking-wide">
              <Palette className="w-5 h-5 text-accent-primary" />
              <span>Character Studio</span>
            </h2>
            <p className="text-xs text-text-muted font-['Rajdhani']">
              Customize your full-body sprite appearance, equipped gear, and radiant particle auras.
            </p>
          </div>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onPreviewProfile}
            className="px-3.5 py-2 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-white/10 hover:border-accent-primary text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center gap-2 transition-all shadow-sm"
            title="Preview Public Profile Modal"
          >
            <Eye className="w-3.5 h-3.5 text-accent-text-light" />
            <span>Preview Profile</span>
          </button>

          <button
            type="button"
            onClick={handleRandomize}
            className="px-3.5 py-2 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-white/10 hover:border-accent-primary text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center gap-2 transition-all shadow-sm"
            title="Randomize Character Traits"
          >
            <Dices className="w-3.5 h-3.5 text-accent-text-light" />
            <span>Randomize</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={!isConfigChanged}
            className="px-3.5 py-2 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-white/10 hover:border-accent-primary text-xs font-['Rajdhani'] font-bold text-text-secondary disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2 transition-all shadow-sm"
            title="Reset to Saved"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={onSaveCharacter}
            disabled={saving}
            className="btn-primary px-5 py-2 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-md"
            style={{
              background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
              color: "var(--text-primary)",
              border: "none",
            }}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Saving..." : "Save Character"}</span>
          </button>
        </div>
      </div>

      {/* ─── Dual Column Workbench Grid ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* ─── Left Column: Framed Character Showcase Stage (5 Cols) ─ */}
        <div className="lg:col-span-5 rounded-2xl bg-bg-abyss/80 border border-white/10 p-6 flex flex-col justify-between relative overflow-hidden shadow-inner min-h-[460px]">
          {/* Ambient Glow Behind Stage */}
          <div className="absolute inset-0 bg-gradient-to-b from-accent-primary-dim/20 via-transparent to-accent-primary-dim/10 pointer-events-none" />

          {/* Stage Top Bar */}
          <div className="flex items-center justify-between z-10 border-b border-white/5 pb-3">
            <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-widest text-text-muted flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent-text-light" />
              <span>Live Sprite Stage</span>
            </span>
            <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-full bg-bg-panel border border-white/10 text-accent-text-light">
              Level {user.level || 1}
            </span>
          </div>

          {/* Character Stage Center */}
          <div className="relative z-10 py-4 flex flex-col items-center justify-center">
            <div className="scale-100 sm:scale-105 transform transition-transform">
              <CharacterRenderer
                config={characterConfig}
                seed={characterConfig.seed || user.username}
                size={210}
                showPedestal={true}
                showAura={true}
              />
            </div>

            <div className="text-center mt-2">
              <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-widest px-3 py-1 rounded-full bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid inline-block mb-1 shadow-sm">
                {outfitLabel}
              </span>
              <h3 className="text-xl font-bold font-['Rajdhani'] text-text-primary">
                {user.name || user.username}
              </h3>
              <span className="text-xs text-text-muted font-mono">@{user.username}</span>
            </div>
          </div>

          {/* Stage Footer: Traits Chips & Integrated XP Bar */}
          <div className="relative z-10 flex flex-col gap-3 pt-4 border-t border-white/10">
            {/* Traits Summary Pills */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-['Rajdhani']">
              <div className="p-2 rounded-xl bg-bg-panel/70 border border-white/10">
                <span className="text-[9px] text-text-muted block uppercase tracking-wider">Skin</span>
                <span className="font-bold text-text-primary capitalize truncate block text-[11px]">
                  {skinLabel}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-bg-panel/70 border border-white/10">
                <span className="text-[9px] text-text-muted block uppercase tracking-wider">Hair</span>
                <span className="font-bold text-text-primary capitalize truncate block text-[11px]">
                  {hairColorLabel}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-bg-panel/70 border border-white/10">
                <span className="text-[9px] text-text-muted block uppercase tracking-wider">Aura</span>
                <span className="font-bold text-accent-text-light capitalize truncate block text-[11px]">
                  {auraLabel}
                </span>
              </div>
            </div>

            {/* Integrated XP Progress */}
            <div className="p-3 rounded-xl bg-bg-panel/50 border border-white/5 flex flex-col gap-1.5">
              <div className="flex justify-between text-[11px] font-['Rajdhani'] font-bold">
                <span className="text-text-secondary">Level Progress</span>
                <span className="text-accent-text-light font-mono">
                  {currentXP} / {requiredXP} XP ({xpPercent}%)
                </span>
              </div>
              <div className="w-full h-1.5 bg-bg-abyss rounded-full overflow-hidden border border-white/5">
                <div
                  style={{ width: `${xpPercent}%` }}
                  className="h-full bg-gradient-to-r from-accent-primary to-accent-primary-light rounded-full transition-all duration-300"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Right Column: Framed Customization Panel (7 Cols) ──── */}
        <div className="lg:col-span-7 rounded-2xl bg-bg-abyss/60 border border-white/10 p-5 sm:p-6 flex flex-col gap-5 shadow-inner min-h-[460px]">
          {/* Deck Tab Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-white/10">
            {TRAIT_TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all shrink-0 flex items-center gap-1.5 border ${
                    isActive
                      ? "bg-accent-primary text-white border-accent-primary shadow-[0_0_12px_rgba(124,58,237,0.35)]"
                      : "bg-bg-panel/80 text-text-secondary hover:text-text-primary border-white/10 hover:border-white/20"
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* ─── TAB 1: SKIN & BASE ────────────────────────────── */}
          {activeTab === "SKIN" && (
            <motion.div
              key="skin"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4"
            >
              <div>
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light mb-1">
                  Skin Complexion
                </h4>
                <p className="text-xs text-text-muted font-['Rajdhani']">
                  Select your character's foundational skin tone.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {SKIN_TONES.map((tone) => (
                  <button
                    key={tone.id}
                    type="button"
                    onClick={() => updateTrait("skin", tone.value)}
                    className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
                      characterConfig.skin === tone.value
                        ? "bg-accent-primary-dim/40 border-accent-primary shadow-[0_0_10px_rgba(124,58,237,0.25)]"
                        : "bg-bg-panel/60 border-white/10 hover:border-white/25 hover:bg-bg-panel/90"
                    }`}
                  >
                    <span
                      className="w-6 h-6 rounded-full border-2 border-black/30 shadow-inner shrink-0"
                      style={{ backgroundColor: tone.previewColor }}
                    />
                    <span className="text-xs font-bold font-['Rajdhani'] text-text-primary truncate">
                      {tone.label}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── TAB 2: HAIR & CUT ────────────────────────────── */}
          {activeTab === "HAIR" && (
            <motion.div
              key="hair"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-5"
            >
              {/* Hair Style */}
              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light">
                  Hairstyle & Cut
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {HAIR_STYLES.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => updateTrait("hairStyle", style.value)}
                      className={`p-3 rounded-xl border text-xs font-['Rajdhani'] font-bold transition-all text-left truncate ${
                        characterConfig.hairStyle === style.value
                          ? "bg-accent-primary-dim/40 border-accent-primary text-accent-text-light shadow-[0_0_10px_rgba(124,58,237,0.25)]"
                          : "bg-bg-panel/60 border-white/10 text-text-secondary hover:text-text-primary hover:border-white/25 hover:bg-bg-panel/90"
                      }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hair Color */}
              <div className="flex flex-col gap-3 pt-3 border-t border-white/10">
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light">
                  Hair Color Swatches
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {HAIR_COLORS.map((hc) => (
                    <button
                      key={hc.id}
                      type="button"
                      onClick={() => updateTrait("hairColor", hc.value)}
                      className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all ${
                        characterConfig.hairColor === hc.value
                          ? "bg-accent-primary-dim/40 border-accent-primary shadow-[0_0_10px_rgba(124,58,237,0.25)]"
                          : "bg-bg-panel/60 border-white/10 hover:border-white/25 hover:bg-bg-panel/90"
                      }`}
                    >
                      <span
                        className="w-5 h-5 rounded-full border-2 border-black/30 shrink-0 shadow-inner"
                        style={{ backgroundColor: hc.previewColor }}
                      />
                      <span className="text-xs font-bold font-['Rajdhani'] text-text-primary truncate">
                        {hc.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── TAB 3: OUTFITS & ROBES ───────────────────────── */}
          {activeTab === "ATTIRE" && (
            <motion.div
              key="attire"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4"
            >
              <div>
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light mb-1">
                  Academic & Hunter Attire
                </h4>
                <p className="text-xs text-text-muted font-['Rajdhani']">
                  Select your equipped robes, armor, tunics, or techwear suits.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
                {OUTFIT_STYLES.map((outfit) => (
                  <button
                    key={outfit.id}
                    type="button"
                    onClick={() => updateTrait("outfit", outfit.value)}
                    className={`p-3.5 rounded-xl border text-left flex items-center gap-3 transition-all ${
                      characterConfig.outfit === outfit.value
                        ? "bg-accent-primary-dim/40 border-accent-primary shadow-[0_0_10px_rgba(124,58,237,0.25)]"
                        : "bg-bg-panel/60 border-white/10 hover:border-white/25 hover:bg-bg-panel/90"
                    }`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-bg-abyss border border-white/10 flex items-center justify-center p-1 shrink-0 shadow-inner">
                      {outfit.imagePath && (
                        <img
                          src={outfit.imagePath}
                          alt={outfit.label}
                          className="w-full h-full object-contain"
                          style={{ imageRendering: "pixelated" }}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold font-['Rajdhani'] text-text-primary block truncate">
                        {outfit.label}
                      </span>
                      <span className="text-[10px] text-text-muted uppercase font-['Rajdhani'] font-bold">
                        {outfit.category}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── TAB 4: EYEWEAR & OPTICS ──────────────────────── */}
          {activeTab === "EYEWEAR" && (
            <motion.div
              key="eyewear"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4"
            >
              <div>
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light mb-1">
                  Glasses & Tactical Visors
                </h4>
                <p className="text-xs text-text-muted font-['Rajdhani']">
                  Equip scholar wireframes or cybernetic optics.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EYEWEAR_STYLES.map((gw) => (
                  <button
                    key={gw.id}
                    type="button"
                    onClick={() => updateTrait("eyewear", gw.value)}
                    className={`p-3.5 rounded-xl border text-left flex items-center gap-3 transition-all ${
                      characterConfig.eyewear === gw.value
                        ? "bg-accent-primary-dim/40 border-accent-primary shadow-[0_0_10px_rgba(124,58,237,0.25)]"
                        : "bg-bg-panel/60 border-white/10 hover:border-white/25 hover:bg-bg-panel/90"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-bg-abyss border border-white/10 flex items-center justify-center p-1 shrink-0 shadow-inner">
                      {gw.imagePath ? (
                        <img
                          src={gw.imagePath}
                          alt={gw.label}
                          className="w-full h-full object-contain"
                          style={{ imageRendering: "pixelated" }}
                        />
                      ) : (
                        <X className="w-4 h-4 text-text-muted" />
                      )}
                    </div>
                    <span className="text-xs font-bold font-['Rajdhani'] text-text-primary truncate">
                      {gw.label}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── TAB 5: HEADGEAR & ACCESSORIES ────────────────── */}
          {activeTab === "ACCESSORIES" && (
            <motion.div
              key="accessories"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4"
            >
              <div>
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light mb-1">
                  Headgear, Berets & Circlets
                </h4>
                <p className="text-xs text-text-muted font-['Rajdhani']">
                  Scholar berets, shadow cowls, and focus headbands.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ACCESSORY_STYLES.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => updateTrait("accessory", acc.value)}
                    className={`p-3.5 rounded-xl border text-left flex items-center gap-3 transition-all ${
                      (characterConfig.accessory || "none") === acc.value
                        ? "bg-accent-primary-dim/40 border-accent-primary shadow-[0_0_10px_rgba(124,58,237,0.25)]"
                        : "bg-bg-panel/60 border-white/10 hover:border-white/25 hover:bg-bg-panel/90"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-bg-abyss border border-white/10 flex items-center justify-center p-1 shrink-0 shadow-inner">
                      {acc.imagePath ? (
                        <img
                          src={acc.imagePath}
                          alt={acc.label}
                          className="w-full h-full object-contain"
                          style={{ imageRendering: "pixelated" }}
                        />
                      ) : (
                        <X className="w-4 h-4 text-text-muted" />
                      )}
                    </div>
                    <span className="text-xs font-bold font-['Rajdhani'] text-text-primary truncate">
                      {acc.label}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── TAB 6: AURAS & PEDESTALS ─────────────────────── */}
          {activeTab === "AURAS" && (
            <motion.div
              key="auras"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4"
            >
              <div>
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light mb-1">
                  Holographic Aura Particle Emitters
                </h4>
                <p className="text-xs text-text-muted font-['Rajdhani']">
                  Emit a radiant ambient energy aura around your character stage.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {AURA_PRESETS.map((aura) => (
                  <button
                    key={aura.id}
                    type="button"
                    onClick={() => {
                      updateTrait("aura", aura.id);
                      setActiveCosmetics((prev: any) => ({ ...prev, activeAura: aura.id }));
                    }}
                    className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
                      characterConfig.aura === aura.id
                        ? "bg-accent-primary-dim/40 border-accent-primary shadow-[0_0_10px_rgba(124,58,237,0.25)]"
                        : "bg-bg-panel/60 border-white/10 hover:border-white/25 hover:bg-bg-panel/90"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="w-6 h-6 rounded-full border-2 border-black/30 shrink-0 shadow-inner"
                        style={{
                          backgroundColor: aura.color !== "transparent" ? aura.color : "#334155",
                        }}
                      />
                      <span className="text-sm font-bold font-['Rajdhani'] text-text-primary">
                        {aura.label}
                      </span>
                    </div>
                    {characterConfig.aura === aura.id && (
                      <span className="text-xs text-accent-text-light font-bold font-['Rajdhani']">Equipped</span>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ─── TAB 7: CLASS & TITLES ────────────────────────── */}
          {activeTab === "CLASS" && (
            <motion.div
              key="class"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4"
            >
              {/* Class Selection */}
              <div className="flex flex-col gap-3">
                <div>
                  <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light mb-1">
                    Academic Class Archetype
                  </h4>
                  <p className="text-xs text-text-muted font-['Rajdhani']">
                    Classes govern your intellectual skill trees, quest multipliers, and study archetypes.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(COSMETICS_CATALOG.CLASS || []).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveCosmetics((prev: any) => ({ ...prev, activeAvatar: item.id }))}
                      className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                        activeCosmetics.activeAvatar === item.id
                          ? "bg-accent-primary-dim/40 border-accent-primary shadow-[0_0_10px_rgba(124,58,237,0.25)]"
                          : "bg-bg-panel/60 border-white/10 hover:border-white/25 hover:bg-bg-panel/90"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <Award className="w-4 h-4 text-accent-primary" />
                        <div>
                          <span className="text-xs font-bold font-['Rajdhani'] text-text-primary block">
                            {item.name}
                          </span>
                          <span className="text-[9px] text-text-muted font-['Rajdhani'] uppercase">
                            {item.rarity}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-text-muted font-['Rajdhani'] line-clamp-2">
                        {item.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Scholar Titles */}
              <div className="flex flex-col gap-3 pt-3 border-t border-white/10">
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light">
                  Equipped Scholar Title
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {(COSMETICS_CATALOG.TITLE || []).map((title) => (
                    <button
                      key={title.id}
                      type="button"
                      onClick={() => setActiveCosmetics((prev: any) => ({ ...prev, activeTitle: title.id }))}
                      className={`p-2.5 rounded-xl border text-xs font-['Rajdhani'] font-bold transition-all text-left truncate ${
                        activeCosmetics.activeTitle === title.id
                          ? "bg-accent-primary-dim/40 border-accent-primary text-accent-text-light shadow-[0_0_10px_rgba(124,58,237,0.25)]"
                          : "bg-bg-panel/60 border-white/10 text-text-secondary hover:text-text-primary hover:border-white/25"
                      }`}
                    >
                      {title.value}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
