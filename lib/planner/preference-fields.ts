/**
 * Client-safe closed vocabulary for learned planning preferences.
 *
 * The single source of truth for the preference types and their user-facing copy,
 * kept outside `server/` so the read/write service (`server/preferences.ts`) and
 * the management surface import the same codes and labels. Only closed canonical
 * tokens are ever displayed — never evidence, never free text.
 */
export const PREFERENCE_TYPES = [
  "SESSION_LENGTH",
  "DAILY_DENSITY",
  "DEMANDING_PLACEMENT",
  "TASK_DETAIL",
  "BUFFER_STYLE",
] as const;
export type PreferenceType = (typeof PREFERENCE_TYPES)[number];

export const PREFERENCE_TYPE_LABEL: Record<PreferenceType, string> = {
  SESSION_LENGTH: "Session length",
  DAILY_DENSITY: "Daily density",
  DEMANDING_PLACEMENT: "Demanding work placement",
  TASK_DETAIL: "Task detail",
  BUFFER_STYLE: "Buffer style",
};

/** High-level origin of an active preference. */
export type PreferenceSource = "CONFIRMED" | "OBSERVED";

/** "Planning preference", never "we learned your behaviour". */
export const PREFERENCE_SOURCE_COPY: Record<PreferenceSource, string> = {
  CONFIRMED: "You set this.",
  OBSERVED: "From your earlier planning choices.",
};

/** A closed token rendered as a short human phrase. */
export function preferenceValueCopy(type: PreferenceType, value: string): string {
  switch (type) {
    case "SESSION_LENGTH":
      return `about ${value} minutes per session`;
    case "DAILY_DENSITY":
      return `about ${value}% daily density`;
    case "DEMANDING_PLACEMENT": {
      const copy: Record<string, string> = {
        EARLY: "demanding work earlier in the day",
        MIDDAY: "demanding work mid-day",
        LATE: "demanding work later in the day",
      };
      return copy[value] ?? value;
    }
    case "TASK_DETAIL": {
      const copy: Record<string, string> = {
        LOW: "less task detail",
        MEDIUM: "moderate task detail",
        HIGH: "more task detail",
      };
      return copy[value] ?? value;
    }
    case "BUFFER_STYLE": {
      const copy: Record<string, string> = {
        NONE: "no buffer between sessions",
        BETWEEN_SESSIONS: "a buffer between sessions",
        END_OF_WEEK: "a buffer at the end of the week",
      };
      return copy[value] ?? value;
    }
  }
}
