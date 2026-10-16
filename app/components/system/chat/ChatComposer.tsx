"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { ArrowUp, Paperclip, Square, X, Mic, MicOff } from "lucide-react";
import { CHAT_IMAGE_TYPES, type ComposerImage } from "@/lib/ai/sylvie/image-contract";
import { useSpeechDictation } from "./useSpeechDictation";
import { resolveApiUrl } from "@/lib/api-transport";
import styles from "./Chat.module.css";

interface Props {
  value: string; onChange: (value: string) => void; onSend: () => void; onStop?: () => void;
  busy: boolean; disabled?: boolean; placeholder?: string; sendLabel?: string; sendTitle?: string;
  file?: File | null; onFileChange?: (file: File | null) => void;
  images?: ComposerImage[]; onFilesAdded?: (files: File[]) => void; onImageRemove?: (id: string) => void;
  imageError?: string; uploading?: boolean; resetKey?: string | number; speechEnabled?: boolean;
  /** Slots for future capture/transcription controls; no inactive feature is exposed. */
  captureControls?: ReactNode; footer?: ReactNode;
  inputLabel?: string; inputRef?: RefObject<HTMLTextAreaElement | null>; maxLength?: number;
}
export default function ChatComposer({ value, onChange, onSend, onStop, busy, disabled, placeholder = "Ask anything…", sendLabel = "Send message", sendTitle = "Send (Enter)", file, onFileChange, captureControls, footer, inputLabel = "Message Sylvie", inputRef, maxLength = 4000, images = [], onFilesAdded, onImageRemove, imageError, uploading, resetKey = 0, speechEnabled = true }: Props) {
  const localTextarea = useRef<HTMLTextAreaElement>(null), picker = useRef<HTMLInputElement>(null);
  const textarea = inputRef ?? localTextarea;
  const speech = useSpeechDictation(value, onChange, !busy && !disabled && speechEnabled, resetKey, maxLength);
  useLayoutEffect(() => {
    const input = textarea.current;
    if (input) { input.style.height = "0px"; input.style.height = `${Math.max(44, Math.min(input.scrollHeight, 160))}px`; }
  }, [value, textarea]);
  return <div className={styles.composerArea}>
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); if (!busy && !disabled && !speech.active) onSend(); }}
      onDragOver={event => { if (onFilesAdded && !busy && !disabled && event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={event => { if (onFilesAdded && !busy && !disabled && event.dataTransfer.files.length) { event.preventDefault(); onFilesAdded(Array.from(event.dataTransfer.files)); } }}>
      {!!images.length && <div className={styles.imageTray} aria-label="Attached images">{images.map(image => <div key={image.id} className={styles.imageDraft}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url.startsWith("/api/") ? resolveApiUrl(image.url) : image.url} alt={image.name} /><span title={image.name}>{image.name}</span>
        <button type="button" aria-label={`Remove ${image.name}`} disabled={busy} onClick={() => onImageRemove?.(image.id)}><X size={13} /></button>
      </div>)}</div>}
      {file && <div className={styles.fileChip}><Paperclip size={14} /><span>{file.name}</span><button type="button" onClick={() => onFileChange?.(null)} aria-label="Remove attachment"><X size={14} /></button></div>}
      <textarea ref={textarea} value={value} onChange={event => onChange(event.target.value)} rows={1}
        aria-label={inputLabel} placeholder={placeholder} disabled={disabled} readOnly={speech.active} maxLength={maxLength}
        onPaste={event => { if (onFilesAdded && !busy && !disabled) { const files = Array.from(event.clipboardData.files); if (files.length) { onFilesAdded(files); if (!event.clipboardData.getData("text/plain")) event.preventDefault(); } } }}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy && !disabled && !speech.active) onSend(); }
        }} />
      <div className={styles.composerControls}>
        <div className={styles.captureControls}>
          {(onFilesAdded || onFileChange) && <><input ref={picker} type="file" hidden accept={CHAT_IMAGE_TYPES.join(",")} multiple={Boolean(onFilesAdded)} onChange={event => { if (onFilesAdded) onFilesAdded(Array.from(event.target.files || [])); else onFileChange?.(event.target.files?.[0] || null); event.target.value = ""; }} />
            <button type="button" className={styles.iconButton} title="Attach up to 4 images · 5 MB each" aria-label="Attach file" disabled={busy || disabled || images.length >= 4} onClick={() => picker.current?.click()}><Paperclip size={18} /></button></>}
          <button type="button" className={styles.iconButton} aria-label={speech.active ? "Stop dictation" : "Dictate prompt"} aria-pressed={speech.active}
            title={speech.supported ? speech.active ? "Stop dictation" : "Dictate · your browser may process speech online" : "Dictation unavailable. Try your keyboard’s microphone."}
            disabled={!speech.supported || busy || disabled || !speechEnabled || speech.phase === "processing"} onClick={() => { if (speech.active) speech.stop(); else { textarea.current?.blur(); void speech.start(); } }}>
            {speech.active ? <Square size={16} /> : speech.supported ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          {speech.active && <button type="button" className={styles.iconButton} aria-label="Cancel dictation" onClick={speech.cancel}><X size={16} /></button>}
          {captureControls}
          <span className={styles.keyboardHint}>Shift + Enter for a new line</span>
        </div>
        {busy && onStop ? <button type="button" className={styles.sendButton} onClick={onStop} aria-label="Stop generation" title="Stop Generating"><Square size={15} fill="currentColor" /></button>
          : <button type="submit" className={styles.sendButton} disabled={busy || disabled || speech.active || (!value.trim() && !file && !images.length)} aria-label={sendLabel} title={sendTitle}><ArrowUp size={20} /></button>}
      </div>
    </form>
    {(speech.active || uploading) && <p className={styles.mediaStatus} role="status">{uploading ? "Sending images…" : `${speech.phase === "starting" ? "Starting microphone…" : speech.phase === "processing" ? "Processing speech…" : "Listening…"} · ${speech.local ? "On device" : "Browser speech service"}`}</p>}
    {speech.supported && !speech.active && !busy && <p className={styles.mediaHint}>Voice may be processed online. Review the text before sending.</p>}
    {!speech.supported && <p className={styles.mediaHint}>Dictation unavailable here. Try your keyboard’s microphone.</p>}
    {(imageError || speech.error) && <p className={styles.error} role="alert">{imageError || speech.error}</p>}
    {footer && <div className={styles.composerFooter}>{footer}</div>}
  </div>;
}
