"use client";

import React from "react";
import { MessageSquare, Sparkles, Send } from "lucide-react";

interface ChatEmptyStateProps {
  isGroup: boolean;
  displayName: string;
  onSelectPrompt: (prompt: string) => void;
}

const STARTER_PROMPTS = [
  "👋 Hey! Ready to study?",
  "⚡ Starting a deep focus session now.",
  "🎯 What goals are you working on today?",
  "⚔️ Let's crush today's quests!",
];

export function ChatEmptyState({ isGroup, displayName, onSelectPrompt }: ChatEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4 select-none">
      <div className="w-16 h-16 rounded-2xl bg-accent-primary-dim/30 border border-accent-primary-mid flex items-center justify-center text-accent-text-light shadow-[0_0_20px_rgba(124,58,237,0.2)]">
        <MessageSquare className="w-8 h-8" />
      </div>

      <div className="space-y-1 max-w-sm">
        <h3 className="text-xl font-bold font-['Rajdhani'] text-text-primary">
          {isGroup ? `Welcome to ${displayName}` : `Chat with ${displayName}`}
        </h3>
        <p className="text-xs text-text-muted font-['Rajdhani'] leading-relaxed">
          No messages here yet. Send a message or tap a quick prompt below to break the ice!
        </p>
      </div>

      {/* Quick Starter Prompts */}
      <div className="flex flex-wrap gap-2 justify-center max-w-md mt-2">
        {STARTER_PROMPTS.map((prompt, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSelectPrompt(prompt)}
            className="px-3.5 py-1.5 rounded-xl bg-bg-abyss/80 hover:bg-accent-primary-dim/30 border border-white/10 hover:border-accent-primary-mid text-xs font-['Rajdhani'] font-semibold text-text-secondary hover:text-text-primary transition-all flex items-center gap-1.5 shadow-sm"
          >
            <span>{prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
