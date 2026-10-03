/**
 * ============================================================================
 * Next.js Image Adapter (Mobile Client Shim)
 * ============================================================================
 * Renders a standard browser <img> tag for any shared component that
 * imports Image from "next/image", preserving responsive styling.
 * ============================================================================
 */

/* eslint-disable @next/next/no-img-element */
import React, { forwardRef } from "react";

export interface StaticImageData {
  src: string;
  height?: number;
  width?: number;
  blurDataURL?: string;
}

export interface ImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string | StaticImageData;
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
}

export const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  { src, alt, width, height, fill, style, className, ...rest },
  ref
) {
  const resolvedSrc: string = typeof src === "object" && src && "src" in src ? src.src : String(src);

  const combinedStyle: React.CSSProperties = {
    ...style,
    ...(fill
      ? {
          position: "absolute",
          height: "100%",
          width: "100%",
          inset: 0,
          objectFit: "cover",
        }
      : {}),
  };

  return (
    <img
      ref={ref}
      src={resolvedSrc}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      style={combinedStyle}
      className={className}
      loading="lazy"
      {...rest}
    />
  );
});

export default Image;
