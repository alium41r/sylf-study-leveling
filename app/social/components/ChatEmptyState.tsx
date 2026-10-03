"use client";

import React from "react";
import { MessageSquare } from "lucide-react";
import { QuestEmblemIcon, ObjectiveTargetIcon, FocusClockIcon, SystemApertureIcon } from "@/app/components/icons";

interface ChatEmptyStateProps {
  isGroup: boolean;
  displayName: string;
  onSelectPrompt: (prompt: string) => void;
}

const STARTER_PROMPTS = [
  { text: "Hey! Ready to study?", icon: SystemApertureIcon },
  { text: "Starting a deep focus session now.", icon: FocusClockIcon },
  { text: "What goals are you working on today?", icon: ObjectiveTargetIcon },
  { text: "Let's crush today's quests!", icon: QuestEmblemIcon },
];

export function ChatEmptyState({ isGroup, displayName, onSelectPrompt }: ChatEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 sm:p-8 select-none my-auto">
      {/* Holographic transmission beacon */}
      <div className="relative group mb-4">
        <div className="absolute -inset-4 rounded-full bg-accent-primary/20 blur-xl opacity-70 pointer-events-none" />
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-primary/25 to-accent-primary/5 border border-accent-primary/30 flex items-center justify-center text-accent-text-light shadow-lg relative z-10">
          <MessageSquare className="w-7 h-7 text-accent-primary-light" />
        </div>
      </div>

      <div className="space-y-1.5 max-w-sm mb-6">
        <h3 className="text-lg sm:text-xl font-bold font-['Rajdhani'] text-text-primary tracking-wide">
          {isGroup ? displayName : `Direct Channel: ${displayName}`}
        </h3>
        <p className="text-xs text-text-muted font-['Rajdhani'] leading-relaxed">
          {isGroup
            ? "Welcome to the group channel. Share updates, coordinate study sessions, or break the ice below."
            : "Direct encrypted frequency established. Tap a quick starter or send a message to begin."}
        </p>
      </div>

      {/* Quick Starter Prompts */}
      <div className="flex flex-wrap gap-2 justify-center max-w-md">
        {STARTER_PROMPTS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectPrompt(item.text)}
              className="px-3.5 py-2 rounded-xl bg-bg-abyss/80 hover:bg-accent-primary-dim border border-border-subtle hover:border-accent-primary/40 text-xs font-['Rajdhani'] font-semibold text-text-secondary hover:text-text-primary transition-all flex items-center gap-2 shadow-sm hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <Icon className="w-3.5 h-3.5 text-accent-primary-light shrink-0" />
              <span>{item.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
