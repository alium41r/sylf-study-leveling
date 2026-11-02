"use client";

import React, { lazy, Suspense, type ComponentType } from "react";

export interface LazyMarkdownRendererProps {
  content: string;
  className?: string;
  compact?: boolean;
}

const DeferredMarkdownRenderer = lazy(() => import("./MarkdownRenderer"));

export default function LazyMarkdownRenderer({
  content,
  className = "",
  compact = false,
}: LazyMarkdownRendererProps) {
  const SyncRenderer = (
    globalThis as { __sylfMarkdownRenderer?: ComponentType<LazyMarkdownRendererProps> }
  ).__sylfMarkdownRenderer;

  if (SyncRenderer) {
    return <SyncRenderer content={content} className={className} compact={compact} />;
  }

  return (
    <Suspense fallback={<div className={className}>{content}</div>}>
      <DeferredMarkdownRenderer content={content} className={className} compact={compact} />
    </Suspense>
  );
}
