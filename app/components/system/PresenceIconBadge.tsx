"use client";

import { Command, CalendarDays, Target, ScrollText } from "lucide-react";
import type { PresenceIcon } from "./page-presence";

const ICONS: Record<PresenceIcon, typeof Command> = {
  command: Command,
  calendar: CalendarDays,
  target: Target,
  scroll: ScrollText,
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
