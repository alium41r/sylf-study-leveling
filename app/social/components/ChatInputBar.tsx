"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Smile, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatInputBarProps {
  onSendMessage: (content: string) => Promise<void>;
  isSending: boolean;
  disabled?: boolean;
}

const EMOJI_CATEGORIES = [
  {
    name: "Smileys",
    emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😌", "😍", "🥰", "😘", "😋", "😜", "😎", "🤓", "🧐", "🤔", "🤫", "😴", "🤯", "🥳"],
  },
  {
    name: "Gestures & Energy",
    emojis: ["👍", "👎", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✌️", "🤞", "🤟", "🤘", "👌", "🤌", "👈", "👉", "👆", "👇", "🔥", "✨", "💯", "💥", "⚡", "🌟"],
  },
  {
    name: "Study & Gaming",
    emojis: ["📖", "📚", "📝", "✍️", "🎯", "🎮", "🕹️", "⚔️", "🛡️", "👑", "🏆", "🥇", "⭐", "💎", "🔮", "🧠", "💡", "🧪", "🔬", "💻", "☕", "⌛", "⏰", "📊"],
  },
  {
    name: "Hearts & Symbols",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💖", "💘", "💔", "💫", "☀️", "🌙", "⭐", "🚀", "🛸", "🤖", "👾", "🎉", "🎊", "💬", "💭", "💤"],
  },
];

export function ChatInputBar({ onSendMessage, isSending, disabled }: ChatInputBarProps) {
  const [content, setContent] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Smileys");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [content]);

  // Click outside to close emoji picker
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (!content.trim() || isSending || disabled) return;
    const textToSend = content.trim();
    setContent("");
    setShowEmojiPicker(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await onSendMessage(textToSend);
  };

  const handleInsertEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  return (
    <div className="p-3 sm:p-4 border-t border-white/10 shrink-0 relative bg-bg-panel/70 backdrop-blur-xl">
      {/* ─── Categorized Emoji Picker Drawer ─────────────────── */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            ref={pickerRef}
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            className="absolute bottom-full left-4 mb-2 w-80 sm:w-96 rounded-2xl bg-bg-abyss/95 border border-white/15 shadow-2xl backdrop-blur-xl z-50 p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light flex items-center gap-1.5">
                <Smile className="w-3.5 h-3.5" />
                <span>Select Emoji</span>
              </span>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(false)}
                className="p-1 text-text-muted hover:text-text-primary text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
              {EMOJI_CATEGORIES.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setActiveCategory(cat.name)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-['Rajdhani'] font-bold uppercase tracking-wider shrink-0 transition-colors ${
                    activeCategory === cat.name
                      ? "bg-accent-primary text-white"
                      : "bg-bg-panel text-text-muted hover:text-text-primary"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Emoji Grid */}
            <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto custom-scrollbar p-1">
              {EMOJI_CATEGORIES.find((c) => c.name === activeCategory)?.emojis.map((emoji, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleInsertEmoji(emoji)}
                  className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-lg hover:scale-125 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Input Bar Row ─────────────────────────────────────── */}
      <div className="flex items-end gap-2 bg-bg-abyss/80 border border-white/10 rounded-2xl p-2 focus-within:border-accent-primary/60 focus-within:shadow-[0_0_15px_rgba(124,58,237,0.2)] transition-all">
        {/* Emoji Button */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          className={`p-2.5 rounded-xl transition-colors shrink-0 ${
            showEmojiPicker ? "bg-accent-primary-dim text-accent-text-light" : "text-text-muted hover:text-text-primary hover:bg-white/5"
          }`}
          title="Add emoji"
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* Multi-line Auto-expanding Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Shift+Enter for newline)"
          rows={1}
          disabled={disabled || isSending}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none resize-none py-2 px-1 max-h-[140px] leading-relaxed custom-scrollbar font-sans"
        />

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!content.trim() || isSending || disabled}
          className="p-2.5 rounded-xl bg-accent-primary hover:opacity-90 active:scale-95 text-white disabled:opacity-40 disabled:hover:opacity-40 disabled:active:scale-100 transition-all shrink-0 shadow-md flex items-center justify-center"
          title="Send message (Enter)"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
