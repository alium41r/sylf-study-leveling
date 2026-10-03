"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import Image from "next/image";
import { Maximize2, X } from "lucide-react";
import { lockPageScroll } from "@/lib/scroll-lock";
import journeyStyles from "./Journey.module.css";
import styles from "./RealProductScreenshot.module.css";

interface RealProductScreenshotProps {
  title: string;
  src: string;
  alt: string;
  hero?: boolean;
  className?: string;
}

const SCREENSHOT_WIDTH = 1175;
const SCREENSHOT_HEIGHT = 689;

export default function RealProductScreenshot({
  title,
  src,
  alt,
  hero = false,
  className = "",
}: RealProductScreenshotProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const hintId = useId();

  useEffect(() => {
    if (isOpen) return lockPageScroll();
  }, [isOpen]);

  function openScreenshot() {
    if (!dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    setIsOpen(true);
    closeButton.current?.focus();
  }

  function closeScreenshot() {
    dialog.current?.close();
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      closeScreenshot();
    }
  }

  return (
    <>
      <figure
        className={`${journeyStyles.window} ${hero ? journeyStyles.heroWindow : ""} ${styles.frame} ${className}`}
      >
        <div className={journeyStyles.windowBar}>
          <div className={journeyStyles.windowDots} aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <span className={styles.windowTitle}>{title}</span>
          <span className={journeyStyles.windowBadge}>SYLF IN ACTION</span>
        </div>
        <button
          type="button"
          className={styles.imageButton}
          onClick={openScreenshot}
          aria-label={`Enlarge ${title} screenshot`}
          aria-haspopup="dialog"
        >
          <Image
            src={src}
            alt={alt}
            width={SCREENSHOT_WIDTH}
            height={SCREENSHOT_HEIGHT}
            className={styles.screenshot}
            loading={hero ? "eager" : "lazy"}
            fetchPriority={hero ? "high" : undefined}
            unoptimized
          />
          <span className={styles.expandHint} aria-hidden="true">
            <Maximize2 size={12} />
            Take a closer look
          </span>
        </button>
      </figure>

      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={titleId}
        aria-describedby={hintId}
        onClose={() => setIsOpen(false)}
        onClick={closeFromBackdrop}
      >
        <div className={styles.dialogHeader}>
          <h2 id={titleId} className={styles.dialogTitle}>
            {title}
          </h2>
          <button
            ref={closeButton}
            type="button"
            className={styles.closeButton}
            onClick={closeScreenshot}
            aria-label="Close screenshot"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div
          className={styles.imageStage}
          role="region"
          aria-label={`${title} enlarged screenshot`}
          tabIndex={0}
        >
          {isOpen && (
            <Image
              src={src}
              alt={alt}
              width={SCREENSHOT_WIDTH}
              height={SCREENSHOT_HEIGHT}
              className={styles.expandedImage}
              loading="eager"
              unoptimized
            />
          )}
        </div>
        <p id={hintId} className={styles.dialogHint}>
          <span className={styles.mobileHint}>
            Swipe to explore the screenshot.{" "}
          </span>
          <span className={styles.desktopHint}>Press Escape to close.</span>
        </p>
      </dialog>
    </>
  );
}
