"use client";
import { lazy, memo, Suspense, type ComponentType } from "react";
import styles from "./Chat.module.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  compact?: boolean;
}

const LazyMarkdownRenderer = lazy(() => import("@/app/components/MarkdownRenderer"));

/** Shared Markdown/math presentation; unchanged messages skip parsing on composer updates. */
export default memo(function ChatText({ content, compact }: { content: string; compact?: boolean }) {
  const className = `${styles.markdown} ${compact ? styles.compactText : ""}`;
  const SyncRenderer = (
    globalThis as { __sylfMarkdownRenderer?: ComponentType<MarkdownRendererProps> }
  ).__sylfMarkdownRenderer;
  if (SyncRenderer) {
    return <SyncRenderer content={content} className={className} />;
  }
  return (
    <Suspense fallback={<div className={className}>{content}</div>}>
      <LazyMarkdownRenderer content={content} className={className} />
    </Suspense>
  );
});
