"use client";
import { useState, type FormEvent } from "react";
import { Plus, ArrowRight } from "lucide-react";
import { parseQuickEvent } from "@/lib/calendar/quick-add";
import type { EventInput } from "@/lib/calendar/contracts";
import styles from "../Scheduling.module.css";
export default function QuickAdd({
  today,
  selected,
  timezone,
  onReview,
}: {
  today: string;
  selected: string;
  timezone: string;
  onReview: (initial: EventInput, hints: string[]) => void;
}) {
  const [text, setText] = useState(""),
    [error, setError] = useState("");
  const review = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const result = parseQuickEvent(text, today, selected, timezone);
      onReview(result.data, result.hints);
      setText("");
    } catch (err) {
      setError(
        (err as { issues?: { message: string }[] }).issues?.[0]?.message ||
          (err instanceof Error ? err.message : "Check your event.")
      );
    }
  };
  return (
    <div className={styles.quickAdd}>
      <form onSubmit={review}>
        <Plus size={17} />
        <input
          aria-label="Quick add event"
          placeholder="Add a plan… “Physics exam tomorrow at 10 AM”"
          maxLength={300}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button aria-label="Review quick event" disabled={!text.trim()}>
          <ArrowRight size={18} />
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
