"use client";
import { memo } from "react";
import type { ChatImage, ComposerImage } from "@/lib/ai/sylvie/image-contract";
import styles from "./Chat.module.css";
import { resolveApiUrl } from "@/lib/api-transport";

export default memo(function ChatImages({ images, onReuse, onReuseLocal, disabled }: { images: Array<ChatImage | ComposerImage>; onReuse?: (image: ChatImage) => void; onReuseLocal?: (file: File) => void; disabled?: boolean }) {
  return <div className={styles.imageGallery}>{images.map((image, index) => <div key={image.url + index}>
    <a href={image.url.startsWith("/api/") ? resolveApiUrl(image.url) : image.url} target="_blank" rel="noreferrer" aria-label={`Open ${image.name}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url.startsWith("/api/") ? resolveApiUrl(image.url) : image.url} alt={image.name} loading="lazy" />
    </a>
    {onReuse && "messageId" in image && <button className={styles.textButton} type="button" disabled={disabled} onClick={() => onReuse(image)}>Use image again</button>}
    {onReuseLocal && "file" in image && image.file && <button className={styles.textButton} type="button" disabled={disabled} onClick={() => onReuseLocal(image.file!)}>Use image again</button>}
  </div>)}</div>;
});
