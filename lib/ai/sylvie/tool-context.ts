/** Bound reference results without another model call. Preserve object structure,
 * identifiers and counts; explicitly disclose omitted rows/text to the assistant. */
export function boundSylvieToolResult(value: unknown, maxChars = 8000): unknown {
  let remaining = Math.max(256, maxChars - 512), truncated = false;
  const priority = ["id", "title", "name", "status", "scheduledFor", "targetDate", "requiredMinutes", "error", "totalQuests", "totalGoals", "summary", "timezone", "range", "totalMatches", "eventsTruncated", "slotsTruncated", "slots", "deadlines", "conflicts"];
  function visit(item: unknown, depth: number): unknown {
    if (remaining < 64 || depth > 6) { truncated = true; return "[omitted: narrow the request]"; }
    if (typeof item === "string") {
      const limit = Math.min(remaining - 32, 2000);
      let text = item.slice(0, limit);
      while (JSON.stringify(text).length > remaining - 32) text = text.slice(0, Math.floor(text.length / 2));
      remaining -= JSON.stringify(text).length + 24;
      if (text.length !== item.length) { truncated = true; return text + " [text truncated]"; }
      return text;
    }
    if (item instanceof Date) return visit(item.toISOString(), depth);
    if (Array.isArray(item)) {
      const out: unknown[] = [];
      for (const entry of item.slice(0, 40)) { if (remaining < 128) break; out.push(visit(entry, depth + 1)); }
      if (out.length < item.length) truncated = true;
      return out;
    }
    if (item && typeof item === "object") {
      const out: Record<string, unknown> = {};
      const entries = Object.entries(item).sort(([a], [b]) => {
        const rank = (key: string) => priority.includes(key) ? priority.indexOf(key) : priority.length;
        return rank(a) - rank(b);
      });
      for (const [key, entry] of entries) {
        if (remaining < key.length + 64) { truncated = true; break; }
        remaining -= JSON.stringify(key).length + 6; out[key] = visit(entry, depth + 1);
      }
      return out;
    }
    remaining -= 24;
    return item;
  }
  const data = visit(value, 0);
  return truncated ? { data, contextTruncated: true, instruction: "Some reference rows/text were omitted. Do not assume this is a complete list. Ask for a narrower date, status or task if needed." } : data;
}
