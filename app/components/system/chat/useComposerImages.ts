"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { imageSelectionError, type ChatImage, type ComposerImage } from "@/lib/ai/sylvie/image-contract";

export function useComposerImages(resetKey: string | number) {
  const [images, setImages] = useState<ComposerImage[]>([]), [error, setError] = useState("");
  const urls = useRef(new Set<string>()), previousKey = useRef(resetKey);
  const clear = useCallback(() => { setImages([]); setError(""); }, []);
  // A conversation switch is a protocol boundary; discard the old image draft before paint.
  useLayoutEffect(() => {
    if (previousKey.current !== resetKey) { previousKey.current = resetKey; clear(); }
  }, [resetKey, clear]);
  useEffect(() => {
    const retained = new Set(images.filter(image => image.file).map(image => image.url));
    for (const url of urls.current) if (!retained.has(url)) { URL.revokeObjectURL(url); urls.current.delete(url); }
  }, [images]);
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); }, []);
  const addFiles = useCallback((files: File[]) => {
    const unique = files.filter((file, index) => files.findIndex(other => other.name === file.name && other.size === file.size && other.lastModified === file.lastModified) === index && !images.some(image => image.file?.name === file.name && image.file.size === file.size && image.file.lastModified === file.lastModified));
    const problem = imageSelectionError([...images.flatMap(image => image.file ? [image.file] : []), ...unique], images.filter(image => image.reference).length);
    if (problem) { setError(problem); return; }
    const added = unique.map(file => { const url = URL.createObjectURL(file); urls.current.add(url); return { id: crypto.randomUUID(), file, url, name: file.name, mimeType: file.type }; });
    setImages(previous => [...previous, ...added]); setError("");
  }, [images]);
  const addReference = useCallback((image: ChatImage) => {
    setImages(previous => previous.length >= 4 || previous.some(item => item.reference?.messageId === image.messageId && item.reference.index === image.index) ? previous : [...previous, { ...image, id: `ref-${image.messageId}-${image.index}`, reference: { messageId: image.messageId, index: image.index } }]);
  }, []);
  const remove = useCallback((id: string) => { setImages(previous => previous.filter(image => image.id !== id)); setError(""); }, []);
  return { images, error, addFiles, addReference, remove, clear };
}
