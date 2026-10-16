"use client";
import { memo } from "react";
import MarkdownRenderer from "@/app/components/MarkdownRenderer";
import styles from "./Chat.module.css";

/** Shared Markdown/math presentation; unchanged messages skip parsing on composer updates. */
export default memo(function ChatText({ content, compact }: { content: string; compact?: boolean }) {
  return <MarkdownRenderer content={content} className={`${styles.markdown} ${compact ? styles.compactText : ""}`} />;
});
