/** Public UI contract; signed arguments stay opaque to clients. */
export interface PendingSylvieAction {
  token: string;
  summary: string;
}

export const SYLVIE_ACTION_MARKER = /\s*<!-- sylvie-action:([A-Za-z0-9+/=]+) -->/g;

export function stripSylvieAction(content: string): string {
  return content.replace(SYLVIE_ACTION_MARKER, "")
    .replace(/\s*<!-- sylvie-planner:[A-Za-z0-9+/=]+ -->/g, "").trim();
}
