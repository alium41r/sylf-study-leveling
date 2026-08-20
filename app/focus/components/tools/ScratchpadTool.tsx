"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useFocusTools } from "../FocusToolsContext";
import MarkdownRenderer from "@/app/components/MarkdownRenderer";
import {
  Plus,
  Trash2,
  Copy,
  Check,
  Clock,
  Eye,
  Edit3,
  Download,
  FileText,
  ChevronDown,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Sigma,
  Terminal,
  Quote,
  Minus,
  Table,
  Undo2,
  Redo2,
} from "lucide-react";

export interface ScratchpadDraft {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

export default function ScratchpadTool() {
  const { subjectName } = useFocusTools();
  const storageKey = `focus_scratchpad_drafts_${
    subjectName ? subjectName.toLowerCase().replace(/\s+/g, "_") : "general"
  }`;

  const defaultDraft: ScratchpadDraft = {
    id: "draft-1",
    title: "Draft 1",
    content: "",
    updatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };

  const [drafts, setDrafts] = useState<ScratchpadDraft[]>(() => [defaultDraft]);
  const [activeDraftId, setActiveDraftId] = useState<string>("draft-1");
  const [isPreview, setIsPreview] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Undo / Redo history stacks
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load saved drafts from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDrafts(parsed);
          setActiveDraftId(parsed[0].id);
          return;
        }
      }
      // Fallback: check legacy single draft
      const legacyKey = `focus_scratchpad_${
        subjectName ? subjectName.toLowerCase().replace(/\s+/g, "_") : "general"
      }`;
      const legacyText = localStorage.getItem(legacyKey);
      if (legacyText) {
        const migratedDraft: ScratchpadDraft = {
          id: "draft-1",
          title: "Draft 1",
          content: legacyText,
          updatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setDrafts([migratedDraft]);
        setActiveDraftId("draft-1");
      }
    } catch {}
  }, [storageKey, subjectName]);

  const activeDraft = useMemo(() => {
    return drafts.find((d) => d.id === activeDraftId) || drafts[0] || defaultDraft;
  }, [drafts, activeDraftId]);

  // Push state to undo stack
  const pushUndoState = useCallback((currentText: string) => {
    undoStackRef.current.push(currentText);
    if (undoStackRef.current.length > 40) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  }, []);

  // Auto-save helper
  const persistDrafts = useCallback((newDrafts: ScratchpadDraft[]) => {
    setDrafts(newDrafts);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newDrafts));
      setLastSaved(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch {}
  }, [storageKey]);

  // Update active draft content
  const handleContentChange = (newContent: string) => {
    const timeNow = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const updated = drafts.map((d) => {
      if (d.id === activeDraftId) {
        return { ...d, content: newContent, updatedAt: timeNow };
      }
      return d;
    });
    persistDrafts(updated);
  };

  // Undo execution
  const handleUndo = () => {
    if (undoStackRef.current.length === 0) return;
    const prevText = undoStackRef.current.pop()!;
    redoStackRef.current.push(activeDraft.content);
    handleContentChange(prevText);
  };

  // Redo execution
  const handleRedo = () => {
    if (redoStackRef.current.length === 0) return;
    const nextText = redoStackRef.current.pop()!;
    undoStackRef.current.push(activeDraft.content);
    handleContentChange(nextText);
  };

  // Create new blank draft
  const handleCreateNewDraft = () => {
    const newId = `draft-${Date.now().toString(36)}`;
    const newDraftNum = drafts.length + 1;
    const newDraft: ScratchpadDraft = {
      id: newId,
      title: `Draft ${newDraftNum}`,
      content: "",
      updatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    const updated = [...drafts, newDraft];
    persistDrafts(updated);
    setActiveDraftId(newId);
    setIsPreview(false);
    undoStackRef.current = [];
    redoStackRef.current = [];
  };

  // Delete active draft (if more than 1)
  const handleDeleteActiveDraft = () => {
    if (drafts.length <= 1) {
      pushUndoState(activeDraft.content);
      handleContentChange("");
      return;
    }
    const filtered = drafts.filter((d) => d.id !== activeDraftId);
    persistDrafts(filtered);
    setActiveDraftId(filtered[0].id);
    undoStackRef.current = [];
    redoStackRef.current = [];
  };

  const handleCopy = useCallback(() => {
    if (navigator.clipboard && activeDraft?.content) {
      navigator.clipboard.writeText(activeDraft.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [activeDraft]);

  const handleInsertTimestamp = () => {
    const timeStr = `\n[${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}] `;
    pushUndoState(activeDraft.content);
    handleContentChange((activeDraft?.content || "") + timeStr);
  };

  const handleDownload = () => {
    const content = activeDraft?.content || "";
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `focus_notes_${subjectName || "general"}_${activeDraft?.title.toLowerCase().replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ─── Rich-Text Formatting Actions ───

  const applyWrap = (before: string, after: string, defaultPlaceholder = "text") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = activeDraft.content;
    const selected = current.slice(start, end);
    const replacement = selected ? `${before}${selected}${after}` : `${before}${defaultPlaceholder}${after}`;
    const newContent = current.slice(0, start) + replacement + current.slice(end);

    pushUndoState(current);
    handleContentChange(newContent);

    setTimeout(() => {
      textarea.focus();
      if (selected) {
        textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
      } else {
        textarea.setSelectionRange(start + before.length, start + before.length + defaultPlaceholder.length);
      }
    }, 0);
  };

  const applyLinePrefix = (prefix: string, defaultPlaceholder = "item") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = activeDraft.content;

    const lineStart = current.lastIndexOf("\n", start - 1) + 1;
    const selected = current.slice(start, end);

    pushUndoState(current);
    let newContent = "";
    if (start === end && lineStart === start) {
      newContent = current.slice(0, lineStart) + prefix + defaultPlaceholder + current.slice(lineStart);
      handleContentChange(newContent);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length + defaultPlaceholder.length);
      }, 0);
    } else {
      newContent = current.slice(0, lineStart) + prefix + current.slice(lineStart);
      handleContentChange(newContent);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      }, 0);
    }
  };

  const applyHeading = (level: 1 | 2 | 3 | 0) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const current = activeDraft.content;
    const lineStart = current.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = current.indexOf("\n", start);
    if (lineEnd === -1) lineEnd = current.length;
    const line = current.slice(lineStart, lineEnd);

    const cleanedLine = line.replace(/^#{1,6}\s*/, "");
    const prefix = level > 0 ? `${"#".repeat(level)} ` : "";
    const newLine = `${prefix}${cleanedLine || "Heading"}`;

    pushUndoState(current);
    const newContent = current.slice(0, lineStart) + newLine + current.slice(lineEnd);
    handleContentChange(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart + prefix.length, lineStart + newLine.length);
    }, 0);
  };

  const applyBlock = (snippet: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = activeDraft.content;

    pushUndoState(current);
    const newContent = current.slice(0, start) + snippet + current.slice(end);
    handleContentChange(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + snippet.length, start + snippet.length);
    }, 0);
  };

  // Keyboard Shortcuts Handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.metaKey || e.ctrlKey) {
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        applyWrap("**", "**", "bold text");
      } else if (e.key.toLowerCase() === "i") {
        e.preventDefault();
        applyWrap("*", "*", "italic text");
      } else if (e.key.toLowerCase() === "u") {
        e.preventDefault();
        applyWrap("<u>", "</u>", "underlined text");
      } else if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    }
  };

  // Metrics
  const charCount = activeDraft?.content.length || 0;
  const wordCount = activeDraft?.content.trim() ? activeDraft.content.trim().split(/\s+/).length : 0;
  const readingTimeMinutes = Math.ceil(wordCount / 200);

  return (
    <div className="flex flex-col h-full text-text-primary font-sans text-xs bg-bg-void/40 select-none">
      {/* ─── Top Header & Action Bar (Clean Flex Deck) ─── */}
      <div className="px-3.5 py-2 bg-bg-panel/40 border-b border-border-subtle flex items-center justify-between gap-2 shadow-sm">
        {/* Left Side: Draft Selector & + New Icon Button */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="relative flex items-center">
            <select
              value={activeDraftId}
              onChange={(e) => setActiveDraftId(e.target.value)}
              className="appearance-none bg-bg-abyss text-text-primary font-bold text-xs pl-2.5 pr-7 py-1.5 rounded-lg border border-border-subtle focus:outline-none focus:border-accent-primary cursor-pointer max-w-[140px] sm:max-w-[160px] truncate"
            >
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} {d.content ? `(${d.content.length}c)` : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-text-muted absolute right-2 pointer-events-none" />
          </div>

          <button
            onClick={handleCreateNewDraft}
            className="p-1.5 rounded-lg bg-accent-primary text-white hover:bg-accent-primary-light transition-all shadow-sm flex items-center justify-center shrink-0"
            title="Create Blank Scratchpad Draft (+)"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right Side: Icon-Only Action Group with Tooltips */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Preview / Edit Toggle */}
          <button
            onClick={() => setIsPreview(!isPreview)}
            className={`p-1.5 rounded-lg border transition-all flex items-center gap-1 text-[11px] font-bold ${
              isPreview
                ? "bg-accent-primary text-white border-accent-primary shadow-sm"
                : "bg-bg-abyss text-text-secondary hover:text-text-primary border-border-subtle hover:bg-bg-panel"
            }`}
            title={isPreview ? "Switch to Edit Mode" : "Preview Rendered Markdown"}
          >
            {isPreview ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline text-[10px]">{isPreview ? "Edit" : "Preview"}</span>
          </button>

          {/* Insert Time */}
          <button
            onClick={handleInsertTimestamp}
            className="p-1.5 rounded-lg bg-bg-abyss hover:bg-bg-panel text-text-secondary hover:text-text-primary border border-border-subtle transition-colors"
            title="Insert Session Timestamp [HH:MM]"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg bg-bg-abyss hover:bg-bg-panel text-text-secondary hover:text-text-primary border border-border-subtle transition-colors"
            title="Copy Notes to Clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-lg bg-bg-abyss hover:bg-bg-panel text-text-secondary hover:text-text-primary border border-border-subtle transition-colors"
            title="Export Notes (.md)"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Delete / Clear */}
          <button
            onClick={handleDeleteActiveDraft}
            className="p-1.5 rounded-lg bg-bg-abyss hover:bg-red-500/20 text-text-muted hover:text-red-400 border border-border-subtle transition-colors"
            title={drafts.length > 1 ? "Delete Current Draft" : "Clear Draft Content"}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ─── Google Docs-Style Compact Formatting Ribbon ─── */}
      {!isPreview && (
        <div className="px-2.5 py-1 bg-bg-abyss border-b border-border-subtle flex items-center gap-0.5 overflow-x-auto no-scrollbar shadow-inner">
          {/* Undo / Redo */}
          <button
            onClick={handleUndo}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRedo}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-3.5 bg-border-subtle mx-1 shrink-0" />

          {/* Headings */}
          <button
            onClick={() => applyHeading(1)}
            className="px-1.5 py-0.5 rounded hover:bg-bg-panel text-[11px] font-bold text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Heading 1 (#)"
          >
            H1
          </button>
          <button
            onClick={() => applyHeading(2)}
            className="px-1.5 py-0.5 rounded hover:bg-bg-panel text-[11px] font-bold text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Heading 2 (##)"
          >
            H2
          </button>
          <button
            onClick={() => applyHeading(3)}
            className="px-1.5 py-0.5 rounded hover:bg-bg-panel text-[11px] font-bold text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Heading 3 (###)"
          >
            H3
          </button>

          <div className="w-[1px] h-3.5 bg-border-subtle mx-1 shrink-0" />

          {/* Text Styling */}
          <button
            onClick={() => applyWrap("**", "**", "bold")}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => applyWrap("*", "*", "italic")}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => applyWrap("<u>", "</u>", "underlined")}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Underline (Ctrl+U)"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => applyWrap("~~", "~~", "strikethrough")}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Strikethrough"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => applyWrap("`", "`", "code")}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Inline Code (`)"
          >
            <Code className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-3.5 bg-border-subtle mx-1 shrink-0" />

          {/* Lists */}
          <button
            onClick={() => applyLinePrefix("- ", "list item")}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Bullet List (-)"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => applyLinePrefix("1. ", "list item")}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Numbered List (1.)"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => applyLinePrefix("- [ ] ", "task item")}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Task List / Checklist (- [ ])"
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-3.5 bg-border-subtle mx-1 shrink-0" />

          {/* Academic & STEM Inserts */}
          <button
            onClick={() => applyWrap("$$", "$$", "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}")}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-accent-text-light transition-colors shrink-0"
            title="LaTeX Math Equation ($$...$$)"
          >
            <Sigma className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => applyBlock("\n```typescript\n// code snippet\n```\n")}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Code Block (```)"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => applyLinePrefix("> ", "quote")}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Blockquote (>)"
          >
            <Quote className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => applyBlock("\n---\n")}
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Horizontal Divider (---)"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() =>
              applyBlock("\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Data A | Data B | Data C |\n")
            }
            className="p-1 rounded hover:bg-bg-panel text-text-muted hover:text-text-primary transition-colors shrink-0"
            title="Markdown Table"
          >
            <Table className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── Main Editor / Preview ─── */}
      <div className="flex-1 p-3 overflow-hidden flex flex-col min-h-0">
        {isPreview ? (
          <div className="flex-1 p-4 bg-bg-abyss/80 border border-border-subtle rounded-2xl overflow-y-auto custom-scrollbar leading-relaxed select-text">
            {activeDraft?.content.trim() ? (
              <MarkdownRenderer content={activeDraft.content} />
            ) : (
              <div className="p-8 text-center text-text-muted">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Draft is empty. Switch to Edit mode to jot down notes.</p>
              </div>
            )}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={activeDraft?.content || ""}
            onChange={(e) => {
              pushUndoState(activeDraft.content);
              handleContentChange(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={`Jot down quick thoughts, derivations, or formulas for ${
              subjectName || "this study session"
            }...\n\nSupports Markdown formatting (e.g. **bold**, *italic*, - lists, # headings, $$latex$$).`}
            className="flex-1 w-full p-3.5 bg-bg-abyss/80 border border-border-subtle rounded-2xl text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary resize-none leading-relaxed custom-scrollbar font-mono select-text"
          />
        )}
      </div>

      {/* ─── Bottom Status Bar ─── */}
      <div className="px-3.5 py-1.5 bg-bg-panel/40 border-t border-border-subtle flex items-center justify-between text-[10px] text-text-muted">
        <div className="flex items-center gap-3">
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
          <span>~{readingTimeMinutes} min read</span>
        </div>

        <div>
          <span>Auto-saved at {lastSaved || activeDraft?.updatedAt || "just now"}</span>
        </div>
      </div>
    </div>
  );
}
