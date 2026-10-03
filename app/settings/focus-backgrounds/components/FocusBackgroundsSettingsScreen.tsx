"use client";

import { useState, useEffect, useRef } from "react";
import BackToSettings from "@/app/components/BackToSettings";
import { useAuth } from "@/app/components/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Plus,
  Trash2,
  Edit3,
  AlertCircle,
  Check,
  X,
  Crosshair,
  Shield,
  Layers,
  Sparkles,
  Info,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import {
  FocusTimerPosition,
  TIMER_POSITION_REGISTRY,
  VALID_TIMER_POSITIONS,
  resolveEffectiveTimerPosition,
  FocusTimerLayoutKey,
} from "@/lib/focus-background-types";
import { FocusTimerLayoutPreview } from "@/app/focus/components/FocusTimerLayoutPreview";
import styles from "../../components/SystemHubPage.module.css";

interface UserBackground {
  id: number;
  userId: number;
  name: string;
  storagePath: string;
  width: number;
  height: number;
  aspectRatio: number;
  focalX: number;
  focalY: number;
  timerPosition: FocusTimerPosition;
  layoutKey?: FocusTimerLayoutKey | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
  signedUrl: string | null;
}

interface QuotaData {
  used: number;
  max: number;
  remaining: number;
}

const TIMER_LAYOUT_OPTIONS: Array<{
  key: FocusTimerLayoutKey;
  label: string;
  description: string;
}> = [
  {
    key: "classic",
    label: "Classic Sylf",
    description: "Authentic digital focus clock with ambient glow and clean telemetry.",
  },
  {
    key: "anime",
    label: "Anime Floating Pod",
    description: "Cinematic, restrained glass pod with integrated controls in negative space.",
  },
  {
    key: "landscape",
    label: "Landscape Vista",
    description: "Cinematic lower-third typography floating directly over panoramic artwork.",
  },
  {
    key: "fantasy",
    label: "Fantasy Celestial",
    description: "Ethereal scholar astrolabe dial with delicate astronomical markings.",
  },
];

const MAX_MEGAPIXELS = 35;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export function FocusBackgroundsSettingsScreen() {
  const { user } = useAuth();
  const [backgrounds, setBackgrounds] = useState<UserBackground[]>([]);
  const [quota, setQuota] = useState<QuotaData>({ used: 0, max: 10, remaining: 10 });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadFocalX, setUploadFocalX] = useState(0.5);
  const [uploadFocalY, setUploadFocalY] = useState(0.5);
  const [uploadTimerPos, setUploadTimerPos] = useState<FocusTimerPosition>("auto");
  const [uploadLayoutKey, setUploadLayoutKey] = useState<FocusTimerLayoutKey>("classic");
  const [uploadValidation, setUploadValidation] = useState<{
    width: number;
    height: number;
    fileSize: number;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Edit modal state
  const [editingBg, setEditingBg] = useState<UserBackground | null>(null);
  const [editName, setEditName] = useState("");
  const [editFocalX, setEditFocalX] = useState(0.5);
  const [editFocalY, setEditFocalY] = useState(0.5);
  const [editTimerPos, setEditTimerPos] = useState<FocusTimerPosition>("auto");
  const [editLayoutKey, setEditLayoutKey] = useState<FocusTimerLayoutKey>("classic");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete modal state
  const [deletingBg, setDeletingBg] = useState<UserBackground | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch user background library
  const loadBackgrounds = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await fetch("/api/user/focus-backgrounds", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) {
          setErrorMessage("Please log in to manage your focus environments.");
          return;
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load backgrounds");
      }
      const data = await res.json();
      setBackgrounds(data.backgrounds || []);
      if (data.quota) {
        setQuota(data.quota);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load focus backgrounds");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadBackgrounds();
    }
  }, [user]);

  // Clean up object URLs to prevent browser memory leaks
  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) {
        URL.revokeObjectURL(uploadPreviewUrl);
      }
    };
  }, [uploadPreviewUrl]);

  // Handle modal dismissal and clean up object URLs
  const handleCloseUploadModal = () => {
    if (isUploading) return;
    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl);
      setUploadPreviewUrl(null);
    }
    setUploadFile(null);
    setUploadValidation(null);
    setUploadError(null);
    setIsUploadOpen(false);
  };

  // Handle file selection and client-side pre-validation
  const handleFileSelect = (file: File) => {
    setUploadError(null);

    // Clean up any previously created object URL
    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl);
      setUploadPreviewUrl(null);
    }

    // 1. Strict MIME type / extension checks
    if (file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif")) {
      setUploadError("Animated GIFs are not supported. Please upload a static JPEG, PNG, or WebP.");
      return;
    }

    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMimes.includes(file.type)) {
      setUploadError("Unsupported file type. Please upload a JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size > MAX_BYTES) {
      setUploadError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 10 MB.`);
      return;
    }

    // 2. Decode image dimensions in browser to protect against decompression bombs
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      img.onload = null;
      img.onerror = null;

      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const megapixels = (w * h) / 1_000_000;

      if (w < 1280 || h < 720) {
        setUploadError(`Resolution too low (${w}×${h}px). Minimum requirement is 1280×720px for HD clarity.`);
        URL.revokeObjectURL(objectUrl);
        return;
      }

      if (w > 7680 || h > 4320) {
        setUploadError(`Dimensions exceed maximum allowed bounds (${w}×${h}px). Maximum resolution is 7680×4320 (8K).`);
        URL.revokeObjectURL(objectUrl);
        return;
      }

      if (megapixels > MAX_MEGAPIXELS) {
        setUploadError(`Image pixel area (${megapixels.toFixed(1)} MP) exceeds the 35 MP safety ceiling.`);
        URL.revokeObjectURL(objectUrl);
        return;
      }

      setUploadFile(file);
      setUploadPreviewUrl(objectUrl);
      setUploadValidation({ width: w, height: h, fileSize: file.size });

      // Suggest friendly name from filename
      const cleanName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]+/g, " ")
        .trim();
      setUploadName(cleanName.slice(0, 50));
      setUploadFocalX(0.5);
      setUploadFocalY(0.5);
      setUploadTimerPos("auto");
    };

    img.onerror = () => {
      img.onload = null;
      img.onerror = null;
      setUploadError("Failed to parse image file. The image may be corrupted.");
      URL.revokeObjectURL(objectUrl);
    };

    img.src = objectUrl;
  };

  // Interactive focal-point click handler on 16:9 preview
  const handleFocalPointClick = (
    e: React.MouseEvent<HTMLDivElement>,
    setX: (val: number) => void,
    setY: (val: number) => void
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setX(Number(x.toFixed(2)));
    setY(Number(y.toFixed(2)));
  };

  // Submit new background upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    const trimmed = uploadName.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      setUploadError("Display name must be between 2 and 60 characters.");
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);

      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("name", trimmed);
      formData.append("focalX", String(uploadFocalX));
      formData.append("focalY", String(uploadFocalY));
      formData.append("timerPosition", uploadTimerPos);
      formData.append("layoutKey", uploadLayoutKey);

      const res = await fetch("/api/user/focus-backgrounds", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload background");
      }

      // Broadcast update across open tabs (e.g. Focus Timer tab)
      if (typeof BroadcastChannel !== "undefined") {
        try {
          const bc = new BroadcastChannel("sylf-focus-background-sync");
          bc.postMessage({ type: "BACKGROUND_UPDATED", backgroundId: data.background?.id });
          bc.close();
        } catch {}
      }

      // Success
      setIsUploadOpen(false);
      setUploadFile(null);
      setUploadPreviewUrl(null);
      await loadBackgrounds();
    } catch (err: any) {
      setUploadError(err.message || "Failed to complete upload");
    } finally {
      setIsUploading(false);
    }
  };

  // Open edit modal for a background
  const openEditModal = (bg: UserBackground) => {
    setEditingBg(bg);
    setEditName(bg.name);
    setEditFocalX(typeof bg.focalX === "number" ? bg.focalX : 0.5);
    setEditFocalY(typeof bg.focalY === "number" ? bg.focalY : 0.5);
    setEditTimerPos(bg.timerPosition || "auto");
    setEditLayoutKey(bg.layoutKey || "classic");
    setEditError(null);
  };

  // Submit metadata patch
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBg) return;

    const trimmed = editName.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      setEditError("Display name must be between 2 and 60 characters.");
      return;
    }

    try {
      setIsSavingEdit(true);
      setEditError(null);

      const res = await fetch(`/api/user/focus-backgrounds/${editingBg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          focalX: editFocalX,
          focalY: editFocalY,
          timerPosition: editTimerPos,
          layoutKey: editLayoutKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update background");
      }

      // Broadcast update across open tabs so /focus immediately reflects changes
      if (typeof BroadcastChannel !== "undefined") {
        try {
          const bc = new BroadcastChannel("sylf-focus-background-sync");
          bc.postMessage({ type: "BACKGROUND_UPDATED", backgroundId: editingBg.id });
          bc.close();
        } catch {}
      }

      // Update local state
      setBackgrounds((prev) =>
        prev.map((item) => (item.id === editingBg.id ? data.background : item))
      );
      setEditingBg(null);
    } catch (err: any) {
      setEditError(err.message || "Failed to update background");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Execute deletion with DB-first consistency
  const handleDeleteConfirm = async () => {
    if (!deletingBg) return;

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/user/focus-backgrounds/${deletingBg.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete background");
      }

      // Broadcast deletion across open tabs
      if (typeof BroadcastChannel !== "undefined") {
        try {
          const bc = new BroadcastChannel("sylf-focus-background-sync");
          bc.postMessage({ type: "BACKGROUND_DELETED", backgroundId: deletingBg.id });
          bc.close();
        } catch {}
      }

      setBackgrounds((prev) => prev.filter((b) => b.id !== deletingBg.id));
      setQuota((prev) => ({
        used: Math.max(0, prev.used - 1),
        max: prev.max,
        remaining: Math.min(prev.max, prev.remaining + 1),
      }));
      setDeletingBg(null);
    } catch (err: any) {
      alert(err.message || "Failed to delete background");
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper to render subtle secondary Timer Safe Zone guide in 16:9 preview boxes
  const renderSafeZonePreview = (pos: FocusTimerPosition, focalX: number) => {
    const effective = resolveEffectiveTimerPosition(pos, focalX);
    let zoneAlignment = "left-2 sm:left-3 w-28 sm:w-36";
    if (effective === "right") {
      zoneAlignment = "right-2 sm:right-3 w-28 sm:w-36";
    } else if (effective === "center") {
      zoneAlignment = "left-1/2 -translate-x-1/2 w-32 sm:w-40";
    }

    return (
      <div
        className={`absolute top-2 bottom-2 rounded-xl border border-dashed border-cyan-400/20 bg-cyan-950/10 pointer-events-none transition-all duration-300 flex flex-col justify-end items-center pb-1 shadow-sm z-0 ${zoneAlignment}`}
      >
        <span className="text-[8px] uppercase tracking-widest font-mono text-cyan-400/50 bg-black/40 px-1.5 py-0.5 rounded border border-cyan-500/20">
          safe zone ({effective})
        </span>
      </div>
    );
  };

  if (!user) {
    return (
      <div className={styles.hubContainer}>
        <div className={styles.topGlow} aria-hidden="true" />
        <div className={styles.contentWrapper}>
          <BackToSettings />
          <p className="settings-page-breadcrumb">Appearance → My Focus Environments</p>
          <div className="p-12 text-center text-text-secondary">
            <Shield className="w-12 h-12 mx-auto mb-4 text-accent-primary" />
            <p className="font-['Rajdhani'] font-bold text-xl text-text-primary">Authentication Required</p>
            <p className="text-sm mt-2">Log in to view and manage your personal Focus Environments.</p>
          </div>
        </div>
      </div>
    );
  }

  const quotaPercent = Math.min(100, Math.round((quota.used / quota.max) * 100));
  const isQuotaFull = quota.used >= quota.max;

  return (
    <div className={styles.hubContainer}>
      <div className={styles.topGlow} aria-hidden="true" />
      <div className={`${styles.contentWrapper} pb-24`}>
        <BackToSettings />

        <p className="settings-page-breadcrumb">Appearance → My Focus Environments</p>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="settings-page-header mb-1 text-3xl font-['Rajdhani'] font-bold text-text-primary flex items-center gap-3">
            <span>My Focus Environments</span>
            <span className="text-xs uppercase tracking-widest px-2 py-0.5 rounded-full bg-accent-primary/20 text-accent-primary border border-accent-primary/30 font-semibold">
              Personal Vault
            </span>
          </h1>
          <p className="text-sm text-text-secondary max-w-xl">
            Upload and customize personal environments for your Focus Timer sessions. Each background is private to your account, encrypted in transit, and synced across your devices.
          </p>
        </div>

        {/* Upload Trigger Button */}
        <button
          onClick={() => {
            setUploadError(null);
            setUploadFile(null);
            setUploadPreviewUrl(null);
            setIsUploadOpen(true);
          }}
          disabled={isQuotaFull}
          className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-['Rajdhani'] font-bold text-base transition-all ${
            isQuotaFull
              ? "bg-bg-panel text-text-muted border border-border-subtle cursor-not-allowed opacity-60"
              : "bg-accent-primary hover:bg-accent-primary-hover text-white shadow-lg shadow-accent-primary/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Upload Background</span>
        </button>
      </div>

      {/* Quota & Storage Posture Banner */}
      <div className="bg-bg-card border border-border-subtle rounded-2xl p-5 mb-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent-primary" />
            <span className="font-['Rajdhani'] font-bold text-sm uppercase tracking-wider text-text-primary">
              Personal Library Storage Quota
            </span>
          </div>
          <div className="flex items-center gap-2 font-['Rajdhani'] font-bold text-sm">
            <span className="text-text-primary">{quota.used}</span>
            <span className="text-text-muted">/</span>
            <span className="text-text-muted">{quota.max} slots used</span>
            {isQuotaFull && (
              <span className="ml-2 text-xs text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
                Quota Full
              </span>
            )}
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full h-2 rounded-full bg-bg-panel overflow-hidden mb-3">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              quota.used >= 10
                ? "bg-rose-500"
                : quota.used >= 8
                ? "bg-amber-500"
                : "bg-gradient-to-r from-accent-primary to-cyan-400"
            }`}
            style={{ width: `${quotaPercent}%` }}
          />
        </div>

        {/* Feature telemetry chips */}
        <div className="flex flex-wrap gap-2 text-[11px] text-text-muted">
          <span className="inline-flex items-center gap-1 bg-bg-panel px-2 py-0.5 rounded border border-border-subtle">
            <Shield className="w-3 h-3 text-emerald-400" /> Private Bucket
          </span>
          <span className="inline-flex items-center gap-1 bg-bg-panel px-2 py-0.5 rounded border border-border-subtle">
            Max 10 MB
          </span>
          <span className="inline-flex items-center gap-1 bg-bg-panel px-2 py-0.5 rounded border border-border-subtle">
            Min 1280×720 (16:9 Recommended)
          </span>
          <span className="inline-flex items-center gap-1 bg-bg-panel px-2 py-0.5 rounded border border-border-subtle">
            JPEG · PNG · WebP
          </span>
        </div>

        {/* Early quota warning before user reaches the 10-background limit */}
        {!isQuotaFull && quota.remaining <= 3 && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
            <span>
              Nearing storage limit: You have {quota.remaining} slot{quota.remaining === 1 ? "" : "s"} remaining before reaching the 10-environment limit.
            </span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 text-text-muted">
          <Loader2 className="w-8 h-8 animate-spin text-accent-primary mb-3" />
          <p className="font-['Rajdhani'] font-semibold text-sm">Accessing personal vault...</p>
        </div>
      ) : errorMessage ? (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 text-center text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-400" />
          <p className="font-semibold">{errorMessage}</p>
          <button
            onClick={loadBackgrounds}
            className="mt-4 px-4 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs font-bold uppercase tracking-wider"
          >
            Retry
          </button>
        </div>
      ) : backgrounds.length === 0 ? (
        /* Empty State */
        <div className="border border-dashed border-border-subtle rounded-3xl p-12 text-center bg-bg-card/50 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center mb-4 text-accent-primary">
            <ImageIcon className="w-8 h-8 opacity-80" />
          </div>
          <h3 className="font-['Rajdhani'] font-bold text-xl text-text-primary mb-1">
            No Personal Environments Yet
          </h3>
          <p className="text-sm text-text-secondary max-w-md mb-6">
            Upload high-resolution scenery, anime landscapes, or ambient artwork to transform your Focus Timer into your dream study sanctuary.
          </p>
          <button
            onClick={() => {
              setUploadError(null);
              setUploadFile(null);
              setUploadPreviewUrl(null);
              setIsUploadOpen(true);
            }}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent-primary hover:bg-accent-primary-hover text-white font-['Rajdhani'] font-bold text-sm shadow-md shadow-accent-primary/25 cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4" />
            Upload Your First Environment
          </button>
        </div>
      ) : (
        /* Backgrounds Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {backgrounds.map((bg) => {
            const timerLabel =
              TIMER_POSITION_REGISTRY[bg.timerPosition]?.label || bg.timerPosition;
            const effective = resolveEffectiveTimerPosition(bg.timerPosition, bg.focalX);

            return (
              <motion.div
                key={bg.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group bg-bg-card border border-border-subtle rounded-2xl overflow-hidden shadow-sm hover:border-accent-primary/40 transition-all flex flex-col"
              >
                {/* 16:9 Viewport Preview */}
                <div className="relative w-full aspect-video bg-black/60 overflow-hidden select-none">
                  {bg.signedUrl ? (
                    <img
                      src={bg.signedUrl}
                      alt={bg.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      style={{
                        objectPosition: `${bg.focalX * 100}% ${bg.focalY * 100}%`,
                      }}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-text-muted">
                      <ImageIcon className="w-8 h-8 mb-1 opacity-40" />
                      <span className="text-[11px]">Vault preview unavailable</span>
                    </div>
                  )}

                  {/* Gradient bottom scrim for readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

                  {/* Focal point crosshair marker on hover */}
                  <div
                    className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border border-cyan-400 bg-cyan-500/30 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{
                      left: `${bg.focalX * 100}%`,
                      top: `${bg.focalY * 100}%`,
                    }}
                    title={`Focal point: (${bg.focalX.toFixed(2)}, ${bg.focalY.toFixed(2)})`}
                  >
                    <Crosshair className="w-3 h-3 text-cyan-200" />
                  </div>

                  {/* Top telemetry badges */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-black/70 text-text-primary border border-white/10 backdrop-blur-sm">
                      {bg.width}×{bg.height}
                    </span>
                    <span className="text-[10px] font-['Rajdhani'] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-accent-primary/80 text-white shadow-sm backdrop-blur-sm">
                      Dock: {effective}
                    </span>
                  </div>

                  {/* Bottom title in preview */}
                  <div className="absolute bottom-2.5 left-3 right-3 pointer-events-none">
                    <h3 className="font-['Rajdhani'] font-bold text-lg text-white truncate drop-shadow-md">
                      {bg.name}
                    </h3>
                  </div>
                </div>

                {/* Card Body & Actions */}
                <div className="p-4 flex items-center justify-between gap-3 border-t border-border-subtle bg-bg-panel/40 mt-auto">
                  <div className="text-[11px] text-text-muted flex items-center gap-2">
                    <span>
                      {bg.fileSize
                        ? `${(bg.fileSize / (1024 * 1024)).toFixed(1)} MB`
                        : "Static"}
                    </span>
                    <span>•</span>
                    <span className="capitalize text-text-secondary font-medium">
                      {bg.layoutKey || "classic"}
                    </span>
                    <span>•</span>
                    <span className="truncate max-w-[100px]" title={timerLabel}>
                      {bg.timerPosition === "auto" ? "Auto" : bg.timerPosition}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Edit Button */}
                    <button
                      onClick={() => openEditModal(bg)}
                      className="p-2 rounded-lg bg-bg-panel hover:bg-bg-panel-hover text-text-secondary hover:text-text-primary border border-border-subtle transition-colors cursor-pointer"
                      title="Adjust focal point and timer docking"
                      aria-label="Edit background"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => setDeletingBg(bg)}
                      className="p-2 rounded-lg bg-bg-panel hover:bg-rose-500/10 text-text-secondary hover:text-rose-400 border border-border-subtle hover:border-rose-500/30 transition-colors cursor-pointer"
                      title="Delete environment"
                      aria-label="Delete background"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          UPLOAD MODAL
      ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isUploadOpen && (
          <div className="fixed inset-0 z-70 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseUploadModal}
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
            />

            {/* Dialog Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-2xl bg-bg-panel border border-border-subtle rounded-3xl p-6 sm:p-8 shadow-2xl z-10 my-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-['Rajdhani'] font-bold text-2xl text-text-primary">
                    Upload Focus Environment
                  </h2>
                  <p className="text-xs text-text-muted">
                    Private 16:9 wallpaper for your Focus Timer. Slot {quota.used + 1} of {quota.max}.
                  </p>
                </div>
                <button
                  onClick={handleCloseUploadModal}
                  disabled={isUploading}
                  className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-card transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {uploadError && (
                <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
                  <span>{uploadError}</span>
                </div>
              )}

              <form onSubmit={handleUploadSubmit}>
                {!uploadPreviewUrl ? (
                  /* Dropzone */
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.[0]) {
                        handleFileSelect(e.dataTransfer.files[0]);
                      }
                    }}
                    className="border-2 border-dashed border-border-subtle hover:border-accent-primary/60 rounded-2xl p-10 text-center cursor-pointer transition-colors bg-bg-card/40 flex flex-col items-center justify-center min-h-[260px]"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleFileSelect(e.target.files[0]);
                        }
                      }}
                    />
                    <div className="w-14 h-14 rounded-2xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center mb-3 text-accent-primary">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="font-['Rajdhani'] font-bold text-lg text-text-primary mb-1">
                      Choose an image or drag it here
                    </p>
                    <p className="text-xs text-text-muted max-w-sm mb-4">
                      High-resolution landscape (16:9) works best. Min 1280×720, up to 10 MB.
                    </p>
                    <span className="px-4 py-1.5 rounded-lg bg-bg-panel text-xs font-semibold text-text-primary border border-border-subtle">
                      Select File
                    </span>
                  </div>
                ) : (
                  /* Focal Point Adjuster & Safe-Zone Preview */
                  <div className="space-y-4">
                    <div className="relative">
                      <div
                        onClick={(e) => handleFocalPointClick(e, setUploadFocalX, setUploadFocalY)}
                        className="relative w-full aspect-video rounded-2xl overflow-hidden border border-border-subtle bg-black cursor-crosshair group shadow-inner"
                        title="Click anywhere to reposition focal anchor"
                      >
                        <img
                          src={uploadPreviewUrl}
                          alt="Upload preview"
                          className="w-full h-full object-cover select-none"
                          style={{
                            objectPosition: `${uploadFocalX * 100}% ${uploadFocalY * 100}%`,
                          }}
                        />

                        {/* Interactive Reticle Dot */}
                        <div
                          className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-cyan-400 bg-cyan-500/40 flex items-center justify-center pointer-events-none transition-all shadow-lg z-20"
                          style={{
                            left: `${uploadFocalX * 100}%`,
                            top: `${uploadFocalY * 100}%`,
                          }}
                        >
                          <Crosshair className="w-3.5 h-3.5 text-cyan-200" />
                        </div>

                        {/* Subtle secondary safe-zone layout guide */}
                        {renderSafeZonePreview(uploadTimerPos, uploadFocalX)}

                        {/* Real Timer Layout Preview (Primary) */}
                        <FocusTimerLayoutPreview
                          layoutKey={uploadLayoutKey}
                          timerPosition={uploadTimerPos}
                          focalX={uploadFocalX}
                          focalY={uploadFocalY}
                          subjectName={uploadName.trim() || "Study Session"}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setUploadFile(null);
                          setUploadPreviewUrl(null);
                          setUploadValidation(null);
                        }}
                        className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/80 hover:bg-black text-white text-xs font-semibold border border-white/20 backdrop-blur-sm cursor-pointer"
                      >
                        Change Image
                      </button>
                    </div>

                    <p className="text-[11px] text-text-muted flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Info className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                        Click anywhere on the artwork to set the visual focal point (X:{" "}
                        {(uploadFocalX * 100).toFixed(0)}%, Y: {(uploadFocalY * 100).toFixed(0)}%).
                      </span>
                      {uploadValidation && (
                        <span className="font-mono text-cyan-400 font-semibold">
                          {uploadValidation.width}×{uploadValidation.height}
                        </span>
                      )}
                    </p>

                    {/* Environment Name Input */}
                    <div>
                      <label className="block text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary mb-1.5">
                        Environment Display Name
                      </label>
                      <input
                        type="text"
                        value={uploadName}
                        onChange={(e) => setUploadName(e.target.value)}
                        maxLength={60}
                        placeholder="e.g. Rainy Cyberpunk Terrace"
                        className="w-full px-4 py-2.5 rounded-xl bg-bg-card border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-primary"
                        required
                      />
                    </div>

                    {/* Timer Position Options */}
                    <div>
                      <label className="block text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary mb-1.5">
                        Timer Dock Placement
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {VALID_TIMER_POSITIONS.map((pos) => (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => setUploadTimerPos(pos)}
                            className={`p-2.5 rounded-xl border text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              uploadTimerPos === pos
                                ? "bg-accent-primary/20 border-accent-primary text-accent-primary"
                                : "bg-bg-card border-border-subtle text-text-secondary hover:text-text-primary"
                            }`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-text-muted mt-1.5">
                        {TIMER_POSITION_REGISTRY[uploadTimerPos].description}
                      </p>
                    </div>

                    {/* Timer Layout Style */}
                    <div>
                      <label className="block text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary mb-1.5">
                        Timer Layout Style
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {TIMER_LAYOUT_OPTIONS.map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setUploadLayoutKey(opt.key)}
                            className={`p-2.5 rounded-xl border text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              uploadLayoutKey === opt.key
                                ? "bg-accent-primary/20 border-accent-primary text-accent-primary"
                                : "bg-bg-card border-border-subtle text-text-secondary hover:text-text-primary"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-text-muted mt-1.5">
                        {TIMER_LAYOUT_OPTIONS.find((o) => o.key === uploadLayoutKey)?.description}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                      <button
                        type="button"
                        onClick={handleCloseUploadModal}
                        disabled={isUploading}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isUploading || !uploadFile}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent-primary hover:bg-accent-primary-hover text-white font-['Rajdhani'] font-bold text-sm shadow-md shadow-accent-primary/25 cursor-pointer disabled:opacity-50"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Uploading to Vault...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Save to Library</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────
          EDIT MODAL
      ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {editingBg && (
          <div className="fixed inset-0 z-70 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isSavingEdit) setEditingBg(null);
              }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-2xl bg-bg-panel border border-border-subtle rounded-3xl p-6 sm:p-8 shadow-2xl z-10 my-auto"
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-['Rajdhani'] font-bold text-2xl text-text-primary">
                    Edit Environment
                  </h2>
                  <p className="text-xs text-text-muted">
                    Adjust artwork focal point and Focus Timer layout docking.
                  </p>
                </div>
                <button
                  onClick={() => setEditingBg(null)}
                  disabled={isSavingEdit}
                  className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-card transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {editError && (
                <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
                  <span>{editError}</span>
                </div>
              )}

              <form onSubmit={handleSaveEdit} className="space-y-4">
                {/* 16:9 Viewport preview with interactive focal reticle */}
                <div className="relative">
                  <div
                    onClick={(e) => handleFocalPointClick(e, setEditFocalX, setEditFocalY)}
                    className="relative w-full aspect-video rounded-2xl overflow-hidden border border-border-subtle bg-black cursor-crosshair group shadow-inner"
                    title="Click anywhere to reposition focal point"
                  >
                    {editingBg.signedUrl ? (
                      <img
                        src={editingBg.signedUrl}
                        alt={editingBg.name}
                        className="w-full h-full object-cover select-none"
                        style={{
                          objectPosition: `${editFocalX * 100}% ${editFocalY * 100}%`,
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted text-xs">
                        Vault image preview
                      </div>
                    )}

                    {/* Interactive Reticle Dot */}
                    <div
                      className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-cyan-400 bg-cyan-500/40 flex items-center justify-center pointer-events-none transition-all shadow-lg z-20"
                      style={{
                        left: `${editFocalX * 100}%`,
                        top: `${editFocalY * 100}%`,
                      }}
                    >
                      <Crosshair className="w-3.5 h-3.5 text-cyan-200" />
                    </div>

                    {/* Subtle secondary safe-zone layout guide */}
                    {renderSafeZonePreview(editTimerPos, editFocalX)}

                    {/* Real Timer Layout Preview (Primary) */}
                    <FocusTimerLayoutPreview
                      layoutKey={editLayoutKey}
                      timerPosition={editTimerPos}
                      focalX={editFocalX}
                      focalY={editFocalY}
                      subjectName={editName.trim() || "Study Session"}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-text-muted flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                  <span>
                    Click anywhere on the artwork to set the visual focal point (X:{" "}
                    {(editFocalX * 100).toFixed(0)}%, Y: {(editFocalY * 100).toFixed(0)}%).
                  </span>
                </p>

                {/* Name */}
                <div>
                  <label className="block text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary mb-1.5">
                    Environment Display Name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={60}
                    className="w-full px-4 py-2.5 rounded-xl bg-bg-card border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-primary"
                    required
                  />
                </div>

                {/* Timer Position Options */}
                <div>
                  <label className="block text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary mb-1.5">
                    Timer Dock Placement
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {VALID_TIMER_POSITIONS.map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setEditTimerPos(pos)}
                        className={`p-2.5 rounded-xl border text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          editTimerPos === pos
                            ? "bg-accent-primary/20 border-accent-primary text-accent-primary"
                            : "bg-bg-card border-border-subtle text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-text-muted mt-1.5">
                    {TIMER_POSITION_REGISTRY[editTimerPos].description}
                  </p>
                </div>

                {/* Timer Layout Style */}
                <div>
                  <label className="block text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-primary mb-1.5">
                    Timer Layout Style
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {TIMER_LAYOUT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setEditLayoutKey(opt.key)}
                        className={`p-2.5 rounded-xl border text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          editLayoutKey === opt.key
                            ? "bg-accent-primary/20 border-accent-primary text-accent-primary"
                            : "bg-bg-card border-border-subtle text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-text-muted mt-1.5">
                    {TIMER_LAYOUT_OPTIONS.find((o) => o.key === editLayoutKey)?.description}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setEditingBg(null)}
                    disabled={isSavingEdit}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent-primary hover:bg-accent-primary-hover text-white font-['Rajdhani'] font-bold text-sm shadow-md shadow-accent-primary/25 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingEdit ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────
          DELETE CONFIRMATION MODAL
      ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {deletingBg && (
          <div className="fixed inset-0 z-70 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isDeleting) setDeletingBg(null);
              }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-md bg-bg-panel border border-border-subtle rounded-3xl p-6 sm:p-8 shadow-2xl z-10"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-400">
                <Trash2 className="w-6 h-6" />
              </div>

              <h3 className="font-['Rajdhani'] font-bold text-xl text-text-primary mb-1">
                Delete "{deletingBg.name}"?
              </h3>
              <p className="text-xs text-text-secondary mb-6 leading-relaxed">
                This will permanently delete this background from your personal library and storage vault. This action cannot be undone.
              </p>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeletingBg(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-['Rajdhani'] font-bold text-sm shadow-md shadow-rose-500/25 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Delete Permanently</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

export default FocusBackgroundsSettingsScreen;
