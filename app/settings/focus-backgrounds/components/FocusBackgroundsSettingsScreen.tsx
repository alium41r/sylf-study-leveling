"use client";

/* eslint-disable @next/next/no-img-element -- Official assets and expiring signed URLs use the existing direct image delivery flow. */
import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  Eye,
  Image as ImageIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { AppearanceHubLayout } from "../../components/AppearanceHubLayout";
import { AppearanceDialog } from "../../components/AppearanceDialog";
import { HubState } from "../../components/MainHubLayout";
import { useAuth } from "@/app/components/AuthProvider";
import { useFocusBackground } from "@/app/focus/hooks/useFocusBackground";
import { FocusTimerLayoutPreview } from "@/app/focus/components/FocusTimerLayoutPreview";
import {
  CANONICAL_CLASSIC_SLUG,
  type FocusBackgroundClient,
} from "@/lib/focus-background-client";
import {
  normalizeLayoutKey,
  type FocusTimerLayoutKey,
  type FocusTimerPosition,
  type UserFocusBackgroundClient,
} from "@/lib/focus-background-types";
import { BackdropEditor, broadcastBackdropChange } from "./BackdropEditor";
import hub from "../../components/MainHub.module.css";
import styles from "./Backdrops.module.css";

interface BackdropChoice {
  key: string;
  name: string;
  source: "classic" | "official" | "custom";
  category: string;
  categorySlug: string;
  url: string | null;
  layout: FocusTimerLayoutKey;
  position: FocusTimerPosition;
  focalX: number;
  focalY: number;
  width?: number;
  height?: number;
  official?: FocusBackgroundClient;
  custom?: UserFocusBackgroundClient;
}

export function FocusBackgroundsSettingsScreen() {
  const { user } = useAuth();
  const environment = useFocusBackground();
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [source, setSource] = useState<"discover" | "library">("discover");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [showTimer, setShowTimer] = useState(true);
  const [editor, setEditor] = useState<
    "upload" | UserFocusBackgroundClient | null
  >(null);
  const [deleting, setDeleting] = useState<UserFocusBackgroundClient | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const classic: BackdropChoice = {
    key: "classic",
    name: "Classic Sylf",
    source: "classic",
    category: "Sylf original",
    categorySlug: CANONICAL_CLASSIC_SLUG,
    url: null,
    layout: "classic",
    position: "center",
    focalX: 0.5,
    focalY: 0.5,
  };
  const official: BackdropChoice[] = environment.catalog.categories.flatMap(
    (group) =>
      group.backgrounds.map((background) => ({
        key: `official:${background.id}`,
        name: background.name,
        source: "official" as const,
        category: group.name,
        categorySlug: group.slug,
        url: background.publicUrl,
        layout: normalizeLayoutKey(group.layoutKey),
        position: background.timerPosition,
        focalX: background.focalX,
        focalY: background.focalY,
        width: background.width,
        height: background.height,
        official: background,
      }))
  );
  const personal: BackdropChoice[] = environment.customBackgrounds.map(
    (background) => ({
      key: `custom:${background.id}`,
      name: background.name,
      source: "custom",
      category: "Your library",
      categorySlug: "custom",
      url: background.signedUrl,
      layout: normalizeLayoutKey(background.layoutKey),
      position: background.timerPosition,
      focalX: background.focalX ?? 0.5,
      focalY: background.focalY ?? 0.5,
      width: background.width,
      height: background.height,
      custom: background,
    })
  );
  const choices = [classic, ...official, ...personal];
  const activeKey =
    environment.activeSource === "custom"
      ? `custom:${environment.activeCustomBackground?.id}`
      : environment.activeSource === "official"
        ? `official:${environment.activeBackground?.id}`
        : "classic";
  const active = choices.find((item) => item.key === activeKey) ?? classic;
  const preview = choices.find((item) => item.key === previewKey) ?? active;
  const groups = environment.catalog.categories.filter(
    (group) => group.backgrounds.length > 0
  );
  const list = (
    source === "library" ? personal : [classic, ...official]
  ).filter(
    (item) =>
      (source !== "discover" ||
        category === "all" ||
        item.categorySlug === category) &&
      `${item.name} ${item.category}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  );
  const quota = environment.customBackgroundQuota;
  const full = quota ? quota.used >= quota.max : false;
  const pending = environment.isPreloadingImage || isDeleting;
  const imageFailed = Boolean(preview.url && brokenUrl === preview.url);
  const apply = async () => {
    if (pending) return;
    setNotice("");
    const success =
      preview.source === "custom" && preview.custom
        ? await environment.selectCustomBackground(preview.custom)
        : await environment.selectBackground(
            preview.categorySlug,
            preview.official ?? null
          );
    if (success) setNotice(`${preview.name} is now your timer backdrop.`);
  };
  const remove = async () => {
    if (!deleting || isDeleting) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(
        `/api/user/focus-backgrounds/${deleting.id}`,
        { method: "DELETE" }
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "This backdrop couldn’t be deleted.");
      if (
        environment.activeSource === "custom" &&
        environment.activeCustomBackground?.id === deleting.id
      )
        await environment.selectBackground(CANONICAL_CLASSIC_SLUG, null);
      broadcastBackdropChange("BACKGROUND_DELETED", deleting.id);
      await environment.refreshCustomBackgrounds();
      if (previewKey === `custom:${deleting.id}`) setPreviewKey(null);
      setNotice(`“${deleting.name}” was removed from your library.`);
      setDeleting(null);
    } catch (reason) {
      setDeleteError(
        reason instanceof Error
          ? reason.message
          : "Connection lost. Please try again."
      );
    } finally {
      setIsDeleting(false);
    }
  };
  return (
    <AppearanceHubLayout title="Backdrops">
      <div className={styles.intro}>
        <div>
          <h2>A space for your next session.</h2>
          <p>Find a scene that helps you settle in.</p>
        </div>
        <button
          className={hub.secondaryButton}
          disabled={!user || !quota || full}
          onClick={() => setEditor("upload")}
        >
          <Plus size={15} />
          Add backdrop
        </button>
      </div>
      {(environment.loadError || environment.syncError) && (
        <p className={styles.notice} role="alert">
          {environment.loadError || environment.syncError}
        </p>
      )}
      {environment.isLoadingCatalog ? (
        <HubState loading title="Opening your backdrops…" />
      ) : (
        <section className={styles.hero} aria-label="Backdrop preview">
          <div
            className={`${styles.artwork} ${preview.source === "classic" ? styles.classic : ""}`}
          >
            {preview.url && !imageFailed ? (
              <img
                src={preview.url}
                alt={preview.name}
                onError={() => setBrokenUrl(preview.url)}
                style={{
                  objectPosition: `${preview.focalX * 100}% ${preview.focalY * 100}%`,
                }}
                decoding="async"
              />
            ) : preview.source !== "classic" ? (
              <div className={styles.imageUnavailable}>
                <ImageIcon size={30} strokeWidth={1.3} />
                <span>Preview unavailable</span>
                {preview.source === "custom" ? (
                  <button
                    className={hub.secondaryButton}
                    disabled={environment.isLoadingCustomBackgrounds}
                    onClick={() => {
                      void environment.refreshCustomBackgrounds();
                    }}
                  >
                    Reload library
                  </button>
                ) : (
                  <small>Try another backdrop or reload this page.</small>
                )}
              </div>
            ) : (
              <div className={styles.classicAura} aria-hidden="true" />
            )}
            {showTimer &&
              !imageFailed &&
              (preview.source === "classic" || preview.url) && (
                <FocusTimerLayoutPreview
                  layoutKey={preview.layout}
                  timerPosition={preview.position}
                  focalX={preview.focalX}
                  focalY={preview.focalY}
                  subjectName="Your study session"
                />
              )}
            <span className={styles.previewBadge}>Timer preview</span>
            <button
              className={styles.previewToggle}
              type="button"
              aria-pressed={showTimer}
              onClick={() => setShowTimer((value) => !value)}
            >
              <Eye size={14} />
              {showTimer ? "Hide timer" : "Show timer"}
            </button>
          </div>
          <div className={styles.sceneInfo}>
            <span className={styles.categoryLabel}>{preview.category}</span>
            <h2>{preview.name}</h2>
            {preview.key === activeKey && (
              <span className={`${hub.pill} ${hub.accentPill}`}>
                <Check size={11} />
                Current backdrop
              </span>
            )}
            <dl>
              <div>
                <dt>Timer style</dt>
                <dd>
                  {preview.layout[0].toUpperCase() + preview.layout.slice(1)}
                </dd>
              </div>
              <div>
                <dt>Placement</dt>
                <dd>
                  {preview.position === "auto"
                    ? "Automatic"
                    : preview.position[0].toUpperCase() +
                      preview.position.slice(1)}
                </dd>
              </div>
              {preview.width && (
                <div>
                  <dt>Image</dt>
                  <dd>
                    {preview.width} × {preview.height}
                  </dd>
                </div>
              )}
            </dl>
            <div className={styles.sceneActions}>
              <button
                className={hub.primaryButton}
                disabled={
                  pending ||
                  preview.key === activeKey ||
                  (preview.source !== "classic" &&
                    (!preview.url || imageFailed))
                }
                onClick={() => {
                  void apply();
                }}
              >
                {environment.isPreloadingImage ? (
                  "Loading image…"
                ) : preview.key === activeKey ? (
                  <>
                    <Check size={14} />
                    In use
                  </>
                ) : (
                  "Use backdrop"
                )}
              </button>
              {preview.custom && (
                <div>
                  <button
                    className={hub.secondaryButton}
                    disabled={pending}
                    onClick={() => setEditor(preview.custom!)}
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                  <button
                    className={styles.deleteButton}
                    disabled={pending}
                    aria-label={`Delete ${preview.name}`}
                    onClick={() => {
                      setDeleteError("");
                      setDeleting(preview.custom!);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
            <Link href="/timer" className={hub.textLink}>
              Open timer
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </section>
      )}
      {notice && (
        <p role="status" className={styles.selectionStatus}>
          {notice}
        </p>
      )}
      <section className={styles.library} aria-label="Backdrop gallery">
        <div className={styles.libraryToolbar}>
          <div className={hub.segmented} aria-label="Backdrop source">
            <button
              type="button"
              aria-pressed={source === "discover"}
              onClick={() => {
                setSource("discover");
                setQuery("");
              }}
            >
              Discover
            </button>
            <button
              type="button"
              aria-pressed={source === "library"}
              onClick={() => {
                setSource("library");
                setQuery("");
              }}
            >
              Your library{quota && <small>{quota.used}</small>}
            </button>
          </div>
          <label className={styles.search}>
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search backdrops"
              placeholder="Find a backdrop"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        {source === "discover" && groups.length > 1 && (
          <div className={styles.categories} aria-label="Backdrop categories">
            <button
              aria-pressed={category === "all"}
              onClick={() => setCategory("all")}
            >
              All scenes
            </button>
            {groups.map((group) => (
              <button
                key={group.slug}
                aria-pressed={category === group.slug}
                onClick={() => setCategory(group.slug)}
              >
                {group.name}
              </button>
            ))}
          </div>
        )}
        {source === "library" && (
          <div className={styles.quota}>
            <p>
              {quota ? (
                <>
                  {quota.used} of {quota.max} backdrops
                  <span>
                    {full
                      ? "Library full. Remove a backdrop to add another."
                      : quota.max - quota.used <= 2
                        ? `${quota.max - quota.used} ${quota.max - quota.used === 1 ? "space" : "spaces"} remaining`
                        : "Your images, private to your account."}
                  </span>
                </>
              ) : (
                "Your personal backdrops"
              )}
            </p>
            {quota && (
              <div
                role="meter"
                aria-label="Personal backdrop storage"
                aria-valuenow={quota.used}
                aria-valuemin={0}
                aria-valuemax={quota.max}
              >
                <span
                  style={{
                    width: `${Math.min(100, (quota.used / Math.max(1, quota.max)) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
        {source === "library" && !user ? (
          <HubState title="Your own space to focus">
            <Link href="/login" className={hub.textLink}>
              Sign in to add your images
            </Link>
          </HubState>
        ) : source === "library" && environment.customBackgroundsError ? (
          <HubState
            title="Your library is unavailable"
            onRetry={() => {
              void environment.refreshCustomBackgrounds();
            }}
          >
            {environment.customBackgroundsError}
          </HubState>
        ) : source === "library" && environment.isLoadingCustomBackgrounds ? (
          <HubState loading title="Loading your library…" />
        ) : list.length === 0 ? (
          <div className={styles.empty}>
            <ImageIcon size={31} strokeWidth={1.2} />
            <h3>
              {query ? "No matching backdrops" : "Bring your own atmosphere."}
            </h3>
            <p>
              {query
                ? "Try another name or category."
                : "Add a favorite place, a quiet landscape, or artwork you love."}
            </p>
            {query ? (
              <button
                className={hub.secondaryButton}
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                }}
              >
                Clear filters
              </button>
            ) : (
              <button
                className={hub.primaryButton}
                disabled={full || !quota}
                onClick={() => setEditor("upload")}
              >
                <Plus size={14} />
                Add your first backdrop
              </button>
            )}
          </div>
        ) : (
          <div className={styles.gallery}>
            {list.map((item) => (
              <button
                key={item.key}
                className={`${styles.thumbnail} ${item.key === preview.key ? styles.previewed : ""}`}
                aria-label={`Preview ${item.name}`}
                aria-pressed={item.key === preview.key}
                onClick={() => {
                  setPreviewKey(item.key);
                  setNotice("");
                  environment.clearLoadError();
                }}
              >
                <span
                  className={`${styles.thumbnailImage} ${item.source === "classic" ? styles.classic : ""}`}
                >
                  {item.url ? (
                    <>
                      <ImageIcon size={23} aria-hidden="true" />
                      <img
                        src={item.url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{
                          objectPosition: `${item.focalX * 100}% ${item.focalY * 100}%`,
                        }}
                        onError={(event) => {
                          event.currentTarget.style.visibility = "hidden";
                        }}
                        onLoad={(event) => {
                          event.currentTarget.style.visibility = "visible";
                        }}
                      />
                    </>
                  ) : item.source === "classic" ? (
                    <span className={styles.classicThumbnail}>
                      <ClockMark />
                    </span>
                  ) : (
                    <ImageIcon size={23} />
                  )}
                  {item.key === activeKey && (
                    <i className={styles.activeMark}>
                      <Check size={12} />
                    </i>
                  )}
                </span>
                <span className={styles.thumbnailCaption}>
                  <strong>{item.name}</strong>
                  <small>
                    {item.source === "custom" ? "Personal" : item.category}
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      {editor && (
        <BackdropEditor
          key={editor === "upload" ? "upload" : editor.id}
          background={editor === "upload" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={async (id) => {
            await environment.refreshCustomBackgrounds();
            setSource("library");
            setQuery("");
            setPreviewKey(`custom:${id}`);
          }}
        />
      )}
      {deleting && (
        <AppearanceDialog
          title="Delete backdrop?"
          onClose={() => setDeleting(null)}
          busy={isDeleting}
        >
          <div className={styles.deleteContent}>
            <p>
              “{deleting.name}” will be permanently removed from your personal
              library.
            </p>
            <span>
              {environment.activeSource === "custom" &&
              environment.activeCustomBackground?.id === deleting.id
                ? "Your timer will return to Classic Sylf."
                : "Your current timer backdrop will stay in place."}
            </span>
            {deleteError && (
              <p role="alert" className={styles.notice}>
                {deleteError}
              </p>
            )}
            <div className={styles.editorActions}>
              <button
                className={hub.secondaryButton}
                disabled={isDeleting}
                onClick={() => setDeleting(null)}
              >
                Keep backdrop
              </button>
              <button
                className={hub.primaryButton}
                disabled={isDeleting}
                onClick={() => {
                  void remove();
                }}
              >
                {isDeleting ? "Deleting…" : "Delete backdrop"}
              </button>
            </div>
          </div>
        </AppearanceDialog>
      )}
    </AppearanceHubLayout>
  );
}
function ClockMark() {
  return (
    <svg
      width="65"
      height="65"
      viewBox="0 0 65 65"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="32.5"
        cy="32.5"
        r="26"
        stroke="currentColor"
        strokeWidth=".8"
      />
      <circle
        cx="32.5"
        cy="32.5"
        r="19"
        stroke="currentColor"
        strokeWidth=".6"
        opacity=".4"
      />
      <path
        d="M32.5 18v15l9 5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
export default FocusBackgroundsSettingsScreen;
