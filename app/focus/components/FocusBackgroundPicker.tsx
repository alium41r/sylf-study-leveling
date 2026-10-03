// ============================================================================
// Focus Background User-Facing Picker (Phase 2 & Phase 5B / Phase 6 Polish)
// ============================================================================
// Glassmorphic atmosphere selector with category tabs, personal custom
// backgrounds library tab, live thumbnail previews, instant application,
// full ARIA tab pattern, modal focus containment/trapping, focus restoration,
// decoding hints, and consistent terminology.
// ============================================================================
"use client";

import React, { useState, useEffect, useRef, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  X,
  Check,
  Sparkles,
  Loader2,
  AlertCircle,
  Compass,
  ArrowUpRight,
  User,
} from "lucide-react";
import {
  FocusBackgroundCatalog,
  FocusBackgroundCategoryClient,
  FocusBackgroundClient,
  CANONICAL_CLASSIC_SLUG,
} from "@/lib/focus-background-client";
import {
  FocusBackgroundSource,
  UserFocusBackgroundClient,
  resolveEffectiveTimerPosition,
} from "@/lib/focus-background-types";
import { useAuth } from "@/app/components/AuthProvider";

export const MY_BACKGROUNDS_SLUG = "my-backgrounds";

interface FocusBackgroundPickerProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: FocusBackgroundCatalog;
  activeCategory: FocusBackgroundCategoryClient;
  activeBackground: FocusBackgroundClient | null;
  isClassic: boolean;
  isPreloadingImage: boolean;
  loadError: string | null;
  onSelectBackground: (
    categorySlug: string,
    bg: FocusBackgroundClient | null
  ) => Promise<boolean>;
  userCustomBackgrounds?: UserFocusBackgroundClient[];
  activeSource?: FocusBackgroundSource;
  activeCustomBackground?: UserFocusBackgroundClient | null;
  onSelectCustomBackground?: (bg: UserFocusBackgroundClient) => Promise<boolean>;
}

export const FocusBackgroundPicker = memo(function FocusBackgroundPicker({
  isOpen,
  onClose,
  catalog,
  activeCategory,
  activeBackground,
  isClassic,
  isPreloadingImage,
  loadError,
  onSelectBackground,
  userCustomBackgrounds = [],
  activeSource = "classic",
  activeCustomBackground = null,
  onSelectCustomBackground,
}: FocusBackgroundPickerProps) {
  // Check auth state
  let authUser: any = null;
  try {
    const auth = useAuth();
    authUser = auth?.user ?? null;
  } catch {
    authUser = null;
  }

  // Category tabs state
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>(
    activeSource === "custom"
      ? MY_BACKGROUNDS_SLUG
      : activeCategory?.slug || CANONICAL_CLASSIC_SLUG
  );
  const [selectingBgId, setSelectingBgId] = useState<number | null>(null);

  // Focus trap & focus restoration refs
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  // Sync selected tab with active state when opened
  useEffect(() => {
    if (isOpen) {
      if (activeSource === "custom") {
        setSelectedCategorySlug(MY_BACKGROUNDS_SLUG);
      } else {
        setSelectedCategorySlug(activeCategory?.slug || CANONICAL_CLASSIC_SLUG);
      }
    }
  }, [isOpen, activeCategory, activeSource]);

  // Modal Focus Trap, Background Scroll Lock & Focus Restoration
  useEffect(() => {
    if (!isOpen) return;

    // 1. Capture currently focused element before dialog opens
    lastActiveElementRef.current = document.activeElement as HTMLElement;

    // 2. Prevent background scrolling while modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // 3. Move initial focus into dialog
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const activeTabEl = dialogRef.current.querySelector<HTMLElement>(
          '[role="tab"][aria-selected="true"]'
        );
        if (activeTabEl) {
          activeTabEl.focus();
        } else {
          const firstFocusable = dialogRef.current.querySelector<HTMLElement>(
            'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          firstFocusable?.focus();
        }
      }
    }, 40);

    // 4. Handle Escape and Tab key trapping
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        if (!dialogRef.current) return;
        const focusableElements = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null); // only visible elements

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);

      // Restore focus to opener element upon unmount / close
      if (
        lastActiveElementRef.current &&
        typeof lastActiveElementRef.current.focus === "function"
      ) {
        lastActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  const isMyBackgroundsTab = selectedCategorySlug === MY_BACKGROUNDS_SLUG;

  // List of all active tab slugs for ARIA arrow-key keyboard navigation
  const allTabSlugs = useMemo(() => {
    const slugs = catalog.categories.map((c) => c.slug);
    if (authUser || userCustomBackgrounds.length > 0) {
      slugs.push(MY_BACKGROUNDS_SLUG);
    }
    return slugs;
  }, [catalog.categories, authUser, userCustomBackgrounds.length]);

  // Roving tabindex arrow-key handler for ARIA tablist
  const handleTabKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    slug: string
  ) => {
    const currentIndex = allTabSlugs.indexOf(slug);
    if (currentIndex === -1) return;

    let nextIndex = -1;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % allTabSlugs.length;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + allTabSlugs.length) % allTabSlugs.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      nextIndex = allTabSlugs.length - 1;
    }

    if (nextIndex !== -1) {
      const nextSlug = allTabSlugs[nextIndex];
      setSelectedCategorySlug(nextSlug);
      // Focus the target tab button
      const targetTab = dialogRef.current?.querySelector<HTMLElement>(
        `#tab-${nextSlug}`
      );
      targetTab?.focus();
    }
  };

  // Locate the currently viewed official category
  const currentCategory =
    catalog.categories.find((c) => c.slug === selectedCategorySlug) ||
    catalog.categories[0] || {
      id: 0,
      slug: CANONICAL_CLASSIC_SLUG,
      name: "Classic Sylf",
      layoutKey: "classic",
      sortOrder: 0,
      isActive: true,
      backgrounds: [],
    };

  const isCurrentCategoryClassic = currentCategory.slug === CANONICAL_CLASSIC_SLUG;

  const handleCardClick = async (bg: FocusBackgroundClient | null) => {
    setSelectingBgId(bg ? bg.id : 0);
    try {
      await onSelectBackground(currentCategory.slug, bg);
    } finally {
      setSelectingBgId(null);
    }
  };

  const handleCustomCardClick = async (bg: UserFocusBackgroundClient) => {
    if (!onSelectCustomBackground) return;
    setSelectingBgId(bg.id);
    try {
      await onSelectCustomBackground(bg);
    } finally {
      setSelectingBgId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="focus-bg-picker-title"
        >
          {/* Backdrop (Click to dismiss) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Dialog Container with Ref for Focus Trap */}
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 14 }}
            transition={{ type: "spring", damping: 30, stiffness: 380 }}
            className="relative z-10 w-full max-w-4xl max-h-[90vh] sm:max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#0c0e14]/95 text-text-primary shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl border border-accent-primary/40 bg-accent-primary/10 flex items-center justify-center text-accent-light shadow-sm">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    id="focus-bg-picker-title"
                    className="text-lg sm:text-xl font-bold tracking-wider text-text-primary uppercase leading-tight"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                  >
                    Focus Environment
                  </h2>
                  <p className="text-xs text-text-muted">
                    Choose an atmosphere for your study session • Press{" "}
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-text-secondary">
                      Esc
                    </kbd>{" "}
                    to return
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close background picker"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Message Toast */}
            {loadError && (
              <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 flex items-center gap-2 text-xs font-['Rajdhani'] font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loadError}</span>
              </div>
            )}

            {/* Category Pill Tabs with ARIA Tablist Pattern */}
            <div
              role="tablist"
              aria-label="Focus environment categories"
              className="px-6 py-3 border-b border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar"
            >
              {/* Official Catalog Tabs */}
              {catalog.categories.map((cat) => {
                const isSelectedTab = !isMyBackgroundsTab && cat.slug === selectedCategorySlug;
                const isCurrentCategoryActive =
                  (isClassic && cat.slug === CANONICAL_CLASSIC_SLUG) ||
                  (activeSource === "official" && activeCategory?.slug === cat.slug);

                return (
                  <button
                    key={cat.id || cat.slug}
                    id={`tab-${cat.slug}`}
                    role="tab"
                    aria-selected={isSelectedTab}
                    aria-controls={`panel-${cat.slug}`}
                    tabIndex={isSelectedTab ? 0 : -1}
                    onKeyDown={(e) => handleTabKeyDown(e, cat.slug)}
                    onClick={() => setSelectedCategorySlug(cat.slug)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-['Rajdhani'] font-bold uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                      isSelectedTab
                        ? "bg-accent-primary text-white shadow-md shadow-accent-primary/20 scale-[1.02]"
                        : "bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary border border-white/5"
                    }`}
                  >
                    <span>{cat.name}</span>
                    {cat.slug !== CANONICAL_CLASSIC_SLUG && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          isSelectedTab ? "bg-black/30 text-white" : "bg-white/10 text-text-muted"
                        }`}
                      >
                        {cat.backgrounds.length}
                      </span>
                    )}
                    {isCurrentCategoryActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                    )}
                  </button>
                );
              })}

              {/* Personal Library Tab (Phase 5B) */}
              {(authUser || userCustomBackgrounds.length > 0) && (
                <button
                  id={`tab-${MY_BACKGROUNDS_SLUG}`}
                  role="tab"
                  aria-selected={isMyBackgroundsTab}
                  aria-controls={`panel-${MY_BACKGROUNDS_SLUG}`}
                  tabIndex={isMyBackgroundsTab ? 0 : -1}
                  onKeyDown={(e) => handleTabKeyDown(e, MY_BACKGROUNDS_SLUG)}
                  onClick={() => setSelectedCategorySlug(MY_BACKGROUNDS_SLUG)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-['Rajdhani'] font-bold uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                    isMyBackgroundsTab
                      ? "bg-accent-primary text-white shadow-md shadow-accent-primary/20 scale-[1.02]"
                      : "bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary border border-white/5"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>My Backgrounds</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isMyBackgroundsTab ? "bg-black/30 text-white" : "bg-white/10 text-text-muted"
                    }`}
                  >
                    {userCustomBackgrounds.length}
                  </span>
                  {activeSource === "custom" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                  )}
                </button>
              )}
            </div>

            {/* Body / Backgrounds Grid with ARIA Tabpanel */}
            <div
              role="tabpanel"
              id={`panel-${selectedCategorySlug}`}
              aria-labelledby={`tab-${selectedCategorySlug}`}
              tabIndex={0}
              className="flex-1 overflow-y-auto p-6 focus:outline-none overscroll-contain touch-pan-y"
            >
              {isMyBackgroundsTab ? (
                /* ─── Personal Custom Backgrounds Tab ────────────────────────── */
                userCustomBackgrounds.length === 0 ? (
                  <div className="py-16 text-center text-text-muted max-w-md mx-auto">
                    <div className="w-12 h-12 rounded-2xl bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center mx-auto mb-3 text-accent-light">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h3
                      className="text-base font-bold text-text-primary uppercase tracking-wider mb-1"
                      style={{ fontFamily: "'Rajdhani', sans-serif" }}
                    >
                      No Personal Backgrounds
                    </h3>
                    <p className="text-xs text-text-muted mb-5 leading-relaxed">
                      Upload and frame your personal study environments in Settings to use them as
                      custom Focus Timer backdrops.
                    </p>
                    <Link
                      href="/settings/focus-backgrounds"
                      onClick={onClose}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-primary hover:bg-accent-primary/80 text-white text-xs font-bold font-['Rajdhani'] uppercase tracking-wider transition-all shadow-md shadow-accent-primary/20"
                    >
                      <span>Manage Environments</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs text-text-muted">
                        Personal environments from your private library
                      </p>
                      <Link
                        href="/settings/focus-backgrounds"
                        onClick={onClose}
                        className="text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-accent-light hover:text-white flex items-center gap-1 transition-colors"
                      >
                        <span>Manage Environments</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {userCustomBackgrounds.map((bg) => {
                        const isSelected =
                          activeSource === "custom" && activeCustomBackground?.id === bg.id;
                        const isProcessing =
                          selectingBgId === bg.id || (isSelected && isPreloadingImage);
                        const focalX = typeof bg.focalX === "number" ? bg.focalX : 0.5;
                        const focalY = typeof bg.focalY === "number" ? bg.focalY : 0.5;
                        const effective = resolveEffectiveTimerPosition(bg.timerPosition, bg.focalX);

                        return (
                          <div
                            key={bg.id}
                            onClick={() => handleCustomCardClick(bg)}
                            className={`group relative rounded-2xl p-2.5 border transition-all duration-200 cursor-pointer select-none ${
                              isSelected
                                ? "border-accent-primary bg-accent-primary/10 ring-2 ring-accent-primary/50 shadow-xl shadow-accent-primary/15 scale-[1.01]"
                                : "border-white/10 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.06] hover:scale-[1.01]"
                            }`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleCustomCardClick(bg);
                              }
                            }}
                            aria-selected={isSelected}
                          >
                            {/* 16:9 Thumbnail Preview */}
                            <div className="aspect-video rounded-xl relative overflow-hidden bg-bg-abyss border border-white/10">
                              {bg.signedUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={bg.signedUrl}
                                  alt={bg.name}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                  style={{
                                    objectPosition: `${focalX * 100}% ${focalY * 100}%`,
                                  }}
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-text-muted text-xs">
                                  No Preview
                                </div>
                              )}

                              {/* Dimension Tag */}
                              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[9px] font-mono text-white/90 border border-white/10">
                                {bg.width >= 3840 ? "4K" : `${bg.width}×${bg.height}`}
                              </div>

                              {/* Docking Position Tag */}
                              <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[9px] font-mono uppercase text-white/90 border border-white/10">
                                Dock: {effective}
                              </div>

                              {/* Selected Checkmark or Spinner */}
                              {isProcessing ? (
                                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 backdrop-blur-md text-accent-light flex items-center justify-center border border-accent-primary/50 shadow-md">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                </div>
                              ) : isSelected ? (
                                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent-primary text-white flex items-center justify-center shadow-md">
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                </div>
                              ) : null}
                            </div>

                            {/* Title & Status */}
                            <div className="flex items-center justify-between mt-2.5 px-1 pb-1">
                              <h4
                                className="font-bold text-sm tracking-wide text-text-primary truncate"
                                style={{ fontFamily: "'Rajdhani', sans-serif" }}
                              >
                                {bg.name}
                              </h4>

                              {isSelected && (
                                <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-emerald-400 shrink-0 ml-2">
                                  Applied
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              ) : isCurrentCategoryClassic ? (
                /* ─── Classic Sylf Option ────────────────────────────────── */
                <div className="max-w-md mx-auto py-6">
                  <div
                    onClick={() => handleCardClick(null)}
                    className={`group relative rounded-2xl p-4 border transition-all duration-200 cursor-pointer select-none ${
                      isClassic
                        ? "border-accent-primary bg-accent-primary/10 ring-2 ring-accent-primary/50 shadow-xl shadow-accent-primary/15 scale-[1.01]"
                        : "border-white/10 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.06] hover:scale-[1.01]"
                    }`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleCardClick(null);
                      }
                    }}
                    aria-selected={isClassic}
                  >
                    {/* Visual Preview Box */}
                    <div className="aspect-video rounded-xl relative overflow-hidden bg-bg-void border border-white/10 mb-3 flex items-center justify-center">
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            "radial-gradient(ellipse at center, var(--accent-primary-dim) 0%, var(--bg-void) 75%)",
                        }}
                      />
                      <span
                        className="text-3xl font-mono font-bold text-text-muted/40 group-hover:text-text-primary/60 transition-colors"
                        style={{ fontFamily: "'Rajdhani', sans-serif" }}
                      >
                        25:00
                      </span>

                      {/* Selected Badge */}
                      {isClassic && (
                        <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-accent-primary text-white flex items-center justify-center shadow-md">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h3
                          className="font-bold text-sm tracking-wide text-text-primary"
                          style={{ fontFamily: "'Rajdhani', sans-serif" }}
                        >
                          Classic Sylf
                        </h3>
                        <p className="text-xs text-text-muted mt-0.5">
                          Sylf&apos;s original distraction-free ambient gradient
                        </p>
                      </div>

                      {isClassic && (
                        <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : currentCategory.backgrounds.length === 0 ? (
                /* Empty category state */
                <div className="py-16 text-center text-text-muted">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-['Rajdhani'] font-semibold">
                    No atmospheres released in {currentCategory.name} yet.
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    New official wallpapers are added directly via Background Studio.
                  </p>
                </div>
              ) : (
                /* ─── Image Backgrounds Grid ────────────────────────────── */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {currentCategory.backgrounds.map((bg) => {
                    const isSelected =
                      activeSource === "official" && activeBackground?.id === bg.id;
                    const isProcessing =
                      selectingBgId === bg.id || (isSelected && isPreloadingImage);

                    return (
                      <div
                        key={bg.id}
                        onClick={() => handleCardClick(bg)}
                        className={`group relative rounded-2xl p-2.5 border transition-all duration-200 cursor-pointer select-none ${
                          isSelected
                            ? "border-accent-primary bg-accent-primary/10 ring-2 ring-accent-primary/50 shadow-xl shadow-accent-primary/15 scale-[1.01]"
                            : "border-white/10 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.06] hover:scale-[1.01]"
                        }`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleCardClick(bg);
                          }
                        }}
                        aria-selected={isSelected}
                      >
                        {/* 16:9 Thumbnail Image */}
                        <div className="aspect-video rounded-xl relative overflow-hidden bg-bg-abyss border border-white/10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={bg.publicUrl}
                            alt={bg.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            style={{
                              objectPosition: `${bg.focalX * 100}% ${bg.focalY * 100}%`,
                            }}
                            loading="lazy"
                            decoding="async"
                          />

                          {/* Resolution Pill Tag */}
                          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[9px] font-mono text-white/90 border border-white/10">
                            {bg.width >= 3840 ? "4K" : `${bg.width}×${bg.height}`}
                          </div>

                          {/* Selected Checkmark Badge or Loading Spinner */}
                          {isProcessing ? (
                            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 backdrop-blur-md text-accent-light flex items-center justify-center border border-accent-primary/50 shadow-md">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            </div>
                          ) : isSelected ? (
                            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent-primary text-white flex items-center justify-center shadow-md">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          ) : null}
                        </div>

                        {/* Title & Status */}
                        <div className="flex items-center justify-between mt-2.5 px-1 pb-1">
                          <h4
                            className="font-bold text-sm tracking-wide text-text-primary truncate"
                            style={{ fontFamily: "'Rajdhani', sans-serif" }}
                          >
                            {bg.name}
                          </h4>

                          {isSelected && (
                            <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-emerald-400 shrink-0 ml-2">
                              Applied
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-white/10 bg-white/[0.02]">
              <div className="text-xs text-text-muted flex items-center gap-2">
                <span>Active:</span>
                <span className="font-semibold text-text-primary font-['Rajdhani']">
                  {isClassic
                    ? "Classic Sylf"
                    : activeSource === "custom"
                    ? activeCustomBackground?.name || "Personal Wallpaper"
                    : activeBackground?.name || "Official Wallpaper"}
                </span>
              </div>

              <button
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-text-primary text-xs font-bold uppercase tracking-wider font-['Rajdhani'] transition-all hover:scale-105 active:scale-95 border border-white/10 cursor-pointer"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});

export default FocusBackgroundPicker;
