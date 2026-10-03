"use client";
import { useEffect, useRef, useState } from "react";
import {
  isReaction,
  normalizeState,
  REACTIONS,
  type CompanionReaction,
  type CompanionState,
  type ReactionState,
} from "./model";

/** One active reaction, one expiry timer, no queue. Higher-priority reactions win.
 * Changing the base product state cancels a reaction; expiry returns to that base.
 */
export function useCompanionState(
  state: CompanionState,
  reaction?: CompanionReaction
) {
  const requested = normalizeState(state);
  const base = isReaction(requested) ? "IDLE" : requested;
  const [active, setActive] = useState<ReactionState | null>(null);
  const current = useRef<ReactionState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastToken = useRef<string | null>(null);
  const previousBase = useRef(base);
  const type =
    reaction?.type ?? (isReaction(requested) ? requested : undefined);
  const token = reaction
    ? `${reaction.type}:${reaction.id}`
    : isReaction(requested)
      ? requested
      : null;

  useEffect(() => {
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      current.current = null;
      setActive(null);
    };
    if (previousBase.current !== base) {
      previousBase.current = base;
      clear();
    }
    if (!token || !type || !Object.hasOwn(REACTIONS, type)) {
      lastToken.current = null;
      clear();
      return;
    }
    if (lastToken.current === token) return;
    lastToken.current = token;
    if (
      current.current &&
      REACTIONS[current.current].priority > REACTIONS[type].priority
    )
      return;
    clear();
    current.current = type;
    setActive(type);
    timer.current = setTimeout(clear, REACTIONS[type].duration);
  }, [base, token, type]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      current.current = null;
      lastToken.current = null;
    },
    []
  );
  return active ?? base;
}
