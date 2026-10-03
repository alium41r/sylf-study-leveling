// ============================================================================
// Image Dimensions & Aspect Ratio Sniffer (Zero-dependency Node Buffer Parser)
// ============================================================================
// Efficiently extracts width, height, and aspect ratio from binary headers
// of PNG, JPEG, WebP, and GIF files without external C-bindings or libraries.
// Authoritative server-side validation for official Focus Timer backgrounds.
// ============================================================================

export interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number; // e.g. 1.7778 for 16:9
  isRecommended16x9: boolean; // within tolerance of 16:9 (1.70 - 1.85)
}

export const MIN_DESKTOP_WIDTH = 1280;
export const MIN_DESKTOP_HEIGHT = 720;
export const MAX_BACKGROUND_BYTES = 15 * 1024 * 1024; // 15 MB cap for 4K wallpapers

/**
 * Parses image width and height directly from image file header buffer.
 */
export function extractImageDimensions(buffer: Buffer): ImageDimensions | null {
  if (!buffer || buffer.length < 10) return null;

  try {
    // ── 1. PNG ──────────────────────────────────────────────────
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      if (buffer.length >= 24) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        if (width > 0 && height > 0) {
          return createDimensionsResult(width, height);
        }
      }
    }

    // ── 2. GIF ──────────────────────────────────────────────────
    if (
      (buffer.toString("latin1", 0, 6) === "GIF87a" ||
        buffer.toString("latin1", 0, 6) === "GIF89a") &&
      buffer.length >= 10
    ) {
      const width = buffer.readUInt16LE(6);
      const height = buffer.readUInt16LE(8);
      if (width > 0 && height > 0) {
        return createDimensionsResult(width, height);
      }
    }

    // ── 3. WebP ─────────────────────────────────────────────────
    if (
      buffer.toString("latin1", 0, 4) === "RIFF" &&
      buffer.toString("latin1", 8, 12) === "WEBP" &&
      buffer.length >= 30
    ) {
      const chunkType = buffer.toString("latin1", 12, 16);

      // VP8 (Lossy)
      if (chunkType === "VP8 " && buffer.length >= 30) {
        // Check 3-byte start code 0x9d 0x01 0x2a at offset 23
        if (buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
          const width = (buffer.readUInt16LE(26) & 0x3fff);
          const height = (buffer.readUInt16LE(28) & 0x3fff);
          if (width > 0 && height > 0) return createDimensionsResult(width, height);
        }
      }

      // VP8L (Lossless)
      if (chunkType === "VP8L" && buffer.length >= 25) {
        // 1-byte signature 0x2f at offset 20
        if (buffer[20] === 0x2f) {
          const b1 = buffer[21];
          const b2 = buffer[22];
          const b3 = buffer[23];
          const b4 = buffer[24];
          const width = 1 + (((b2 & 0x3f) << 8) | b1);
          const height = 1 + ((((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)));
          if (width > 0 && height > 0) return createDimensionsResult(width, height);
        }
      }

      // VP8X (Extended)
      if (chunkType === "VP8X" && buffer.length >= 30) {
        const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
        const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
        if (width > 0 && height > 0) return createDimensionsResult(width, height);
      }
    }

    // ── 4. JPEG / JFIF / EXIF ───────────────────────────────────
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }

        const marker = buffer[offset + 1];

        // Restart markers & standalone markers (no length)
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset += 2;
          continue;
        }

        // Variable-length markers
        const length = buffer.readUInt16BE(offset + 2);
        if (length < 2) break;

        // SOF0 through SOF15 (excluding DHT, JPG, DAC)
        // 0xC0 = Baseline, 0xC1 = Extended sequential, 0xC2 = Progressive, 0xC3 = Lossless
        const isSOF =
          (marker >= 0xc0 && marker <= 0xcf) &&
          marker !== 0xc4 &&
          marker !== 0xc8 &&
          marker !== 0xcc;

        if (isSOF && offset + 8 < buffer.length) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          if (width > 0 && height > 0) {
            return createDimensionsResult(width, height);
          }
        }

        offset += 2 + length;
      }
    }
  } catch (err) {
    console.warn("[image-dimensions] Failed to parse dimensions:", err);
  }

  return null;
}

function createDimensionsResult(width: number, height: number): ImageDimensions {
  const aspectRatio = Number((width / height).toFixed(4));
  // Standard 16:9 is ~1.7778; allow tolerance 1.65 to 1.85 (covers 16:9 & 16:10)
  const isRecommended16x9 = aspectRatio >= 1.65 && aspectRatio <= 1.85;

  return {
    width,
    height,
    aspectRatio,
    isRecommended16x9,
  };
}

export const MAX_USER_BACKGROUND_BYTES = 10 * 1024 * 1024; // 10 MB cap for custom user backgrounds
export const MAX_BACKGROUND_WIDTH = 7680; // 8K maximum width
export const MAX_BACKGROUND_HEIGHT = 4320; // 8K maximum height
export const MAX_BACKGROUND_PIXELS = 35_000_000; // 35 Megapixels cap (decompression bomb protection)

export type DimensionValidation =
  | { ok: true; dimensions: ImageDimensions }
  | { ok: false; error: string; status: number };

/**
 * Validates extracted dimensions against desktop wallpaper standards.
 */
export function validateDesktopBackgroundDimensions(
  dimensions: ImageDimensions | null
): DimensionValidation {
  if (!dimensions) {
    return {
      ok: false,
      error: "Unable to read image dimensions. Please upload a valid PNG, JPEG, or WebP image.",
      status: 400,
    };
  }

  if (dimensions.width < MIN_DESKTOP_WIDTH || dimensions.height < MIN_DESKTOP_HEIGHT) {
    return {
      ok: false,
      error: `Resolution too low (${dimensions.width}×${dimensions.height}). Minimum desktop resolution is ${MIN_DESKTOP_WIDTH}×${MIN_DESKTOP_HEIGHT} (1080p or 4K recommended).`,
      status: 422,
    };
  }

  return { ok: true, dimensions };
}

/**
 * Validates custom user background dimensions with strict min/max limits and GIF rejection.
 */
export function validateCustomBackgroundDimensions(
  dimensions: ImageDimensions | null,
  detectedMime: string
): DimensionValidation {
  if (!dimensions) {
    return {
      ok: false,
      error: "Unable to read image dimensions. Please upload a valid PNG, JPEG, or WebP image.",
      status: 400,
    };
  }

  if (detectedMime === "image/gif") {
    return {
      ok: false,
      error: "GIF animations are not supported for custom focus backgrounds. Please upload a static JPEG, PNG, or WebP.",
      status: 400,
    };
  }

  if (dimensions.width < MIN_DESKTOP_WIDTH || dimensions.height < MIN_DESKTOP_HEIGHT) {
    return {
      ok: false,
      error: `Resolution too low (${dimensions.width}×${dimensions.height}). Minimum desktop resolution is ${MIN_DESKTOP_WIDTH}×${MIN_DESKTOP_HEIGHT} (1080p or 4K recommended).`,
      status: 422,
    };
  }

  const totalPixels = dimensions.width * dimensions.height;
  if (totalPixels > MAX_BACKGROUND_PIXELS) {
    return {
      ok: false,
      error: `Image exceeds maximum complexity of 35 megapixels (${(totalPixels / 1_000_000).toFixed(1)} MP). Maximum permitted is ${MAX_BACKGROUND_PIXELS / 1_000_000} MP.`,
      status: 422,
    };
  }

  if (dimensions.width > MAX_BACKGROUND_WIDTH || dimensions.height > MAX_BACKGROUND_HEIGHT) {
    return {
      ok: false,
      error: `Resolution exceeds maximum allowed dimensions (${dimensions.width}×${dimensions.height}). Maximum supported is ${MAX_BACKGROUND_WIDTH}×${MAX_BACKGROUND_HEIGHT}.`,
      status: 422,
    };
  }

  return { ok: true, dimensions };
}

