"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMathMarkdown, remarkRecoverMath } from "@/lib/markdown-math";
import styles from "./MarkdownRenderer.module.css";

const remarkPlugins = [remarkGfm, remarkMath, remarkRecoverMath];
const katexOptions = { trust: false, strict: "ignore" as const, maxExpand: 1000, maxSize: 20, errorColor: "var(--text-secondary)" };

interface MarkdownRendererProps {
  content: string;
  className?: string;
  compact?: boolean;
}

export default function MarkdownRenderer({
  content,
  className = "",
  compact = false,
}: MarkdownRendererProps) {
  const processedContent = normalizeMathMarkdown(content);

  if (compact) {
    return (
      <div className={`${styles.content} text-xs text-text-primary leading-relaxed break-words ${className}`}>
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={[[rehypeKatex, katexOptions]]}
          skipHtml
          components={{
            h1: ({ children }) => <span className="block font-bold text-sm text-text-primary mb-1">{children}</span>,
            h2: ({ children }) => <span className="block font-bold text-xs text-text-primary mb-1">{children}</span>,
            h3: ({ children }) => <span className="block font-bold text-xs text-accent-text-light mb-1">{children}</span>,
            h4: ({ children }) => <span className="block font-bold text-xs text-accent-text-light mb-0.5">{children}</span>,
            p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
            ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1 text-[11px]">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1 text-[11px]">{children}</ol>,
            li: ({ children }) => <li className="text-text-secondary">{children}</li>,
            strong: ({ children }) => <strong className="font-bold text-text-primary">{children}</strong>,
            em: ({ children }) => <em className="italic text-text-secondary">{children}</em>,
            code: ({ children }) => (
              <code className="px-1 py-0.5 rounded bg-bg-void border border-border-subtle font-mono text-[10px] text-accent-primary-light">
                {children}
              </code>
            ),
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div
      className={`${styles.content} text-sm leading-relaxed text-text-primary break-words max-w-none
        prose dark:prose-invert prose-sm 
        prose-p:my-1.5 prose-p:leading-relaxed 
        prose-ul:my-1.5 prose-ul:pl-4 prose-ol:my-1.5 prose-ol:pl-4 
        prose-li:my-0.5 prose-li:text-text-secondary 
        prose-headings:font-['Rajdhani'] prose-headings:font-bold prose-headings:text-text-primary 
        prose-h1:text-xl prose-h1:mt-3 prose-h1:mb-1.5 
        prose-h2:text-lg prose-h2:mt-2.5 prose-h2:mb-1 
        prose-h3:text-base prose-h3:mt-2 prose-h3:mb-1 prose-h3:text-accent-text-light 
        prose-h4:text-sm prose-h4:mt-1.5 prose-h4:mb-0.5 
        prose-strong:text-text-primary prose-strong:font-bold 
        prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:bg-bg-void prose-code:border prose-code:border-border-subtle prose-code:text-accent-primary-light prose-code:font-mono prose-code:text-xs 
        prose-pre:bg-bg-void prose-pre:border prose-pre:border-border-subtle prose-pre:p-3 prose-pre:rounded-xl 
        prose-blockquote:border-l-2 prose-blockquote:border-accent-primary prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:text-text-muted 
        prose-table:w-full prose-th:border-b prose-th:border-border-subtle prose-th:p-2 prose-th:text-left prose-td:border-b prose-td:border-border-subtle prose-td:p-2 
        ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={[[rehypeKatex, katexOptions]]}
        skipHtml
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
