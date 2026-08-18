"use client";

import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import { getClassInfo } from "@/lib/cosmetics-catalog";
import {
  User,
  Globe,
  Upload,
  Link2,
  Trash2,
  Image as ImageIcon,
  ArrowLeft,
  Eye,
  Save,
  RotateCcw,
  Check,
  X,
  FileText,
  Share2,
  ExternalLink,
  Sparkles,
} from "lucide-react";

interface ProfileStudioViewProps {
  user: any;
  bannerUrl: string;
  setBannerUrl: React.Dispatch<React.SetStateAction<string>>;
  avatarUrl: string;
  setAvatarUrl: React.Dispatch<React.SetStateAction<string>>;
  bio: string;
  setBio: React.Dispatch<React.SetStateAction<string>>;
  socialLinks: Record<string, string>;
  setSocialLinks: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  activeCosmetics: any;
  onBackToHub: () => void;
  onPreviewProfile: () => void;
  onSaveProfile: () => void;
  saving: boolean;
}

export function ProfileStudioView({
  user,
  bannerUrl,
  setBannerUrl,
  avatarUrl,
  setAvatarUrl,
  bio,
  setBio,
  socialLinks,
  setSocialLinks,
  activeCosmetics,
  onBackToHub,
  onPreviewProfile,
  onSaveProfile,
  saving,
}: ProfileStudioViewProps) {
  const [pfpMode, setPfpMode] = useState<"UPLOAD" | "URL">("UPLOAD");
  const [bannerMode, setBannerMode] = useState<"UPLOAD" | "URL">("UPLOAD");

  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null);

  const classInfo = getClassInfo(activeCosmetics.activeAvatar || user.activeAvatar || "class_scholar");

  // Client-side WebP Compression & Resizing (Max 1200px for banner, 400px for avatar)
  const processImageFile = (file: File, callback: (dataUrl: string) => void, maxDim: number) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawUrl = e.target?.result as string;
      if (!rawUrl) return;

      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/webp", 0.88);
          callback(compressed);
        } else {
          callback(rawUrl);
        }
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  };

  const hasBannerChanged = bannerUrl !== (user.bannerUrl || "");
  const hasAvatarChanged = avatarUrl !== (user.avatarUrl || "");
  const hasBioChanged = bio !== (user.bio || "");
  const isProfileChanged = hasBannerChanged || hasAvatarChanged || hasBioChanged;

  const handleResetProfile = () => {
    setBannerUrl(user.bannerUrl || "");
    setAvatarUrl(user.avatarUrl || "");
    setBio(user.bio || "");
    if (user.socialLinks) {
      try {
        const parsed = typeof user.socialLinks === "string" ? JSON.parse(user.socialLinks) : user.socialLinks;
        setSocialLinks(parsed || {});
      } catch {
        setSocialLinks({});
      }
    }
  };

  return (
    <div className="system-card rounded-2xl bg-bg-panel/70 border border-white/10 shadow-2xl backdrop-blur-xl p-5 sm:p-7 relative overflow-hidden flex flex-col gap-6">
      {/* Top Accent Gradient Border */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />

      {/* ─── Studio Header Bar ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToHub}
            className="p-2.5 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-white/10 hover:border-emerald-500/60 text-text-secondary hover:text-text-primary transition-all flex items-center gap-2 text-xs font-['Rajdhani'] font-bold group shadow-sm"
            title="Return to Studio Hub"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Studio Hub</span>
          </button>

          <div>
            <h2 className="text-2xl font-bold font-['Rajdhani'] text-text-primary flex items-center gap-2 tracking-wide">
              <User className="w-5 h-5 text-emerald-400" />
              <span>Profile Studio</span>
            </h2>
            <p className="text-xs text-text-muted font-['Rajdhani']">
              Curate your public profile backdrop banner, photo avatar, bio thesis, and connected socials.
            </p>
          </div>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onPreviewProfile}
            className="px-3.5 py-2 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-white/10 hover:border-emerald-500/60 text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center gap-2 transition-all shadow-sm"
            title="Preview Public Profile Modal"
          >
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            <span>Preview Profile</span>
          </button>

          <button
            type="button"
            onClick={handleResetProfile}
            disabled={!isProfileChanged}
            className="px-3.5 py-2 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-white/10 hover:border-emerald-500/60 text-xs font-['Rajdhani'] font-bold text-text-secondary disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2 transition-all shadow-sm"
            title="Reset to Saved"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={onSaveProfile}
            disabled={saving}
            className="btn-primary px-5 py-2 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-md"
            style={{
              background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
              color: "#ffffff",
              border: "none",
            }}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Saving..." : "Save Profile"}</span>
          </button>
        </div>
      </div>

      {/* ─── Dual Column Workbench Grid ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* ─── Left Column: Framed Live Public Dossier Card (5 Cols) ─ */}
        <div className="lg:col-span-5 rounded-2xl bg-bg-abyss/80 border border-white/10 overflow-hidden shadow-inner flex flex-col justify-between min-h-[460px] relative">
          <div>
            {/* Dossier Top Bar */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-bg-panel/40">
              <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Live Dossier Preview</span>
              </span>
              <span className="text-[11px] font-mono text-text-muted">@{user.username}</span>
            </div>

            {/* Live Aspect Ratio Banner */}
            <div
              className="w-full h-32 bg-cover bg-center relative transition-all"
              style={{
                backgroundImage: bannerUrl
                  ? `url(${bannerUrl})`
                  : "linear-gradient(135deg, rgba(124, 58, 237, 0.45) 0%, rgba(20, 10, 40, 0.9) 100%)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-bg-abyss via-transparent to-black/30" />
            </div>

            {/* Profile Avatar & Metadata */}
            <div className="px-6 pb-6 -mt-10 relative z-10 flex flex-col gap-4">
              <div className="flex items-end justify-between">
                <div className="w-20 h-20 rounded-2xl border-2 border-white/20 bg-bg-panel overflow-hidden shadow-2xl flex items-center justify-center shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl select-none">{classInfo?.fallbackIcon || "📖"}</span>
                  )}
                </div>
                <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm">
                  {activeCosmetics.activeTitle || "Novice Scholar"}
                </span>
              </div>

              <div>
                <h3 className="text-xl font-bold font-['Rajdhani'] text-text-primary">
                  {user.name || user.username}
                </h3>
                <span className="text-xs text-text-muted font-mono">@{user.username}</span>
              </div>

              {/* Bio Preview */}
              <div className="p-3.5 rounded-xl bg-bg-panel/60 border border-white/10">
                <span className="text-[10px] font-bold font-['Rajdhani'] text-text-muted uppercase tracking-wider block mb-1">
                  Scholar Thesis
                </span>
                <p className="text-xs text-text-secondary font-['Rajdhani'] leading-relaxed italic">
                  {bio ? `"${bio}"` : "No thesis statement entered yet."}
                </p>
              </div>
            </div>
          </div>

          {/* Connected Socials Preview Chips */}
          <div className="p-4 border-t border-white/10 bg-bg-panel/30">
            <div className="flex flex-wrap gap-2">
              {socialLinks.github && (
                <span className="px-2.5 py-1 rounded-lg bg-bg-panel border border-white/10 text-[10px] font-['Rajdhani'] font-bold text-text-primary flex items-center gap-1.5 shadow-sm">
                  <Globe className="w-3 h-3 text-accent-text-light" />
                  <span>GitHub</span>
                </span>
              )}
              {socialLinks.discord && (
                <span className="px-2.5 py-1 rounded-lg bg-bg-panel border border-white/10 text-[10px] font-['Rajdhani'] font-bold text-text-primary flex items-center gap-1.5 shadow-sm">
                  <Globe className="w-3 h-3 text-indigo-400" />
                  <span>Discord</span>
                </span>
              )}
              {socialLinks.linkedin && (
                <span className="px-2.5 py-1 rounded-lg bg-bg-panel border border-white/10 text-[10px] font-['Rajdhani'] font-bold text-text-primary flex items-center gap-1.5 shadow-sm">
                  <Globe className="w-3 h-3 text-sky-400" />
                  <span>LinkedIn</span>
                </span>
              )}
              {socialLinks.twitter && (
                <span className="px-2.5 py-1 rounded-lg bg-bg-panel border border-white/10 text-[10px] font-['Rajdhani'] font-bold text-text-primary flex items-center gap-1.5 shadow-sm">
                  <Globe className="w-3 h-3 text-cyan-400" />
                  <span>X</span>
                </span>
              )}
              {socialLinks.website && (
                <span className="px-2.5 py-1 rounded-lg bg-bg-panel border border-white/10 text-[10px] font-['Rajdhani'] font-bold text-text-primary flex items-center gap-1.5 shadow-sm">
                  <ExternalLink className="w-3 h-3 text-emerald-400" />
                  <span>Web</span>
                </span>
              )}
              {!Object.values(socialLinks).some((v) => Boolean(v?.trim())) && (
                <span className="text-[10px] text-text-muted font-['Rajdhani'] italic">
                  No social networks linked yet.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ─── Right Column: Framed Profile Customizer (7 Cols) ──── */}
        <div className="lg:col-span-7 rounded-2xl bg-bg-abyss/60 border border-white/10 p-5 sm:p-6 flex flex-col gap-5 shadow-inner">
          {/* 1. Custom Profile Picture (PFP) */}
          <div className="p-4 rounded-xl bg-bg-panel/50 border border-white/10 flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-emerald-400">
                  Custom Profile Picture (PFP)
                </h4>
                <p className="text-xs text-text-muted font-['Rajdhani']">
                  Upload an avatar file or provide a direct HTTPS image URL.
                </p>
              </div>

              {/* Mode Selector */}
              <div className="flex items-center gap-1 bg-bg-abyss p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setPfpMode("UPLOAD")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-['Rajdhani'] font-bold flex items-center gap-1.5 transition-all ${
                    pfpMode === "UPLOAD"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPfpMode("URL")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-['Rajdhani'] font-bold flex items-center gap-1.5 transition-all ${
                    pfpMode === "URL"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Link2 className="w-3 h-3" />
                  <span>URL</span>
                </button>
              </div>
            </div>

            {/* Hidden File Input */}
            <input
              ref={avatarFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  processImageFile(file, (compressedUrl) => setAvatarUrl(compressedUrl), 400);
                }
              }}
            />

            {pfpMode === "UPLOAD" ? (
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-bg-abyss border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl select-none">{classInfo?.fallbackIcon || "📖"}</span>
                  )}
                </div>

                <div className="flex-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-white/10 hover:border-emerald-500/60 text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{avatarUrl ? "Replace Avatar Image" : "Choose Avatar Image (PNG, JPG, WebP)"}</span>
                  </button>

                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setAvatarUrl("")}
                      className="p-2.5 rounded-xl bg-bg-abyss hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 text-text-muted hover:text-rose-400 transition-all"
                      title="Remove Avatar (Revert to Class Archetype)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="flex-1 rounded-xl px-4 py-2.5 bg-bg-abyss border border-white/10 text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                />
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl("")}
                    className="p-2.5 rounded-xl bg-bg-abyss hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 text-text-muted hover:text-rose-400 transition-all"
                    title="Clear URL"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 2. Profile Showcase Banner */}
          <div className="p-4 rounded-xl bg-bg-panel/50 border border-white/10 flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-emerald-400">
                  Profile Showcase Banner
                </h4>
                <p className="text-xs text-text-muted font-['Rajdhani']">
                  Full-bleed backdrop artwork with dynamic atmospheric dimming.
                </p>
              </div>

              {/* Mode Selector */}
              <div className="flex items-center gap-1 bg-bg-abyss p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setBannerMode("UPLOAD")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-['Rajdhani'] font-bold flex items-center gap-1.5 transition-all ${
                    bannerMode === "UPLOAD"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBannerMode("URL")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-['Rajdhani'] font-bold flex items-center gap-1.5 transition-all ${
                    bannerMode === "URL"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Link2 className="w-3 h-3" />
                  <span>URL</span>
                </button>
              </div>
            </div>

            {/* Hidden Banner File Input */}
            <input
              ref={bannerFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  processImageFile(file, (compressedUrl) => setBannerUrl(compressedUrl), 1200);
                }
              }}
            />

            {bannerMode === "UPLOAD" ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => bannerFileInputRef.current?.click()}
                  className="flex-1 py-3 px-4 rounded-xl bg-bg-abyss hover:bg-bg-shadow border border-white/10 hover:border-emerald-500/60 text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <ImageIcon className="w-4 h-4 text-emerald-400" />
                  <span>{bannerUrl ? "Replace Banner Artwork" : "Upload Banner File (PNG, JPG, WebP)"}</span>
                </button>

                {bannerUrl && (
                  <button
                    type="button"
                    onClick={() => setBannerUrl("")}
                    className="p-3 rounded-xl bg-bg-abyss hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 text-text-muted hover:text-rose-400 transition-all"
                    title="Remove Banner"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  placeholder="https://example.com/banner.jpg"
                  className="flex-1 rounded-xl px-4 py-2.5 bg-bg-abyss border border-white/10 text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                />
                {bannerUrl && (
                  <button
                    type="button"
                    onClick={() => setBannerUrl("")}
                    className="p-2.5 rounded-xl bg-bg-abyss hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 text-text-muted hover:text-rose-400 transition-all"
                    title="Clear URL"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 3. Scholar Thesis / Bio */}
          <div className="p-4 rounded-xl bg-bg-panel/50 border border-white/10 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-emerald-400">
                Scholar Thesis / Bio
              </h4>
              <span className="text-[10px] font-mono text-text-muted">{bio.length} / 500</span>
            </div>

            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 500))}
              placeholder="Write a brief academic thesis statement, study goals, or bio..."
              rows={3}
              className="w-full rounded-xl p-3.5 bg-bg-abyss border border-white/10 text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-emerald-500 transition-all shadow-inner leading-relaxed"
            />
          </div>

          {/* 4. Connected Social Links */}
          <div className="p-4 rounded-xl bg-bg-panel/50 border border-white/10 flex flex-col gap-3.5">
            <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-emerald-400">
              Connected Social Links & Handles
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted block mb-1">
                  GitHub Username
                </label>
                <input
                  type="text"
                  value={socialLinks.github || ""}
                  onChange={(e) => setSocialLinks((prev) => ({ ...prev, github: e.target.value }))}
                  placeholder="e.g. torvalds"
                  className="w-full rounded-xl px-3.5 py-2 bg-bg-abyss border border-white/10 text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted block mb-1">
                  LinkedIn Handle / URL
                </label>
                <input
                  type="text"
                  value={socialLinks.linkedin || ""}
                  onChange={(e) => setSocialLinks((prev) => ({ ...prev, linkedin: e.target.value }))}
                  placeholder="e.g. satyanadella"
                  className="w-full rounded-xl px-3.5 py-2 bg-bg-abyss border border-white/10 text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted block mb-1">
                  Discord Handle
                </label>
                <input
                  type="text"
                  value={socialLinks.discord || ""}
                  onChange={(e) => setSocialLinks((prev) => ({ ...prev, discord: e.target.value }))}
                  placeholder="e.g. scholar#0001"
                  className="w-full rounded-xl px-3.5 py-2 bg-bg-abyss border border-white/10 text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted block mb-1">
                  X / Twitter Handle
                </label>
                <input
                  type="text"
                  value={socialLinks.twitter || ""}
                  onChange={(e) => setSocialLinks((prev) => ({ ...prev, twitter: e.target.value }))}
                  placeholder="e.g. scholar_ai"
                  className="w-full rounded-xl px-3.5 py-2 bg-bg-abyss border border-white/10 text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted block mb-1">
                  Personal Website / Portfolio URL
                </label>
                <input
                  type="url"
                  value={socialLinks.website || ""}
                  onChange={(e) => setSocialLinks((prev) => ({ ...prev, website: e.target.value }))}
                  placeholder="https://myscholarportfolio.dev"
                  className="w-full rounded-xl px-3.5 py-2 bg-bg-abyss border border-white/10 text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
