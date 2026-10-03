"use client";

import React from "react";
import { Command, CalendarDays } from "lucide-react";
import { ObjectiveTargetIcon, QuestEmblemIcon } from "@/app/components/icons";
import type { PresenceIcon } from "./page-presence";

const ICONS: Record<PresenceIcon, React.ComponentType<{ className?: string }>> = {
  command: Command,
  calendar: CalendarDays,
  target: ObjectiveTargetIcon,
  scroll: QuestEmblemIcon,
};

export function PresenceIconBadge({
  icon,
  className = "w-4 h-4",
}: {
  icon: PresenceIcon;
  className?: string;
}) {
  const Icon = ICONS[icon] || Command;
  return <Icon className={className} />;
}
