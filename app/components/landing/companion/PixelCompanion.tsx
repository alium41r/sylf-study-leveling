import Image from "next/image";
import styles from "./PixelCompanion.module.css";
import type { PixelEyeState } from "./pixel-preview";

// Every composable Sylf layer is authored on this same canvas at origin (0,0).
// Registration belongs to asset preparation, never per-expression CSS.
export const SYLF_PIXEL_CANVAS = { width: 1254, height: 1254 } as const;

interface PixelCompanionProps {
  layered?: boolean;
  eyeState?: PixelEyeState;
}

/** Two experimental raster layers; semantic state migration remains separate. */
export default function PixelCompanion({
  layered = false,
  eyeState = "neutral",
}: PixelCompanionProps) {
  const { width, height } = SYLF_PIXEL_CANVAS;
  if (layered)
    return (
      <span
        className={styles.canvas}
        data-pixel-canvas=""
        data-pixel-variant="layered"
        data-pixel-expression={eyeState}
      >
        <link
          rel="preload"
          as="image"
          href="/companions/pixel/sylf/eyes/blink.png"
        />
        <Image
          src="/companions/pixel/sylf/base/body.png"
          alt=""
          width={width}
          height={height}
          unoptimized
          loading="eager"
          draggable={false}
          data-pixel-layer="body"
          className={`${styles.art} ${styles.layer}`}
        />
        <Image
          src={`/companions/pixel/sylf/eyes/${eyeState}.png`}
          alt=""
          width={width}
          height={height}
          unoptimized
          loading="eager"
          draggable={false}
          data-pixel-layer="eyes"
          className={`${styles.art} ${styles.layer}`}
        />
      </span>
    );
  return (
    <Image
      src="/companions/sylf-pixel-companion.png"
      alt=""
      width={1254}
      height={1254}
      unoptimized
      draggable={false}
      data-pixel-variant="full"
      className={styles.art}
    />
  );
}
