/** One limit for sending and editing, on every client. It matches Sylvie's composer, which is the longest thing a student types here. */
export const MAX_MESSAGE_CHARACTERS = 4000;
export const MESSAGES_PER_MINUTE = 30;

export function messageRefusal(content: unknown): string | null {
  if (typeof content !== "string" || !content.trim()) return "Message content is required";
  return content.trim().length > MAX_MESSAGE_CHARACTERS ? `Messages can be up to ${MAX_MESSAGE_CHARACTERS.toLocaleString("en-US")} characters.` : null;
}
