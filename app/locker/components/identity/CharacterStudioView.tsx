"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { CharacterRenderer } from "@/app/components/character/CharacterRenderer";
import {
  CharacterConfig,
  generateRandomCharacterConfig,
  FULL_BODY_FORMS,
  PEDESTAL_OPTIONS,
  AURA_PRESETS,
  TraitOption,
} from "@/lib/character-traits";
import { isRankSufficient } from "@/lib/shop-items";
import styles from "../../Locker.module.css";
import {
  User,
  Sparkles,
  Shield,
  Dices,
  RotateCcw,
  Save,
  ArrowLeft,
  Eye,
  Lock,
  Palette,
  Check,
  Zap,
} from "lucide-react";

type StudioCategory = "FORMS" | "PEDESTALS" | "AURAS";

const STUDIO_TABS: { key: StudioCategory; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "FORMS", label: "Hunter Forms", icon: User },
  { key: "PEDESTALS", label: "Pedestal Cores", icon: Shield },
  { key: "AURAS", label: "Energy Auras", icon: Sparkles },
];

const RARITY_BORDER_STYLES: Record<string, string> = {
  COMMON: "border-border-subtle dark:border-zinc-700/70 hover:border-accent-primary/40 dark:hover:border-zinc-500",
  RARE: "border-blue-500/40 hover:border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.12)]",
  EPIC: "border-purple-500/40 hover:border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]",
  LEGENDARY: "border-amber-500/40 hover:border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.18)]",
  MYTHIC: "border-rose-500/50 hover:border-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.22)]",
};

const RARITY_BADGE_STYLES: Record<string, string> = {
  COMMON: "border-border-subtle dark:border-zinc-700 bg-slate-900/5 dark:bg-zinc-800/80 text-text-secondary dark:text-zinc-300",
  RARE: "border-blue-500/50 bg-blue-500/15 text-blue-600 dark:text-blue-400",
  EPIC: "border-purple-500/50 bg-purple-500/15 text-purple-600 dark:text-purple-400",
  LEGENDARY: "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  MYTHIC: "border-rose-500/60 bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

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
  stats,
  onBackToHub,
  onPreviewProfile,
  onSaveCharacter,
  saving,
}: CharacterStudioViewProps) {
  const [activeTab, setActiveTab] = useState<StudioCategory>("FORMS");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [activeTab]);

  const userRank = user?.hunterRank || "RANK E";
  const userLevel = user?.level || 1;

  const isItemUnlocked = (requiredRank?: string, requiredLevel?: number) => {
    const rankOk = requiredRank ? isRankSufficient(userRank, requiredRank) : true;
    const levelOk = requiredLevel ? userLevel >= requiredLevel : true;
    return rankOk && levelOk;
  };

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

  // Resolved active labels for preview summary pills
  const activeForm = FULL_BODY_FORMS.find((f) => f.value === characterConfig.outfit) || FULL_BODY_FORMS[0];
  const activePedestal = PEDESTAL_OPTIONS.find((p) => p.value === (characterConfig.pedestal || characterConfig.pedestalKey)) || PEDESTAL_OPTIONS[0];
  const activeAura = AURA_PRESETS.find((a) => a.id === (characterConfig.aura || "none")) || AURA_PRESETS[0];

  return (
    <div className={`${styles.card} p-5 sm:p-7 relative overflow-hidden flex flex-col gap-6`}>
      {/* Specular Highlight */}
      <div className={styles.topHighlight} aria-hidden="true" />

      {/* ─── Studio Header Bar ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToHub}
            className={styles.navBtn}
            title="Return to Studio Hub"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Studio Hub</span>
          </button>

          <div>
            <h2 className="text-2xl font-bold font-['Rajdhani'] text-text-primary flex items-center gap-2.5 tracking-wide">
              <Palette className="w-5 h-5 text-accent-primary" />
              <span>Character Studio</span>
            </h2>
            <p className="text-xs text-text-muted font-['Rajdhani']">
              Visual Customization Studio: Select your unlocked Hunter model, pedestal platform, and energy aura.
            </p>
          </div>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onPreviewProfile}
            className={styles.navBtn}
            title="Preview Public Profile Modal"
          >
            <Eye className="w-3.5 h-3.5 text-accent-text-light" />
            <span>Preview Profile</span>
          </button>

          <button
            type="button"
            onClick={handleRandomize}
            className={styles.navBtn}
            title="Randomize Character Traits"
          >
            <Dices className="w-3.5 h-3.5 text-accent-text-light" />
            <span>Randomize</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={!isConfigChanged}
            className={`${styles.navBtn} disabled:opacity-40 disabled:pointer-events-none`}
            title="Reset to Saved"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={onSaveCharacter}
            disabled={saving}
            className={styles.btnPrimaryAction}
            title="Equip Configuration"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Equipping..." : "Equip Configuration"}</span>
          </button>
        </div>
      </div>

      {/* ─── Dual Column Workbench Grid ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ─── Left Column: Framed Character Showcase Stage (5 Cols) ─ */}
        <div className={`${styles.stageCard} lg:col-span-5 p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden lg:h-[540px]`}>
          {/* Top Specular Highlight */}
          <div className={styles.topHighlight} aria-hidden="true" />

          {/* Ambient Glow Behind Stage */}
          <div className="absolute inset-0 bg-gradient-to-b from-accent-primary-dim/20 via-transparent to-accent-primary-dim/10 pointer-events-none" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-accent-primary/10 rounded-full blur-3xl pointer-events-none" />

          {/* Stage Top Bar */}
          <div className="flex items-center justify-between z-10 border-b border-border-subtle dark:border-white/5 pb-3 shrink-0">
            <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-widest text-text-muted flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent-text-light" />
              <span>Live Sprite Stage</span>
            </span>
            <span className="text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-slate-900/5 dark:bg-bg-panel border border-border-subtle text-accent-text-light">
              Lv. {userLevel} • {userRank}
            </span>
          </div>

          {/* Character Stage Center */}
          <div className="relative z-10 flex flex-col items-center justify-center my-auto py-1">
            <div className="relative w-full max-w-[280px] h-[230px] flex items-center justify-center">
              <CharacterRenderer
                config={characterConfig}
                seed={characterConfig.seed || user.username}
                size={210}
                showPedestal={true}
                showAura={true}
              />
            </div>

            <div className="text-center mt-1.5">
              <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-widest px-3 py-0.5 rounded-full bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid inline-block mb-1 shadow-sm">
                {activeForm.label}
              </span>
              <h3 className="text-xl font-bold font-['Rajdhani'] text-text-primary leading-snug">
                {user.name || user.username}
              </h3>
              <span className="text-xs text-text-muted font-mono">@{user.username}</span>
            </div>
          </div>

          {/* Stage Footer: Visual Traits Chips & Integrated XP Bar */}
          <div className="relative z-10 flex flex-col gap-2.5 pt-3 border-t border-border-subtle shrink-0">
            {/* Traits Summary Pills (3 Cosmetic Categories) */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-['Rajdhani']">
              <div className="p-2 rounded-xl bg-slate-900/5 dark:bg-bg-panel/70 border border-border-subtle">
                <span className="text-[9px] text-text-muted block uppercase tracking-wider">Form</span>
                <span className="font-bold text-text-primary truncate block text-[10px]">
                  {activeForm.label.split(" ")[0]}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/5 dark:bg-bg-panel/70 border border-border-subtle">
                <span className="text-[9px] text-text-muted block uppercase tracking-wider">Pedestal</span>
                <span className="font-bold text-text-primary truncate block text-[10px]">
                  {activePedestal.label.split(" ")[0]}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/5 dark:bg-bg-panel/70 border border-border-subtle">
                <span className="text-[9px] text-text-muted block uppercase tracking-wider">Aura</span>
                <span className="font-bold text-accent-text-light truncate block text-[10px]">
                  {activeAura.label.split(" ")[0]}
                </span>
              </div>
            </div>

            {/* Integrated XP Progress */}
            <div className="p-2.5 rounded-xl bg-slate-900/[0.03] dark:bg-bg-panel/50 border border-border-subtle dark:border-white/5 flex flex-col gap-1.5">
              <div className="flex justify-between text-[11px] font-['Rajdhani'] font-bold">
                <span className="text-text-secondary">Evolution Progress</span>
                <span className="text-accent-text-light font-mono">
                  {currentXP} / {requiredXP} XP ({xpPercent}%)
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-900/10 dark:bg-bg-abyss rounded-full overflow-hidden border border-border-subtle dark:border-white/5">
                <div
                  style={{ width: `${xpPercent}%` }}
                  className="h-full bg-gradient-to-r from-accent-primary to-accent-primary-light rounded-full transition-all duration-300"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Right Column: 3-Category Cosmetic Visual Workbench (7 Cols) ─ */}
        <div className={`${styles.card} lg:col-span-7 p-5 sm:p-6 flex flex-col gap-4 lg:h-[540px] overflow-hidden relative`}>
          {/* Top Specular Highlight */}
          <div className={styles.topHighlight} aria-hidden="true" />

          {/* Deck Tab Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-border-subtle shrink-0">
            {STUDIO_TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all shrink-0 flex items-center gap-2 border cursor-pointer ${
                    isActive
                      ? "bg-accent-primary text-white border-accent-primary shadow-[0_0_14px_rgba(124,58,237,0.35)]"
                      : "bg-slate-900/5 dark:bg-bg-panel/80 text-text-secondary hover:text-text-primary border-border-subtle hover:border-accent-primary/40"
                  }`}
                >
                  <TabIcon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Scrollable Trait Selection Matrix */}
          <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar pr-1 sm:pr-2"
          >
            {/* ─── CATEGORY 1: CHARACTER FORMS ───────────────────── */}
            {activeTab === "FORMS" && (
              <motion.div
                key="forms"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-4 pb-2"
              >
              <div>
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light mb-1">
                  Full-Body Hunter Forms
                </h4>
                <p className="text-xs text-text-muted font-['Rajdhani']">
                  Unlock higher visual evolution forms through hunter rank promotions and level milestones.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {FULL_BODY_FORMS.map((form) => {
                  const unlocked = isItemUnlocked(form.requiredRank, form.requiredLevel);
                  const isSelected = characterConfig.outfit === form.value;
                  const borderStyle = RARITY_BORDER_STYLES[form.rarity || "COMMON"];
                  const badgeStyle = RARITY_BADGE_STYLES[form.rarity || "COMMON"];

                  return (
                    <button
                      key={form.id}
                      type="button"
                      disabled={!unlocked}
                      onClick={() => updateTrait("outfit", form.value)}
                      className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-3 transition-all relative overflow-hidden group shadow-sm ${borderStyle} ${
                        isSelected
                          ? "ring-2 ring-accent-primary bg-accent-primary/10 shadow-lg"
                          : "bg-slate-900/[0.02] dark:bg-bg-panel/75 hover:bg-slate-900/[0.05] dark:hover:bg-bg-panel"
                      } ${!unlocked ? "opacity-65 cursor-not-allowed grayscale-[35%]" : "cursor-pointer"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider border ${badgeStyle}`}>
                          Tier {form.tier} • {form.rarity}
                        </span>

                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-md bg-accent-primary text-white text-[10px] font-bold font-['Rajdhani'] uppercase flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Equipped</span>
                          </span>
                        )}

                        {!unlocked && (
                          <span className="px-2 py-0.5 rounded-md bg-bg-abyss text-text-muted border border-border-subtle text-[10px] font-bold font-['Rajdhani'] uppercase flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>{form.requiredRank} (Lv. {form.requiredLevel})</span>
                          </span>
                        )}
                      </div>

                      <div>
                        <h5 className="text-sm font-bold font-['Rajdhani'] text-text-primary group-hover:text-accent-text-light transition-colors">
                          {form.label}
                        </h5>
                        <p className="text-xs text-text-secondary leading-relaxed mt-1">
                          {form.description}
                        </p>
                      </div>
                    </button>
                  );
                })}

                {/* Dynamic Armory Acquisition Slot */}
                <div className="p-4 rounded-xl border border-dashed border-border-subtle bg-slate-900/[0.02] dark:bg-bg-panel/20 flex flex-col justify-center items-center text-center gap-2 min-h-[130px]">
                  <Sparkles className="w-5 h-5 text-accent-text-light opacity-50" />
                  <span className="text-xs font-bold font-['Rajdhani'] text-text-secondary">
                    Armory Form Ingestion
                  </span>
                  <p className="text-[11px] text-text-muted font-['Rajdhani'] max-w-xs">
                    New custom pixel Hunter models can be forged via PixelLab MCP and acquired in the System Store.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── CATEGORY 2: HOLOGRAPHIC PEDESTALS ───────────────── */}
          {activeTab === "PEDESTALS" && (
            <motion.div
              key="pedestals"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4 pb-2"
            >
              <div>
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light mb-1">
                  Base Platform Pedestals
                </h4>
                <p className="text-xs text-text-muted font-['Rajdhani']">
                  Holographic projection platforms displaying under your hunter avatar.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {PEDESTAL_OPTIONS.map((ped) => {
                  const unlocked = isItemUnlocked(ped.requiredRank, ped.requiredLevel);
                  const isSelected =
                    (characterConfig.pedestal || characterConfig.pedestalKey) === ped.value;
                  const borderStyle = RARITY_BORDER_STYLES[ped.rarity || "COMMON"];
                  const badgeStyle = RARITY_BADGE_STYLES[ped.rarity || "COMMON"];

                  return (
                    <button
                      key={ped.id}
                      type="button"
                      disabled={!unlocked}
                      onClick={() => {
                        updateTrait("pedestal", ped.value);
                        updateTrait("pedestalKey", ped.value);
                      }}
                      className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-3 transition-all relative overflow-hidden group shadow-sm ${borderStyle} ${
                        isSelected
                          ? "ring-2 ring-accent-primary bg-accent-primary/10 shadow-lg"
                          : "bg-slate-900/[0.02] dark:bg-bg-panel/75 hover:bg-slate-900/[0.05] dark:hover:bg-bg-panel"
                      } ${!unlocked ? "opacity-65 cursor-not-allowed grayscale-[35%]" : "cursor-pointer"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider border ${badgeStyle}`}>
                          {ped.rarity}
                        </span>

                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-md bg-accent-primary text-white text-[10px] font-bold font-['Rajdhani'] uppercase flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Active</span>
                          </span>
                        )}

                        {!unlocked && (
                          <span className="px-2 py-0.5 rounded-md bg-bg-abyss text-text-muted border border-border-subtle text-[10px] font-bold font-['Rajdhani'] uppercase flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>{ped.requiredRank}</span>
                          </span>
                        )}
                      </div>

                      <div>
                        <h5 className="text-sm font-bold font-['Rajdhani'] text-text-primary group-hover:text-accent-text-light transition-colors">
                          {ped.label}
                        </h5>
                        <p className="text-xs text-text-secondary leading-relaxed mt-1">
                          {ped.description}
                        </p>
                      </div>
                    </button>
                  );
                })}

                {/* Dynamic Armory Pedestal Acquisition Slot */}
                <div className="p-4 rounded-xl border border-dashed border-border-subtle bg-slate-900/[0.02] dark:bg-bg-panel/20 flex flex-col justify-center items-center text-center gap-2 min-h-[130px]">
                  <Shield className="w-5 h-5 text-accent-text-light opacity-50" />
                  <span className="text-xs font-bold font-['Rajdhani'] text-text-secondary">
                    Platform Telemetry
                  </span>
                  <p className="text-[11px] text-text-muted font-['Rajdhani'] max-w-xs">
                    Higher-tier holographic platform cores unlock in the System Armory.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── CATEGORY 3: ENERGY AURAS ────────────────────────── */}
          {activeTab === "AURAS" && (
            <motion.div
              key="auras"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4 pb-2"
            >
              <div>
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light mb-1">
                  Radiant Particle Auras
                </h4>
                <p className="text-xs text-text-muted font-['Rajdhani']">
                  Holographic ambient energy surges expressing your hunter's inner mana potency.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {AURA_PRESETS.map((aura) => {
                  const unlocked = isItemUnlocked(aura.requiredRank, aura.requiredLevel);
                  const isSelected = (characterConfig.aura || "none") === aura.id;
                  const borderStyle = RARITY_BORDER_STYLES[aura.rarity];
                  const badgeStyle = RARITY_BADGE_STYLES[aura.rarity];

                  return (
                    <button
                      key={aura.id}
                      type="button"
                      disabled={!unlocked}
                      onClick={() => updateTrait("aura", aura.id)}
                      className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-3 transition-all relative overflow-hidden group shadow-sm ${borderStyle} ${
                        isSelected
                          ? "ring-2 ring-accent-primary bg-accent-primary/10 shadow-lg"
                          : "bg-slate-900/[0.02] dark:bg-bg-panel/75 hover:bg-slate-900/[0.05] dark:hover:bg-bg-panel"
                      } ${!unlocked ? "opacity-65 cursor-not-allowed grayscale-[35%]" : "cursor-pointer"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/20 dark:border-white/20 shrink-0"
                            style={{ backgroundColor: aura.color }}
                          />
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider border ${badgeStyle}`}>
                            {aura.rarity}
                          </span>
                        </div>

                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-md bg-accent-primary text-white text-[10px] font-bold font-['Rajdhani'] uppercase flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Active</span>
                          </span>
                        )}

                        {!unlocked && (
                          <span className="px-2 py-0.5 rounded-md bg-bg-abyss text-text-muted border border-border-subtle text-[10px] font-bold font-['Rajdhani'] uppercase flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>{aura.requiredRank}</span>
                          </span>
                        )}
                      </div>

                      <div>
                        <h5 className="text-sm font-bold font-['Rajdhani'] text-text-primary group-hover:text-accent-text-light transition-colors">
                          {aura.label}
                        </h5>
                        <span className="text-[10px] font-mono text-text-muted uppercase">
                          Req: {aura.requiredRank} (Lv. {aura.requiredLevel})
                        </span>
                      </div>
                    </button>
                  );
                })}

                {/* Dynamic Armory Aura Acquisition Slot */}
                <div className="p-4 rounded-xl border border-dashed border-border-subtle bg-slate-900/[0.02] dark:bg-bg-panel/20 flex flex-col justify-center items-center text-center gap-2 min-h-[130px]">
                  <Zap className="w-5 h-5 text-accent-text-light opacity-50" />
                  <span className="text-xs font-bold font-['Rajdhani'] text-text-secondary">
                    Resonance Auras
                  </span>
                  <p className="text-[11px] text-text-muted font-['Rajdhani'] max-w-xs">
                    Rank-based energy aura surges unlock in the System Store.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
