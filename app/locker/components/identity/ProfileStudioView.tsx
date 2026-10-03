"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
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
  Crop,
} from "lucide-react";
import { ImageCropModal } from "./ImageCropModal";
import styles from "../../Locker.module.css";

interface ConnectedAccountsMap {
  github?: string | null;
  discord?: string | null;
  instagram?: string | null;
}

interface ProfileStudioViewProps {
  user: any;
  bannerUrl: string;
  setBannerUrl: React.Dispatch<React.SetStateAction<string>>;
  avatarUrl: string;
  setAvatarUrl: React.Dispatch<React.SetStateAction<string>>;
  bio: string;
  setBio: React.Dispatch<React.SetStateAction<string>>;
  connectedAccounts?: ConnectedAccountsMap;
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
  connectedAccounts,
  activeCosmetics,
  onBackToHub,
  onPreviewProfile,
  onSaveProfile,
  saving,
}: ProfileStudioViewProps) {
  const [pfpMode, setPfpMode] = useState<"UPLOAD" | "URL">("UPLOAD");
  const [bannerMode, setBannerMode] = useState<"UPLOAD" | "URL">("UPLOAD");

  const [cropModal, setCropModal] = useState<{
    isOpen: boolean;
    imageSrc: string;
    cropType: "avatar" | "banner";
    title: string;
  }>({
    isOpen: false,
    imageSrc: "",
    cropType: "avatar",
    title: "",
  });

  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null);

  const classInfo = getClassInfo(activeCosmetics.activeAvatar || user.activeAvatar || "class_scholar");

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const rawData = ev.target?.result as string;
        if (rawData) {
          setCropModal({
            isOpen: true,
            imageSrc: rawData,
            cropType: "avatar",
            title: "Adjust Profile Picture Framing & Position",
          });
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const handleBannerFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const rawData = ev.target?.result as string;
        if (rawData) {
          setCropModal({
            isOpen: true,
            imageSrc: rawData,
            cropType: "banner",
            title: "Adjust Profile Banner Framing & Position",
          });
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const hasBannerChanged = bannerUrl !== (user.bannerUrl || "");
  const hasAvatarChanged = avatarUrl !== (user.avatarUrl || "");
  const hasBioChanged = bio !== (user.bio || "");
  const isProfileChanged = hasBannerChanged || hasAvatarChanged || hasBioChanged;

  const handleResetProfile = () => {
    setBannerUrl(user.bannerUrl || "");
    setAvatarUrl(user.avatarUrl || "");
    setBio(user.bio || "");
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* ─── Studio Header ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToHub}
            className={styles.navBtn}
            title="Back to Studio Hub"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Studio Hub</span>
          </button>
          <div>
            <div className={`${styles.eyebrow} mb-1`}>
              <span className={styles.eyebrowDot} />
              <span>Identity Studio Workbench</span>
            </div>
            <h1 className={styles.title}>
              Profile <em>Studio</em>
            </h1>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onPreviewProfile}
            className={styles.navBtn}
          >
            <Eye className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            <span>Preview Dossier</span>
          </button>

          {isProfileChanged && (
            <button
              type="button"
              onClick={handleResetProfile}
              className={`${styles.navBtn} text-rose-400 hover:text-rose-300 hover:border-rose-500/40`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}

          <button
            type="button"
            onClick={onSaveProfile}
            disabled={saving || !isProfileChanged}
            className={styles.btnEmeraldAction}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Saving..." : "Save Profile"}</span>
          </button>
        </div>
      </div>

      {/* ─── Main Workbench Grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ─── Left Column: Live Profile Card Preview (5 Cols) ────── */}
        <div className={`${styles.card} lg:col-span-5 relative lg:sticky lg:top-6 overflow-hidden`}>
          {/* Top Specular Highlight */}
          <div className={styles.topHighlightEmerald} aria-hidden="true" />
          {/* Card Header Label */}
          <div className="px-4 py-3 border-b border-border-subtle bg-slate-900/[0.03] dark:bg-bg-panel/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary">
                Live Profile Preview
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-bold">
              Interactive
            </span>
          </div>

          {/* Banner Container */}
          <div
            className="w-full h-32 sm:h-36 bg-cover bg-center relative transition-all duration-300"
            style={{
              backgroundImage: bannerUrl
                ? `url(${bannerUrl})`
                : "linear-gradient(135deg, rgba(5, 150, 105, 0.4) 0%, rgba(10, 30, 20, 0.9) 100%)",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-bg-panel dark:from-bg-abyss via-transparent to-black/30" />
          </div>

          {/* Profile Core Block */}
          <div className="px-5 pb-5 -mt-10 relative z-10 flex flex-col gap-4">
            {/* Avatar Row */}
            <div className="flex items-end justify-between">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-2 border-emerald-500/60 bg-bg-panel overflow-hidden shadow-xl flex items-center justify-center">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={user.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl select-none font-bold font-['Rajdhani'] text-emerald-500 dark:text-emerald-400">
                      {(user.name || user.username || "S").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider px-3 py-1 rounded-xl bg-bg-panel border border-border-subtle text-emerald-600 dark:text-emerald-400 shadow-sm">
                {activeCosmetics.activeTitle || "Novice Scholar"}
              </span>
            </div>

            {/* Scholar Identity Names */}
            <div>
              <h3 className="text-lg font-bold font-['Rajdhani'] text-text-primary leading-tight">
                {user.name || user.username}
              </h3>
              <span className="text-xs text-text-muted font-mono">@{user.username}</span>
            </div>

            {/* Bio Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/[0.03] dark:bg-bg-panel/60 border border-border-subtle">
              <span className="text-[10px] font-bold font-['Rajdhani'] text-text-muted uppercase tracking-wider block mb-1">
                Scholar Thesis
              </span>
              <p className="text-xs text-text-secondary font-['Rajdhani'] leading-relaxed italic">
                {bio ? `"${bio}"` : "No thesis statement entered yet."}
              </p>
            </div>
          </div>

          {/* Connected Socials Preview Chips */}
          <div className="p-4 border-t border-border-subtle bg-slate-900/[0.02] dark:bg-bg-panel/30">
            <div className="flex flex-wrap gap-2">
              {connectedAccounts?.github && (
                <span className="px-2.5 py-1 rounded-lg bg-bg-panel border border-border-subtle text-[10px] font-['Rajdhani'] font-bold text-text-primary flex items-center gap-1.5 shadow-sm">
                  <svg className="w-3 h-3 fill-current text-text-primary" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.304 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  <span>GitHub</span>
                </span>
              )}
              {connectedAccounts?.discord && (
                <span className="px-2.5 py-1 rounded-lg bg-bg-panel border border-border-subtle text-[10px] font-['Rajdhani'] font-bold text-text-primary flex items-center gap-1.5 shadow-sm">
                  <svg className="w-3 h-3 fill-[#5865F2]" viewBox="0 0 24 24">
                    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  <span>Discord</span>
                </span>
              )}
              {connectedAccounts?.instagram && (
                <span className="px-2.5 py-1 rounded-lg bg-bg-panel border border-border-subtle text-[10px] font-['Rajdhani'] font-bold text-text-primary flex items-center gap-1.5 shadow-sm">
                  <svg className="w-3 h-3 fill-[#E4405F]" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                  <span>Instagram</span>
                </span>
              )}
              {!connectedAccounts?.github && !connectedAccounts?.discord && !connectedAccounts?.instagram && (
                <span className="text-[10px] text-text-muted font-['Rajdhani'] italic">
                  No social accounts connected.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ─── Right Column: Framed Profile Customizer (7 Cols) ──── */}
        <div className={`${styles.card} lg:col-span-7 p-5 sm:p-6 flex flex-col gap-5 relative overflow-hidden`}>
          {/* Top Specular Highlight */}
          <div className={styles.topHighlightEmerald} aria-hidden="true" />
          {/* 1. Custom Profile Picture (PFP) */}
          <div className="p-4 rounded-xl bg-slate-900/[0.03] dark:bg-bg-panel/50 border border-border-subtle flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  Custom Profile Picture (PFP)
                </h4>
                <p className="text-xs text-text-muted font-['Rajdhani']">
                  Upload an avatar file or provide a direct HTTPS image URL.
                </p>
              </div>

              {/* Mode Selector */}
              <div className="flex items-center gap-1 bg-slate-900/5 dark:bg-bg-abyss p-1 rounded-xl border border-border-subtle">
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
              onChange={handleAvatarFileSelect}
            />

            {/* Mode Controls */}
            {pfpMode === "UPLOAD" ? (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => avatarFileInputRef.current?.click()}
                  className="py-2 px-4 rounded-xl bg-white dark:bg-bg-abyss hover:bg-slate-900/5 dark:hover:bg-bg-panel border border-border-subtle hover:border-emerald-500/50 text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                  <span>{avatarUrl ? "Choose New Avatar File" : "Upload PFP from Device"}</span>
                </button>

                {avatarUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setCropModal({
                          isOpen: true,
                          imageSrc: avatarUrl,
                          cropType: "avatar",
                          title: "Adjust Profile Picture Framing & Position",
                        })
                      }
                      className="py-2 px-3.5 rounded-xl bg-white dark:bg-bg-abyss hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20 border border-border-subtle hover:border-emerald-500/40 text-xs font-['Rajdhani'] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      title="Adjust position, zoom, and framing"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span>Adjust Position</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAvatarUrl("")}
                      className="p-2 rounded-xl bg-white dark:bg-bg-abyss hover:bg-rose-500/10 dark:hover:bg-rose-500/20 border border-border-subtle hover:border-rose-500/40 text-text-muted hover:text-rose-500 dark:hover:text-rose-400 transition-all cursor-pointer"
                      title="Remove custom PFP"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="flex-1 min-w-[200px] rounded-xl px-3.5 py-2 bg-white dark:bg-bg-abyss border border-border-subtle text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                />
                {avatarUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setCropModal({
                          isOpen: true,
                          imageSrc: avatarUrl,
                          cropType: "avatar",
                          title: "Adjust Profile Picture Framing & Position",
                        })
                      }
                      className="py-2 px-3 rounded-xl bg-white dark:bg-bg-abyss hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20 border border-border-subtle hover:border-emerald-500/40 text-xs font-['Rajdhani'] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 transition-all cursor-pointer"
                      title="Adjust position, zoom, and framing"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span>Adjust</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAvatarUrl("")}
                      className="p-2 rounded-xl bg-white dark:bg-bg-abyss hover:bg-rose-500/10 dark:hover:bg-rose-500/20 border border-border-subtle hover:border-rose-500/40 text-text-muted hover:text-rose-500 dark:hover:text-rose-400 transition-all cursor-pointer"
                      title="Clear URL"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 2. Custom Profile Banner */}
          <div className="p-4 rounded-xl bg-bg-panel/50 border border-border-subtle flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  Custom Profile Banner
                </h4>
                <p className="text-xs text-text-muted font-['Rajdhani']">
                  Upload a wide backdrop (16:9 recommended) or provide an HTTPS image URL.
                </p>
              </div>

              {/* Mode Selector */}
              <div className="flex items-center gap-1 bg-bg-abyss p-1 rounded-xl border border-border-subtle">
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

            {/* Hidden File Input */}
            <input
              ref={bannerFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleBannerFileSelect}
            />

            {/* Mode Controls */}
            {bannerMode === "UPLOAD" ? (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => bannerFileInputRef.current?.click()}
                  className="py-2 px-4 rounded-xl bg-white dark:bg-bg-abyss hover:bg-slate-900/5 dark:hover:bg-bg-panel border border-border-subtle hover:border-emerald-500/50 text-xs font-['Rajdhani'] font-bold text-text-primary flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                  <span>{bannerUrl ? "Choose New Banner File" : "Upload Banner from Device"}</span>
                </button>

                {bannerUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setCropModal({
                          isOpen: true,
                          imageSrc: bannerUrl,
                          cropType: "banner",
                          title: "Adjust Profile Banner Framing & Position",
                        })
                      }
                      className="py-2 px-3.5 rounded-xl bg-white dark:bg-bg-abyss hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20 border border-border-subtle hover:border-emerald-500/40 text-xs font-['Rajdhani'] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      title="Adjust position, show left/right side, zoom"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span>Adjust Position</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBannerUrl("")}
                      className="p-2 rounded-xl bg-white dark:bg-bg-abyss hover:bg-rose-500/10 dark:hover:bg-rose-500/20 border border-border-subtle hover:border-rose-500/40 text-text-muted hover:text-rose-500 dark:hover:text-rose-400 transition-all cursor-pointer"
                      title="Remove custom banner"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="url"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  placeholder="https://example.com/banner.jpg"
                  className="flex-1 min-w-[200px] rounded-xl px-3.5 py-2 bg-white dark:bg-bg-abyss border border-border-subtle text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                />
                {bannerUrl && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setCropModal({
                          isOpen: true,
                          imageSrc: bannerUrl,
                          cropType: "banner",
                          title: "Adjust Profile Banner Framing & Position",
                        })
                      }
                      className="py-2 px-3 rounded-xl bg-white dark:bg-bg-abyss hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20 border border-border-subtle hover:border-emerald-500/40 text-xs font-['Rajdhani'] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 transition-all cursor-pointer"
                      title="Adjust position, show left/right side, zoom"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span>Adjust</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBannerUrl("")}
                      className="p-2 rounded-xl bg-white dark:bg-bg-abyss hover:bg-rose-500/10 dark:hover:bg-rose-500/20 border border-border-subtle hover:border-rose-500/40 text-text-muted hover:text-rose-500 dark:hover:text-rose-400 transition-all cursor-pointer"
                      title="Clear URL"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 3. Scholar Thesis / Bio Statement */}
          <div className="p-4 rounded-xl bg-slate-900/[0.03] dark:bg-bg-panel/50 border border-border-subtle flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Scholar Thesis / Bio
              </h4>
              <span className="text-[10px] font-mono text-text-muted">{bio.length} / 500</span>
            </div>

            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 500))}
              placeholder="Write a brief academic thesis statement, study goals, or bio..."
              rows={3}
              className="w-full rounded-xl p-3.5 bg-white dark:bg-bg-abyss border border-border-subtle text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-emerald-500 transition-all shadow-inner leading-relaxed"
            />
          </div>

          {/* 4. Connected Social Accounts */}
          <div className="p-4 rounded-xl bg-slate-900/[0.03] dark:bg-bg-panel/50 border border-border-subtle flex flex-col gap-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  Connected Social Accounts
                </h4>
                <p className="text-[11px] text-text-muted font-['Rajdhani']">
                  Your verified handles configured in Account Settings.
                </p>
              </div>

              <Link
                href="/settings/account"
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-bg-abyss hover:bg-slate-900/5 dark:hover:bg-white/10 border border-border-subtle hover:border-emerald-500/50 text-[11px] font-['Rajdhani'] font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1.5 transition-all shadow-sm self-start sm:self-auto"
              >
                <span>Configure in Settings</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* GitHub */}
              <div className="p-3 rounded-xl bg-white dark:bg-bg-abyss border border-border-subtle flex items-center gap-3 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-slate-900/5 dark:bg-white/5 border border-border-subtle flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 fill-current text-slate-800 dark:text-white" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.304 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted block">
                    GitHub
                  </span>
                  <span className="text-xs font-['Rajdhani'] font-bold truncate block text-text-primary">
                    {connectedAccounts?.github ? `@${connectedAccounts.github}` : "Not Connected"}
                  </span>
                </div>
              </div>

              {/* Discord */}
              <div className="p-3 rounded-xl bg-white dark:bg-bg-abyss border border-border-subtle flex items-center gap-3 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 fill-[#5865F2]" viewBox="0 0 24 24">
                    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted block">
                    Discord
                  </span>
                  <span className="text-xs font-['Rajdhani'] font-bold truncate block text-text-primary">
                    {connectedAccounts?.discord ? `@${connectedAccounts.discord}` : "Not Connected"}
                  </span>
                </div>
              </div>

              {/* Instagram */}
              <div className="p-3 rounded-xl bg-white dark:bg-bg-abyss border border-border-subtle flex items-center gap-3 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 fill-[#E4405F]" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted block">
                    Instagram
                  </span>
                  <span className="text-xs font-['Rajdhani'] font-bold truncate block text-text-primary">
                    {connectedAccounts?.instagram ? `@${connectedAccounts.instagram}` : "Not Connected"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Interactive Image Framing & Crop Modal ──────────────── */}
      <ImageCropModal
        isOpen={cropModal.isOpen}
        imageSrc={cropModal.imageSrc}
        cropType={cropModal.cropType}
        title={cropModal.title}
        onClose={() => setCropModal((prev) => ({ ...prev, isOpen: false }))}
        onApply={(croppedDataUrl) => {
          if (cropModal.cropType === "avatar") {
            setAvatarUrl(croppedDataUrl);
          } else {
            setBannerUrl(croppedDataUrl);
          }
        }}
      />
    </div>
  );
}

