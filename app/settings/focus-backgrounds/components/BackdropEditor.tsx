"use client";

/* eslint-disable @next/next/no-img-element -- Blob previews and short-lived signed image URLs are rendered directly. */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type FormEvent,
} from "react";
import { Crosshair, ImagePlus, Upload } from "lucide-react";
import { AppearanceDialog } from "../../components/AppearanceDialog";
import { FocusTimerLayoutPreview } from "@/app/focus/components/FocusTimerLayoutPreview";
import {
  LAYOUT_KEY_REGISTRY,
  VALID_LAYOUT_KEYS,
  VALID_TIMER_POSITIONS,
  type FocusTimerLayoutKey,
  type FocusTimerPosition,
  type UserFocusBackgroundClient,
} from "@/lib/focus-background-types";
import hub from "../../components/MainHub.module.css";
import styles from "./Backdrops.module.css";

export function broadcastBackdropChange(
  type: "BACKGROUND_UPDATED" | "BACKGROUND_DELETED",
  backgroundId: number
) {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel("sylf-focus-background-sync");
    channel.postMessage({ type, backgroundId });
    channel.close();
  } catch {
    /* Existing polling and tab-focus synchronization remain available. */
  }
}

export function BackdropEditor({
  background,
  onClose,
  onSaved,
}: {
  background?: UserFocusBackgroundClient;
  onClose: () => void;
  onSaved: (id: number) => Promise<void>;
}) {
  const [name, setName] = useState(background?.name ?? "");
  const [focalX, setFocalX] = useState(background?.focalX ?? 0.5);
  const [focalY, setFocalY] = useState(background?.focalY ?? 0.5);
  const [position, setPosition] = useState<FocusTimerPosition>(
    background?.timerPosition ?? "auto"
  );
  const [layout, setLayout] = useState<FocusTimerLayoutKey>(
    background?.layoutKey ?? "classic"
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const generation = useRef(0);
  const pendingUrl = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      generation.current++;
      if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current);
    },
    []
  );
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  const selectFile = (next: File) => {
    const request = ++generation.current;
    setError("");
    setFile(null);
    setPreviewUrl(null);
    setDimensions(null);
    setDecoding(false);
    if (pendingUrl.current) {
      URL.revokeObjectURL(pendingUrl.current);
      pendingUrl.current = null;
    }
    if (next.type === "image/gif" || next.name.toLowerCase().endsWith(".gif")) {
      setError("GIFs aren’t supported. Choose a static JPEG, PNG, or WebP.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setError("Your image must be 10 MB or smaller.");
      return;
    }
    const url = URL.createObjectURL(next);
    pendingUrl.current = url;
    setDecoding(true);
    const image = new Image();
    const fail = (message: string) => {
      URL.revokeObjectURL(url);
      if (request === generation.current) {
        pendingUrl.current = null;
        setDecoding(false);
        setError(message);
      }
    };
    image.onload = () => {
      if (request !== generation.current) {
        URL.revokeObjectURL(url);
        return;
      }
      const width = image.naturalWidth,
        height = image.naturalHeight;
      if (width < 1280 || height < 720) {
        fail(`This image is ${width}×${height}. Use at least 1280×720 pixels.`);
        return;
      }
      if (width > 7680 || height > 4320 || width * height > 35_000_000) {
        fail("Use an image up to 7680×4320 pixels and 35 megapixels.");
        return;
      }
      pendingUrl.current = null;
      setDecoding(false);
      setFile(next);
      setPreviewUrl(url);
      setDimensions({ width, height });
      if (!name.trim())
        setName(
          next.name
            .replace(/\.[^/.]+$/, "")
            .replace(/[_-]/g, " ")
            .slice(0, 60)
        );
      setFocalX(0.5);
      setFocalY(0.5);
    };
    image.onerror = () =>
      fail("This image couldn’t be opened. Please choose another file.");
    image.src = url;
  };
  const selectPoint = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setFocalX(
      Number(
        Math.max(
          0,
          Math.min(1, (event.clientX - rect.left) / rect.width)
        ).toFixed(2)
      )
    );
    setFocalY(
      Number(
        Math.max(
          0,
          Math.min(1, (event.clientY - rect.top) / rect.height)
        ).toFixed(2)
      )
    );
  };
  const movePoint = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight")
      setFocalX((value) =>
        Number(
          Math.max(
            0,
            Math.min(1, value + (event.key === "ArrowLeft" ? -step : step))
          ).toFixed(2)
        )
      );
    else
      setFocalY((value) =>
        Number(
          Math.max(
            0,
            Math.min(1, value + (event.key === "ArrowUp" ? -step : step))
          ).toFixed(2)
        )
      );
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || (!background && !file)) return;
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      setError("Use a name between 2 and 60 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const metadata = {
        name: trimmed,
        focalX,
        focalY,
        timerPosition: position,
        layoutKey: layout,
      };
      let response: Response;
      if (background)
        response = await fetch(`/api/user/focus-backgrounds/${background.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(metadata),
        });
      else {
        const body = new FormData();
        body.append("file", file!);
        for (const [key, value] of Object.entries(metadata))
          body.append(key, String(value));
        response = await fetch("/api/user/focus-backgrounds", {
          method: "POST",
          body,
        });
      }
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Your backdrop couldn’t be saved.");
      const id = data.background?.id ?? background?.id;
      if (typeof id !== "number")
        throw new Error(
          "The upload response was incomplete. Please reload your library."
        );
      broadcastBackdropChange("BACKGROUND_UPDATED", id);
      await onSaved(id);
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Connection lost. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };
  const imageUrl = background?.signedUrl ?? previewUrl;
  return (
    <AppearanceDialog
      title={background ? "Edit backdrop" : "Add a backdrop"}
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        className={styles.editorForm}
      >
        <input
          ref={fileInput}
          className={styles.hiddenFile}
          type="file"
          tabIndex={-1}
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose backdrop image"
          disabled={busy}
          onChange={(event) => {
            const next = event.target.files?.[0];
            if (next) selectFile(next);
            event.target.value = "";
          }}
        />
        {error && (
          <p className={styles.notice} role="alert">
            {error}
          </p>
        )}
        {!background && !imageUrl ? (
          <button
            type="button"
            className={styles.dropzone}
            disabled={busy || decoding}
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const next = event.dataTransfer.files[0];
              if (next && !busy) selectFile(next);
            }}
          >
            <ImagePlus size={29} strokeWidth={1.3} />
            <strong>
              {decoding
                ? "Checking your image…"
                : "Choose an image or drop it here"}
            </strong>
            <span>JPEG, PNG or WebP · up to 10 MB</span>
            <small>At least 1280×720 pixels. Wide images work best.</small>
          </button>
        ) : (
          <div className={styles.editorBody}>
            <div className={styles.editorCanvas}>
              <button
                type="button"
                className={styles.focalPreview}
                onClick={selectPoint}
                onKeyDown={movePoint}
                disabled={busy}
                aria-label="Artwork focal point. Click or use arrow keys to reposition."
                aria-describedby="focal-point-coordinates"
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="Backdrop artwork"
                    style={{
                      objectPosition: `${focalX * 100}% ${focalY * 100}%`,
                    }}
                  />
                ) : (
                  <span>
                    Image unavailable. You can still adjust its settings.
                  </span>
                )}
                <FocusTimerLayoutPreview
                  layoutKey={layout}
                  timerPosition={position}
                  focalX={focalX}
                  focalY={focalY}
                  subjectName={name || "Your study session"}
                />
                <i
                  className={styles.reticle}
                  style={{ left: `${focalX * 100}%`, top: `${focalY * 100}%` }}
                >
                  <Crosshair size={18} />
                </i>
              </button>
              <div className={styles.focalHelp}>
                <p>
                  Keep the important part in view.
                  <small>
                    Click the image or use arrow keys to set its focal point.
                  </small>
                </p>
                {!background && (
                  <button
                    type="button"
                    className={hub.secondaryButton}
                    disabled={busy}
                    onClick={() => fileInput.current?.click()}
                  >
                    Change image
                  </button>
                )}
              </div>
              {(dimensions || background) && (
                <p id="focal-point-coordinates" className={styles.imageMeta}>
                  {dimensions?.width ?? background?.width} ×{" "}
                  {dimensions?.height ?? background?.height} px · Focal point{" "}
                  {Math.round(focalX * 100)}%, {Math.round(focalY * 100)}%
                </p>
              )}
            </div>
            <fieldset disabled={busy} className={styles.editorFields}>
              <label className={styles.nameField}>
                Backdrop name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                  required
                  placeholder="Give this space a name"
                />
              </label>
              <div>
                <span className={styles.fieldLabel} id="position-label">
                  Timer position
                </span>
                <div
                  className={styles.positionOptions}
                  role="group"
                  aria-labelledby="position-label"
                >
                  {VALID_TIMER_POSITIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={position === value}
                      onClick={() => setPosition(value)}
                    >
                      <i data-position={value} />
                      <span>
                        {value === "auto"
                          ? "Automatic"
                          : value[0].toUpperCase() + value.slice(1)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className={styles.fieldLabel} id="layout-label">
                  Timer style
                </span>
                <div
                  className={styles.styleOptions}
                  role="group"
                  aria-labelledby="layout-label"
                >
                  {VALID_LAYOUT_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      title={LAYOUT_KEY_REGISTRY[key].label}
                      aria-pressed={layout === key}
                      onClick={() => setLayout(key)}
                    >
                      {key[0].toUpperCase() + key.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </fieldset>
          </div>
        )}
        <div className={styles.editorActions}>
          <button
            type="button"
            className={hub.secondaryButton}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={hub.primaryButton}
            disabled={busy || (!background && !file)}
          >
            <Upload size={14} />
            {busy ? "Saving…" : background ? "Save changes" : "Add to library"}
          </button>
        </div>
      </form>
    </AppearanceDialog>
  );
}
