/**
 * System Chime Tones Catalog (Archived for Settings > Alerts page)
 * 
 * Sound played upon quest completion, daily streak milestones, and level-ups.
 */

export interface SystemChimeOption {
  id: string;
  label: string;
  desc: string;
  audioKey?: string;
}

export const SYSTEM_CHIME_OPTIONS: SystemChimeOption[] = [
  {
    id: "system-ping",
    label: "Solo Leveling System Ping",
    desc: "Crisp synthetic quest bell",
  },
  {
    id: "cyber-chime",
    label: "Cybernetic Resonance",
    desc: "Sci-fi frequency harmonic",
  },
  {
    id: "sonar-radar",
    label: "Sub-bass Radar Pulse",
    desc: "Minimal low-frequency thud",
  },
  {
    id: "muted",
    label: "Mute Notification Chimes",
    desc: "Silent visual cues only",
  },
];
