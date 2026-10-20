"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/app/components/AuthProvider";
import {
  Upload,
  Plus,
  Trash2,
  Edit3,
  RefreshCw,
  Check,
  X,
  Eye,
  Layers,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  FolderPlus,
  Sliders,
  Maximize2,
  CheckCircle2,
  ImageIcon,
  Search,
  Crosshair,
  ExternalLink,
  Info,
} from "lucide-react";
import {
  VALID_LAYOUT_KEYS,
  LAYOUT_KEY_REGISTRY,
  FocusTimerLayoutKey,
  isValidLayoutKey,
  DEFAULT_LAYOUT_KEY,
  FocusTimerPosition,
  VALID_TIMER_POSITIONS,
  TIMER_POSITION_REGISTRY,
  isValidTimerPosition,
  resolveEffectiveTimerPosition,
} from "@/lib/focus-background-types";

// ── Types ──────────────────────────────────────────────────────────

interface BackgroundItem {
  id: number;
  categoryId: number;
  name: string;
  storagePath: string;
  width: number;
  height: number;
  aspectRatio: number;
  focalX: number;
  focalY: number;
  timerPosition: FocusTimerPosition;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  publicUrl: string;
}

interface CategoryItem {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  layoutKey: FocusTimerLayoutKey;
  sortOrder: number;
  isActive: boolean;
  backgroundsCount: number;
  backgrounds: BackgroundItem[];
}

interface ImageTelemetry {
  width: number;
  height: number;
  aspectRatio: number;
  isRecommended16x9: boolean;
  isValidResolution: boolean;
  sizeBytes: number;
}

export default function BackgroundStudioPage() {
  const { user, isLoading: authLoading } = useAuth();

  // Data states
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filters & selection
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterActiveState, setFilterActiveState] = useState<"all" | "active" | "inactive">("all");

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [replacingBackground, setReplacingBackground] = useState<BackgroundItem | null>(null);
  const [editingBackground, setEditingBackground] = useState<BackgroundItem | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deletingBgId, setDeletingBgId] = useState<number | null>(null);

  // Upload Form State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploadTelemetry, setUploadTelemetry] = useState<ImageTelemetry | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategoryId, setUploadCategoryId] = useState<number>(0);
  const [uploadFocalX, setUploadFocalX] = useState(0.5);
  const [uploadFocalY, setUploadFocalY] = useState(0.5);
  const [uploadTimerPosition, setUploadTimerPosition] = useState<FocusTimerPosition>("auto");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Edit Background Form State
  const [editName, setEditName] = useState("");
  const [editTimerPosition, setEditTimerPosition] = useState<FocusTimerPosition>("auto");
  const [editFocalX, setEditFocalX] = useState(0.5);
  const [editFocalY, setEditFocalY] = useState(0.5);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Replace Form State
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replacePreviewUrl, setReplacePreviewUrl] = useState<string | null>(null);
  const [replaceTelemetry, setReplaceTelemetry] = useState<ImageTelemetry | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  // Category Form State
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [categoryLayoutKey, setCategoryLayoutKey] = useState<FocusTimerLayoutKey>("classic");
  const [categoryIsActive, setCategoryIsActive] = useState(true);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!successToast) return;
    const t = setTimeout(() => setSuccessToast(null), 4000);
    return () => clearTimeout(t);
  }, [successToast]);

  // Fetch Catalog
  const fetchCatalog = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/focus-backgrounds");
      if (res.status === 401 || res.status === 403) {
        setError("Admin authorization required.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load background catalog.");
      }
      const data = await res.json();
      setCategories(data.categories || []);

      if (data.categories?.length > 0 && uploadCategoryId === 0) {
        setUploadCategoryId(data.categories[0].id);
      }
    } catch (err: any) {
      console.error("Fetch catalog error:", err);
      setError(err.message || "Failed to load background catalog.");
    } finally {
      setLoading(false);
    }
  }, [uploadCategoryId]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchCatalog();
    }
  }, [authLoading, user, fetchCatalog]);

  // Telemetry extractor for local image files with leak-proof cleanup
  const analyzeImageFile = (file: File): Promise<ImageTelemetry> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();

      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
        URL.revokeObjectURL(url);
      };

      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        cleanup();

        const aspectRatio = Number((width / height).toFixed(4));
        const isRecommended16x9 = aspectRatio >= 1.65 && aspectRatio <= 1.85;
        const isValidResolution = width >= 1280 && height >= 720;
        resolve({
          width,
          height,
          aspectRatio,
          isRecommended16x9,
          isValidResolution,
          sizeBytes: file.size,
        });
      };

      img.onerror = () => {
        cleanup();
        reject(new Error("Unable to decode image file."));
      };

      img.src = url;
    });
  };

  // Handle file selection in Upload modal
  const handleUploadFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl);
    }

    setUploadFile(file);
    setUploadError(null);
    const objectUrl = URL.createObjectURL(file);
    setUploadPreviewUrl(objectUrl);

    // Default name if empty
    if (!uploadName) {
      const rawName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ");
      const formatted = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      setUploadName(formatted);
    }

    try {
      const telemetry = await analyzeImageFile(file);
      setUploadTelemetry(telemetry);
    } catch (err: any) {
      setUploadError(err.message || "Failed to analyze image dimensions.");
    }
  };

  // Handle file selection in Replace modal
  const handleReplaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (replacePreviewUrl) {
      URL.revokeObjectURL(replacePreviewUrl);
    }

    setReplaceFile(file);
    setReplaceError(null);
    const objectUrl = URL.createObjectURL(file);
    setReplacePreviewUrl(objectUrl);

    try {
      const telemetry = await analyzeImageFile(file);
      setReplaceTelemetry(telemetry);
    } catch (err: any) {
      setReplaceError(err.message || "Failed to analyze replacement image.");
    }
  };

  // Focal Point Picker Handler
  const handleFocalClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setUploadFocalX(Number(Math.max(0, Math.min(1, x)).toFixed(2)));
    setUploadFocalY(Number(Math.max(0, Math.min(1, y)).toFixed(2)));
  };

  // Edit Focal Point Picker Handler
  const handleEditFocalClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setEditFocalX(Number(Math.max(0, Math.min(1, x)).toFixed(2)));
    setEditFocalY(Number(Math.max(0, Math.min(1, y)).toFixed(2)));
  };

  // Helper to render Timer Safe Zone overlay
  const renderSafeZoneOverlay = (position: FocusTimerPosition, focalX: number) => {
    const effective = resolveEffectiveTimerPosition(position, focalX);
    let zoneClass = "left-4 sm:left-6 w-32 sm:w-44";
    if (effective === "right") {
      zoneClass = "right-4 sm:right-6 w-32 sm:w-44";
    } else if (effective === "center") {
      zoneClass = "left-1/2 -translate-x-1/2 w-36 sm:w-48";
    }

    return (
      <div
        className={`absolute top-4 bottom-4 rounded-xl border border-dashed border-amber-400/70 bg-amber-500/10 backdrop-blur-[2px] pointer-events-none transition-all duration-300 flex flex-col items-center justify-center p-2 text-center shadow-lg ${zoneClass}`}
      >
        <span className="text-[9px] uppercase tracking-wider font-bold text-amber-300 bg-black/70 px-2 py-0.5 rounded border border-amber-500/30">
          Timer Safe Zone ({effective})
        </span>
        {position === "auto" ? (
          <span className="text-[8px] text-amber-200/90 mt-1">
            Auto-placed via focalX {focalX.toFixed(2)}
          </span>
        ) : (
          <span className="text-[8px] text-amber-200/90 mt-1">
            Explicitly pinned {position}
          </span>
        )}
      </div>
    );
  };

  // Submit Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError("Please choose an image file.");
      return;
    }
    if (!uploadName.trim()) {
      setUploadError("Please provide a display name.");
      return;
    }
    if (!uploadCategoryId) {
      setUploadError("Please select a category.");
      return;
    }
    if (uploadTelemetry && !uploadTelemetry.isValidResolution) {
      setUploadError(`Resolution too low (${uploadTelemetry.width}×${uploadTelemetry.height}). Minimum desktop resolution is 1280×720.`);
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);

      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("name", uploadName.trim());
      formData.append("categoryId", String(uploadCategoryId));
      formData.append("focalX", String(uploadFocalX));
      formData.append("focalY", String(uploadFocalY));
      formData.append("timerPosition", uploadTimerPosition);

      const res = await fetch("/api/admin/focus-backgrounds/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      setSuccessToast(`Uploaded "${uploadName}" successfully!`);
      setIsUploadModalOpen(false);
      resetUploadForm();
      await fetchCatalog();
    } catch (err: any) {
      console.error("Upload error:", err);
      setUploadError(err.message || "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const resetUploadForm = () => {
    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl);
    }
    setUploadFile(null);
    setUploadPreviewUrl(null);
    setUploadTelemetry(null);
    setUploadName("");
    setUploadFocalX(0.5);
    setUploadFocalY(0.5);
    setUploadTimerPosition("auto");
    setUploadError(null);
  };

  // Open Edit Background Modal
  const openEditBackgroundModal = (bg: BackgroundItem) => {
    setEditingBackground(bg);
    setEditName(bg.name);
    setEditTimerPosition(bg.timerPosition || "auto");
    setEditFocalX(typeof bg.focalX === "number" ? bg.focalX : 0.5);
    setEditFocalY(typeof bg.focalY === "number" ? bg.focalY : 0.5);
    setEditError(null);
  };

  // Submit Edit Background
  const handleEditBackgroundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBackground) return;
    if (!editName.trim()) {
      setEditError("Display name is required.");
      return;
    }

    try {
      setIsSavingEdit(true);
      setEditError(null);

      const res = await fetch(`/api/admin/focus-backgrounds/${editingBackground.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          timerPosition: editTimerPosition,
          focalX: editFocalX,
          focalY: editFocalY,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update background.");
      }

      setSuccessToast(`Updated "${editName}" settings!`);
      setEditingBackground(null);
      await fetchCatalog();
    } catch (err: any) {
      console.error("Edit error:", err);
      setEditError(err.message || "Failed to update background.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Submit Replace
  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replacingBackground || !replaceFile) return;

    try {
      setIsReplacing(true);
      setReplaceError(null);

      const formData = new FormData();
      formData.append("file", replaceFile);

      const res = await fetch(`/api/admin/focus-backgrounds/${replacingBackground.id}/replace`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Replace failed.");
      }

      setSuccessToast(`Replaced image for "${replacingBackground.name}"!`);
      if (replacePreviewUrl) {
        URL.revokeObjectURL(replacePreviewUrl);
      }
      setReplacingBackground(null);
      setReplaceFile(null);
      setReplacePreviewUrl(null);
      setReplaceTelemetry(null);
      await fetchCatalog();
    } catch (err: any) {
      console.error("Replace error:", err);
      setReplaceError(err.message || "Failed to replace image.");
    } finally {
      setIsReplacing(false);
    }
  };

  const handleCloseReplaceModal = () => {
    if (replacePreviewUrl) {
      URL.revokeObjectURL(replacePreviewUrl);
    }
    setReplacingBackground(null);
    setReplaceFile(null);
    setReplacePreviewUrl(null);
    setReplaceTelemetry(null);
    setReplaceError(null);
  };

  // Informational duplicate name detector for upload workflow
  const isDuplicateUploadName = useMemo(() => {
    if (!uploadName.trim() || !uploadCategoryId) return false;
    const cat = categories.find((c) => c.id === uploadCategoryId);
    return Boolean(
      cat?.backgrounds.some(
        (b) => b.name.trim().toLowerCase() === uploadName.trim().toLowerCase()
      )
    );
  }, [uploadName, uploadCategoryId, categories]);

  // Toggle Background Active State
  const handleToggleBackgroundActive = async (bg: BackgroundItem) => {
    try {
      const nextActive = !bg.isActive;
      // Optimistic update
      setCategories((prev) =>
        prev.map((c) => ({
          ...c,
          backgrounds: c.backgrounds.map((b) =>
            b.id === bg.id ? { ...b, isActive: nextActive } : b
          ),
        }))
      );

      const res = await fetch(`/api/admin/focus-backgrounds/${bg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to toggle status.");
      }

      setSuccessToast(`${bg.name} is now ${nextActive ? "Active" : "Disabled"}.`);
    } catch (err: any) {
      console.error("Toggle error:", err);
      // Revert on error
      await fetchCatalog();
    }
  };

  // Delete Background
  const handleDeleteBackground = async (id: number) => {
    if (!confirm("Are you sure you want to delete this background? This removes the image file from storage.")) {
      return;
    }

    try {
      setDeletingBgId(id);
      const res = await fetch(`/api/admin/focus-backgrounds/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete background.");
      }
      setSuccessToast("Background deleted successfully.");
      await fetchCatalog();
    } catch (err: any) {
      alert(err.message || "Failed to delete.");
    } finally {
      setDeletingBgId(null);
    }
  };

  // Reorder Backgrounds (Move Up / Down)
  const handleReorder = async (categoryId: number, bgId: number, direction: "up" | "down") => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;

    const list = [...category.backgrounds];
    const index = list.findIndex((b) => b.id === bgId);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    // Swap
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    // Optimistic update
    setCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, backgrounds: list } : c))
    );

    try {
      const orderedIds = list.map((b) => b.id);
      const res = await fetch("/api/admin/focus-backgrounds/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, orderedIds }),
      });
      if (!res.ok) {
        await fetchCatalog();
      }
    } catch {
      await fetchCatalog();
    }
  };

  // Open Category Modal
  const openCategoryModal = (cat?: CategoryItem) => {
    if (cat) {
      setEditingCategory(cat);
      setCategoryName(cat.name);
      setCategorySlug(cat.slug);
      setCategoryDescription(cat.description || "");
      setCategoryLayoutKey(cat.layoutKey);
      setCategoryIsActive(cat.isActive);
    } else {
      setEditingCategory(null);
      setCategoryName("");
      setCategorySlug("");
      setCategoryDescription("");
      setCategoryLayoutKey("classic");
      setCategoryIsActive(true);
    }
    setCategoryError(null);
    setIsCategoryModalOpen(true);
  };

  // Save Category (Create or Edit)
  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) {
      setCategoryError("Category name is required.");
      return;
    }

    try {
      setIsSavingCategory(true);
      setCategoryError(null);

      const payload = {
        name: categoryName.trim(),
        slug: categorySlug.trim() || undefined,
        description: categoryDescription.trim() || null,
        layoutKey: categoryLayoutKey,
        isActive: categoryIsActive,
      };

      const url = editingCategory
        ? `/api/admin/focus-background-categories/${editingCategory.id}`
        : "/api/admin/focus-background-categories";
      const method = editingCategory ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save category.");
      }

      setSuccessToast(
        editingCategory ? `Updated "${categoryName}"` : `Created "${categoryName}" category!`
      );
      setIsCategoryModalOpen(false);
      await fetchCatalog();
    } catch (err: any) {
      setCategoryError(err.message || "Failed to save category.");
    } finally {
      setIsSavingCategory(false);
    }
  };

  // Delete Category
  const handleDeleteCategory = async (cat: CategoryItem) => {
    const msg = `Are you sure you want to delete category "${cat.name}"?\n\nWARNING: This will permanently delete ${cat.backgrounds.length} associated background images from Supabase Storage.`;
    if (!confirm(msg)) return;

    try {
      const res = await fetch(`/api/admin/focus-background-categories/${cat.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete category.");

      setSuccessToast(`Category "${cat.name}" and storage files removed.`);
      if (selectedCategorySlug === cat.slug) setSelectedCategorySlug("all");
      await fetchCatalog();
    } catch (err: any) {
      alert(err.message || "Delete failed.");
    }
  };

  // Filtered Backgrounds
  const displayedBackgrounds = useMemo(() => {
    let all: (BackgroundItem & { categoryName: string; categorySlug: string; layoutKey: FocusTimerLayoutKey })[] = [];

    categories.forEach((cat) => {
      if (selectedCategorySlug === "all" || selectedCategorySlug === cat.slug) {
        cat.backgrounds.forEach((bg) => {
          all.push({
            ...bg,
            categoryName: cat.name,
            categorySlug: cat.slug,
            layoutKey: cat.layoutKey,
          });
        });
      }
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      all = all.filter(
        (bg) =>
          bg.name.toLowerCase().includes(q) ||
          bg.categoryName.toLowerCase().includes(q) ||
          bg.layoutKey.toLowerCase().includes(q)
      );
    }

    if (filterActiveState === "active") {
      all = all.filter((bg) => bg.isActive);
    } else if (filterActiveState === "inactive") {
      all = all.filter((bg) => !bg.isActive);
    }

    return all;
  }, [categories, selectedCategorySlug, searchQuery, filterActiveState]);

  // Aggregate Stats
  const stats = useMemo(() => {
    const totalCategories = categories.length;
    let totalBgs = 0;
    let activeBgs = 0;
    categories.forEach((c) => {
      totalBgs += c.backgrounds.length;
      activeBgs += c.backgrounds.filter((b) => b.isActive).length;
    });
    return { totalCategories, totalBgs, activeBgs };
  }, [categories]);

  // ── Access Control Guard ─────────────────────────────────────────
  if (!authLoading && (!user || !user.isAdmin)) {
    return (
      <div className="min-h-screen bg-bg-abyss text-text-primary flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-bg-panel border border-red-500/20 rounded-2xl p-8 text-center shadow-card dark:shadow-2xl backdrop-blur-xl">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-text-primary tracking-wide mb-2">Restricted Access</h1>
          <p className="text-sm text-text-muted leading-relaxed mb-6">
            The Focus Background Studio is an internal management surface reserved for authorized Sylf administrators.
          </p>
          <div className="p-3 bg-slate-900/5 dark:bg-white/[0.03] border border-border-subtle rounded-xl text-xs text-text-muted mb-6 font-mono">
            Auth: {user?.email || "Anonymous"} • Role: {user?.isAdmin ? "Admin" : "Standard"}
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-semibold text-sm hover:brightness-110 transition-all shadow-lg shadow-amber-500/20"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-canvas text-text-primary pb-24">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-950/90 border border-emerald-500/30 text-emerald-300 shadow-2xl backdrop-blur-md text-sm animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Banner & Header */}
      <div className="border-b border-border-subtle bg-surface-1/95 backdrop-blur-xl sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary flex items-center gap-3">
                Studio
              </h1>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => openCategoryModal()}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-raised text-text-primary border border-border-subtle text-xs sm:text-sm font-medium transition-all cursor-pointer shadow-sm"
              >
                <FolderPlus className="w-4 h-4 text-text-muted" />
                New Category
              </button>
              <button
                onClick={() => {
                  resetUploadForm();
                  setIsUploadModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Upload Background
              </button>
            </div>
          </div>

          {/* Quick Telemetry Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-border-subtle">
            <div className="px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle shadow-sm">
              <div className="text-[11px] uppercase tracking-wider text-text-muted font-bold">Categories</div>
              <div className="text-lg font-bold text-text-primary mt-0.5">{stats.totalCategories}</div>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle shadow-sm">
              <div className="text-[11px] uppercase tracking-wider text-text-muted font-bold">Total Wallpapers</div>
              <div className="text-lg font-bold text-text-primary mt-0.5">{stats.totalBgs}</div>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle shadow-sm">
              <div className="text-[11px] uppercase tracking-wider text-text-muted font-bold">Active in Catalog</div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.activeBgs}</div>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle flex items-center justify-between shadow-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-text-muted font-bold">Storage Bucket</div>
                <div className="text-xs font-mono font-semibold text-amber-700 dark:text-amber-300 mt-0.5">focus-backgrounds</div>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Category Pills & Subnav */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-border-subtle">
          {/* Scrollable category tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategorySlug("all")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer shadow-sm ${
                selectedCategorySlug === "all"
                  ? "bg-amber-500 text-black shadow-md shadow-amber-500/20 font-semibold border border-amber-400"
                  : "bg-surface-1 text-text-secondary hover:text-text-primary border border-border-subtle hover:border-amber-500/40"
              }`}
            >
              All Categories ({stats.totalBgs})
            </button>
            {categories.map((cat) => {
              const isSelected = selectedCategorySlug === cat.slug;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategorySlug(cat.slug)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 flex items-center gap-2 cursor-pointer shadow-sm ${
                    isSelected
                      ? "bg-amber-500 text-black shadow-md shadow-amber-500/20 font-semibold border border-amber-400"
                      : "bg-surface-1 text-text-secondary hover:text-text-primary border border-border-subtle hover:border-amber-500/40"
                  }`}
                >
                  <span>{cat.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                      isSelected ? "bg-black/20 text-black font-bold" : "bg-surface-2 text-text-muted"
                    }`}
                  >
                    {cat.backgrounds.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* If single category selected, show category edit/delete button */}
          {selectedCategorySlug !== "all" && (
            <div className="flex items-center gap-2 shrink-0">
              {(() => {
                const currentCat = categories.find((c) => c.slug === selectedCategorySlug);
                if (!currentCat) return null;
                return (
                  <>
                    <div className="text-xs text-text-muted flex items-center gap-1.5 mr-2">
                      <span className="font-mono text-amber-600 dark:text-amber-400 text-[11px] bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        layout: {currentCat.layoutKey}
                      </span>
                    </div>
                    <button
                      onClick={() => openCategoryModal(currentCat)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-surface-2 hover:bg-surface-raised text-text-secondary hover:text-text-primary border border-border-subtle flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Category
                    </button>
                    {currentCat.slug !== "classic-sylf" && (
                      <button
                        onClick={() => handleDeleteCategory(currentCat)}
                        className="px-2.5 py-1 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 flex items-center gap-1.5 transition-all border border-red-500/20 cursor-pointer"
                        title="Delete category and purge all its storage files"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Search & Status Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search backgrounds or layout..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-surface-1 border border-border-subtle text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-amber-500/50 shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <div className="flex items-center bg-surface-2 border border-border-subtle rounded-xl p-1 text-xs text-text-secondary shadow-sm">
              <button
                onClick={() => setFilterActiveState("all")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterActiveState === "all" ? "bg-surface-1 text-text-primary font-semibold shadow-sm" : "text-text-muted hover:text-text-primary"
                }`}
              >
                All ({displayedBackgrounds.length})
              </button>
              <button
                onClick={() => setFilterActiveState("active")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterActiveState === "active" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold shadow-sm" : "text-text-muted hover:text-text-primary"
                }`}
              >
                Active Only
              </button>
              <button
                onClick={() => setFilterActiveState("inactive")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  filterActiveState === "inactive" ? "bg-slate-500/20 text-slate-700 dark:text-slate-300 font-semibold shadow-sm" : "text-text-muted hover:text-text-primary"
                }`}
              >
                Disabled
              </button>
            </div>
          </div>
        </div>

        {/* Background Cards Grid */}
        {loading ? (
          <div className="py-24 text-center">
            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
            <p className="text-sm text-text-muted">Loading background catalog...</p>
          </div>
        ) : displayedBackgrounds.length === 0 ? (
          <div className="py-20 text-center rounded-2xl bg-surface-1 border border-border-subtle p-8 max-w-xl mx-auto shadow-card">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 dark:text-amber-400 mx-auto mb-4">
              <ImageIcon className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-1">No backgrounds uploaded yet</h3>
            <p className="text-xs text-text-muted max-w-sm mx-auto mb-6">
              {searchQuery
                ? "No backgrounds matched your search filter."
                : "Add high-resolution (16:9) artwork to start building the official Focus Timer collection."}
            </p>
            <button
              onClick={() => {
                resetUploadForm();
                setIsUploadModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-semibold hover:brightness-110 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Upload First Background
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {displayedBackgrounds.map((bg, idx) => {
              const isDeleting = deletingBgId === bg.id;
              return (
                <div
                  key={bg.id}
                  className={`group relative rounded-2xl bg-surface-1 border border-border-subtle overflow-hidden transition-all duration-200 hover:border-amber-500/40 shadow-card hover:shadow-lg flex flex-col ${
                    !bg.isActive ? "opacity-60" : ""
                  }`}
                >
                  {/* Image 16:9 Canvas */}
                  <div className="relative aspect-video w-full bg-surface-2 overflow-hidden select-none">
                    <img
                      src={bg.publicUrl}
                      alt={bg.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />

                    {/* Gradient Vignette overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

                    {/* Top Badges */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md backdrop-blur-md border ${
                          bg.isActive
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : "bg-slate-700/60 text-slate-300 border-slate-600/50"
                        }`}
                      >
                        {bg.isActive ? "Active" : "Disabled"}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-black/60 text-slate-300 border border-white/10 backdrop-blur-md">
                          {bg.width}×{bg.height}
                        </span>
                        <button
                          onClick={() => setLightboxUrl(bg.publicUrl)}
                          className="pointer-events-auto p-1.5 rounded-md bg-black/60 text-slate-300 hover:text-white hover:bg-black/80 border border-white/10 backdrop-blur-md transition-all cursor-pointer"
                          title="View Full Resolution"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Reorder Buttons (within category) */}
                    <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 p-1 rounded-lg border border-white/10 backdrop-blur-md">
                      <button
                        onClick={() => handleReorder(bg.categoryId, bg.id, "up")}
                        className="p-1 text-slate-300 hover:text-white hover:bg-white/10 rounded transition-all cursor-pointer"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleReorder(bg.categoryId, bg.id, "down")}
                        className="p-1 text-slate-300 hover:text-white hover:bg-white/10 rounded transition-all cursor-pointer"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Body Info */}
                  <div className="p-4 flex-1 flex flex-col justify-between bg-surface-1">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h4 className="text-sm font-semibold text-text-primary tracking-wide truncate" title={bg.name}>
                          {bg.name}
                        </h4>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-300 border border-sky-500/20">
                            timer: {bg.timerPosition || "auto"}
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/20">
                            {bg.layoutKey}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-text-muted mb-3">
                        <span className="text-text-secondary font-medium">{bg.categoryName}</span>
                        <span>•</span>
                        <span className="font-mono text-text-muted">order #{bg.sortOrder}</span>
                        <span>•</span>
                        <span className="font-mono text-text-muted">{bg.aspectRatio.toFixed(2)}:1</span>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="pt-3 border-t border-border-subtle flex items-center justify-between">
                      {/* Toggle Active Button */}
                      <button
                        onClick={() => handleToggleBackgroundActive(bg)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer ${
                          bg.isActive
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                            : "bg-surface-2 text-text-muted border-border-subtle hover:bg-surface-raised hover:text-text-primary"
                        }`}
                      >
                        <Check className={`w-3.5 h-3.5 ${bg.isActive ? "opacity-100" : "opacity-40"}`} />
                        {bg.isActive ? "Active" : "Disabled"}
                      </button>

                      {/* Right Action Icons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEditBackgroundModal(bg)}
                          className="p-1.5 rounded-lg bg-surface-2 hover:bg-surface-raised text-text-secondary hover:text-text-primary border border-border-subtle transition-all cursor-pointer shadow-sm"
                          title="Edit Details & Timer Placement"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setReplacingBackground(bg);
                            setReplaceFile(null);
                            setReplacePreviewUrl(null);
                            setReplaceTelemetry(null);
                            setReplaceError(null);
                          }}
                          className="p-1.5 rounded-lg bg-surface-2 hover:bg-surface-raised text-text-secondary hover:text-text-primary border border-border-subtle transition-all cursor-pointer shadow-sm"
                          title="Replace Image Asset"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteBackground(bg.id)}
                          disabled={isDeleting}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/20 transition-all disabled:opacity-40 cursor-pointer"
                          title="Delete from Catalog & Storage"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── UPLOAD MODAL ─────────────────────────────────────────── */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-surface-1 border border-border-subtle rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-card p-6 relative">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-border-subtle">
              <div>
                <h3 className="text-lg font-bold text-text-primary">Upload Focus Background</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Official high-resolution 16:9 desktop background for Sylf Focus Timer.
                </p>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1.5 rounded-lg bg-surface-2 text-text-muted hover:text-text-primary hover:bg-surface-raised cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {uploadError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* File Dropzone / Selector */}
              {!uploadPreviewUrl ? (
                <label className="border-2 border-dashed border-border-subtle hover:border-amber-500/50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer bg-surface-2/50 hover:bg-surface-2 transition-all group">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-semibold text-text-primary mb-1">Select wallpaper image</span>
                  <span className="text-xs text-text-muted text-center max-w-md leading-relaxed">
                    Static PNG, JPEG, or WebP • Recommended: 2560×1440 (16:9) • Production target: 1920×1080+ • Technical upload min: 1280×720 (Max 15MB)
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleUploadFileChange}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="space-y-3">
                  {/* 16:9 Preview Canvas with Interactive Focal Point */}
                  <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black/60 border border-border-subtle group">
                    <img
                      src={uploadPreviewUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />

                    {/* Approximate Cross-Device Safe Zone Frame (Guidance only) */}
                    <div
                      className="absolute inset-[5%] border border-dashed border-white/20 pointer-events-none rounded-lg z-0"
                      title="Approximate cross-device safe frame (guidance only): keep essential character/subject detail inside this zone"
                    >
                      <span className="absolute top-1 left-1.5 text-[8px] font-mono uppercase tracking-widest text-white/40">
                        Safe Frame (approx)
                      </span>
                    </div>

                    {/* Interactive Focal Click Target */}
                    <div
                      onClick={handleFocalClick}
                      className="absolute inset-0 cursor-crosshair bg-black/10 hover:bg-black/20 transition-colors"
                      title="Click anywhere to set focus center"
                    >
                      {/* Focal Point Indicator Dot */}
                      <div
                        className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-amber-400 bg-amber-500/30 flex items-center justify-center pointer-events-none transition-all shadow-lg"
                        style={{
                          left: `${uploadFocalX * 100}%`,
                          top: `${uploadFocalY * 100}%`,
                        }}
                      >
                        <Crosshair className="w-3.5 h-3.5 text-amber-300" />
                      </div>
                    </div>

                    {/* Timer Safe Zone Overlay Preview */}
                    {renderSafeZoneOverlay(uploadTimerPosition, uploadFocalX)}

                    <button
                      type="button"
                      onClick={() => {
                        if (uploadPreviewUrl) {
                          URL.revokeObjectURL(uploadPreviewUrl);
                        }
                        setUploadFile(null);
                        setUploadPreviewUrl(null);
                        setUploadTelemetry(null);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-slate-300 hover:text-white hover:bg-black border border-white/10 z-10 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Telemetry Pills */}
                  {uploadTelemetry && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2.5 py-1 rounded-lg bg-surface-2 border border-border-subtle text-text-primary font-mono">
                        {uploadTelemetry.width} × {uploadTelemetry.height}
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg border flex items-center gap-1 font-medium ${
                          uploadTelemetry.isRecommended16x9
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                        }`}
                      >
                        {uploadTelemetry.isRecommended16x9 ? (
                          <span className="flex items-center gap-1"><Check className="w-3 h-3" /> 16:9 Aspect Ratio</span>
                        ) : (
                          `Aspect Ratio: ${uploadTelemetry.aspectRatio}:1`
                        )}
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg border ${
                          uploadTelemetry.isValidResolution
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                            : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20"
                        }`}
                      >
                        {uploadTelemetry.isValidResolution ? (
                          <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Resolution OK</span>
                        ) : (
                          <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" /> Low Resolution (&lt;720p)</span>
                        )}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-surface-2 border border-border-subtle text-text-muted font-mono">
                        {(uploadTelemetry.sizeBytes / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  )}
                  <p className="text-[11px] text-text-muted flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                    <span>Click the preview above to reposition the visual focal point (currently: {uploadFocalX.toFixed(2)}, {uploadFocalY.toFixed(2)}).</span>
                  </p>
                </div>
              )}

              {/* Display Name */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Midnight Scholar Sanctum"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-amber-500/50"
                  required
                />
                {isDuplicateUploadName && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Notice: A wallpaper named &quot;{uploadName.trim()}&quot; already exists in this category. (Informational warning)</span>
                  </p>
                )}
              </div>

              {/* Category Select */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <select
                  value={uploadCategoryId}
                  onChange={(e) => setUploadCategoryId(parseInt(e.target.value, 10))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-amber-500/50"
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (layout: {c.layoutKey})
                    </option>
                  ))}
                </select>
              </div>

              {/* Timer Position Select */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                  Timer Docking Alignment (timerPosition)
                </label>
                <select
                  value={uploadTimerPosition}
                  onChange={(e) => {
                    if (isValidTimerPosition(e.target.value)) {
                      setUploadTimerPosition(e.target.value);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-amber-500/50"
                >
                  {VALID_TIMER_POSITIONS.map((pos) => {
                    const item = TIMER_POSITION_REGISTRY[pos];
                    return (
                      <option key={pos} value={pos}>
                        {item.label}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-text-muted mt-1">
                  {TIMER_POSITION_REGISTRY[uploadTimerPosition]?.description}
                </p>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-border-subtle flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-2 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !uploadFile}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 text-black text-xs font-semibold disabled:opacity-40 flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Uploading to Storage...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      Save & Publish
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── REPLACE IMAGE MODAL ──────────────────────────────────── */}
      {replacingBackground && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-surface-1 border border-border-subtle rounded-2xl w-full max-w-lg p-6 relative shadow-card">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border-subtle">
              <div>
                <h3 className="text-base font-bold text-text-primary">Replace Image Asset</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Replacing asset for <span className="text-text-primary font-medium">"{replacingBackground.name}"</span>
                </p>
              </div>
              <button
                onClick={handleCloseReplaceModal}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {replaceError && (
              <div className="mb-4 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{replaceError}</span>
              </div>
            )}

            <form onSubmit={handleReplaceSubmit} className="space-y-4">
              {/* Current vs New */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] text-text-muted uppercase font-semibold block mb-1">Current</span>
                  <div className="aspect-video rounded-lg overflow-hidden bg-surface-2 border border-border-subtle">
                    <img
                      src={replacingBackground.publicUrl}
                      alt="Current"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-text-muted uppercase font-semibold block mb-1">New Replacement</span>
                  <div className="aspect-video rounded-lg overflow-hidden bg-surface-2 border border-dashed border-border-subtle flex items-center justify-center">
                    {replacePreviewUrl ? (
                      <img
                        src={replacePreviewUrl}
                        alt="New"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-text-muted text-center px-2">No file chosen</span>
                    )}
                  </div>
                </div>
              </div>

              {/* File Input */}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleReplaceFileChange}
                className="w-full text-xs text-text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-500 file:text-black hover:file:brightness-110 cursor-pointer"
                required
              />

              {replaceTelemetry && (
                <div className="p-2.5 rounded-lg bg-surface-2 border border-border-subtle text-xs text-text-secondary space-y-1">
                  <div>Detected: <span className="font-mono text-text-primary">{replaceTelemetry.width}×{replaceTelemetry.height}</span> ({replaceTelemetry.aspectRatio}:1)</div>
                  <div className={replaceTelemetry.isRecommended16x9 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                    {replaceTelemetry.isRecommended16x9 ? (
                      <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> 16:9 Aspect Ratio</span>
                    ) : (
                      <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Non-standard ratio</span>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-border-subtle flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseReplaceModal}
                  className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReplacing || !replaceFile}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold hover:brightness-110 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                >
                  {isReplacing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Replace Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── EDIT BACKGROUND MODAL ─────────────────────────────────── */}
      {editingBackground && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-surface-1 border border-border-subtle rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-card p-6 relative">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-border-subtle">
              <div>
                <h3 className="text-lg font-bold text-text-primary">Edit Focus Background Settings</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Adjust display name, visual focal point, and timer placement layout dock.
                </p>
              </div>
              <button
                onClick={() => setEditingBackground(null)}
                className="p-1.5 rounded-lg bg-surface-2 text-text-muted hover:text-text-primary hover:bg-surface-raised cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditBackgroundSubmit} className="space-y-4">
              {/* Interactive 16:9 Canvas Preview */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Interactive Artwork & Safe Zone Preview
                </span>
                <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black/60 border border-border-subtle group">
                  <img
                    src={editingBackground.publicUrl}
                    alt={editingBackground.name}
                    className="w-full h-full object-cover"
                  />

                  {/* Interactive Focal Click Target */}
                  <div
                    onClick={handleEditFocalClick}
                    className="absolute inset-0 cursor-crosshair bg-black/10 hover:bg-black/20 transition-colors"
                    title="Click anywhere to reposition focal point"
                  >
                    {/* Focal Point Indicator Dot */}
                    <div
                      className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-amber-400 bg-amber-500/30 flex items-center justify-center pointer-events-none transition-all shadow-lg"
                      style={{
                        left: `${editFocalX * 100}%`,
                        top: `${editFocalY * 100}%`,
                      }}
                    >
                      <Crosshair className="w-3.5 h-3.5 text-amber-300" />
                    </div>
                  </div>

                  {/* Timer Safe Zone Overlay Preview */}
                  {renderSafeZoneOverlay(editTimerPosition, editFocalX)}
                </div>

                <div className="flex items-center justify-between text-[11px] text-text-muted">
                  <span className="flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                    <span>Click artwork to adjust focal point (X: {editFocalX.toFixed(2)}, Y: {editFocalY.toFixed(2)})</span>
                  </span>
                  <span className="font-mono text-text-muted">
                    {editingBackground.width}×{editingBackground.height} • {editingBackground.aspectRatio.toFixed(2)}:1
                  </span>
                </div>
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-amber-500/50"
                  required
                />
              </div>

              {/* Timer Position Select */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                  Timer Docking Alignment (timerPosition)
                </label>
                <select
                  value={editTimerPosition}
                  onChange={(e) => {
                    if (isValidTimerPosition(e.target.value)) {
                      setEditTimerPosition(e.target.value);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-amber-500/50"
                >
                  {VALID_TIMER_POSITIONS.map((pos) => {
                    const item = TIMER_POSITION_REGISTRY[pos];
                    return (
                      <option key={pos} value={pos}>
                        {item.label}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-text-muted mt-1">
                  {TIMER_POSITION_REGISTRY[editTimerPosition]?.description}
                </p>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-border-subtle flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingBackground(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-2 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 text-black text-xs font-semibold disabled:opacity-40 flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  {isSavingEdit ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving Changes...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── CATEGORY CREATE / EDIT MODAL ─────────────────────────── */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-surface-1 border border-border-subtle rounded-2xl w-full max-w-md p-6 relative shadow-card">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border-subtle">
              <div>
                <h3 className="text-base font-bold text-text-primary">
                  {editingCategory ? `Edit "${editingCategory.name}"` : "New Category"}
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Configure collection and map to its timer layout presentation key.
                </p>
              </div>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {categoryError && (
              <div className="mb-4 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{categoryError}</span>
              </div>
            )}

            <form onSubmit={handleCategorySubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fantasy Sanctums"
                  value={categoryName}
                  onChange={(e) => {
                    setCategoryName(e.target.value);
                    if (!editingCategory) {
                      setCategorySlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-amber-500/50"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  Slug (Folder in Storage)
                </label>
                <input
                  type="text"
                  placeholder="e.g. fantasy"
                  value={categorySlug}
                  onChange={(e) => setCategorySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]+/g, "-"))}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono text-amber-600 dark:text-amber-300 placeholder:text-text-muted focus:outline-none focus:border-amber-500/50"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  Timer Layout Key (Safety Registry)
                </label>
                <select
                  value={categoryLayoutKey}
                  onChange={(e) => {
                    if (isValidLayoutKey(e.target.value)) {
                      setCategoryLayoutKey(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-amber-500/50"
                >
                  {VALID_LAYOUT_KEYS.map((key) => {
                    const reg = LAYOUT_KEY_REGISTRY[key];
                    return (
                      <option key={key} value={key}>
                        {reg.label} ({key})
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-text-muted mt-1">
                  {LAYOUT_KEY_REGISTRY[categoryLayoutKey]?.description}
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Atmospheric summary of this collection..."
                  value={categoryDescription}
                  onChange={(e) => setCategoryDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="catActive"
                  checked={categoryIsActive}
                  onChange={(e) => setCategoryIsActive(e.target.checked)}
                  className="rounded border-border-subtle bg-white/5 text-amber-500 focus:ring-0"
                />
                <label htmlFor="catActive" className="text-xs text-text-secondary cursor-pointer">
                  Active in Catalog (Visible to users)
                </label>
              </div>

              <div className="pt-3 border-t border-border-subtle flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold hover:brightness-110 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                >
                  {isSavingCategory && <RefreshCw className="w-3 h-3 animate-spin" />}
                  {editingCategory ? "Save Changes" : "Create Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── LIGHTBOX MODAL ───────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-150 cursor-zoom-out"
        >
          <div className="relative max-w-6xl max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl border border-border-subtle dark:border-white/10">
            <img src={lightboxUrl} alt="Fullscreen View" className="w-full h-full object-contain" />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-3 right-3 p-2 rounded-xl bg-black/70 text-white border border-white/20 hover:bg-black"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
