// Going into the Focus environment from anywhere. Entering starts the session when none exists, so "Enter" is one action wherever it sits, and a
// timed rhythm asks once for permission to alert when a phase ends with the app away. A session already running is simply returned to.
import { useCallback } from "react";
import { Button } from "@sylf/design-system";
import { useSessionState, useStudySession } from "../context";
import { takeParty } from "../party/studyWith";
import { askOnce } from "./alerts";
import { focusEnvironment } from "./environment";

type Context = { title?: string; subject?: string | null; subjectId?: number | null; questId?: number | null };

export function useEnterFocus() {
  const session = useStudySession();
  return useCallback((context?: Context) => {
    if (session.status() === "idle" && session.start({ ...context, ...takeParty() }) && session.readout().fraction !== null) void askOnce();
    focusEnvironment.open();
  }, [session]);
}

/** The one way into the environment on a surface that is not Focus. Idle, it begins; running, it returns. */
export function EnterFocusButton({ surface, onEnter, variant = "ghost" }: { surface: string; onEnter?: () => void; variant?: "ghost" | "emphasis" }) {
  const enter = useEnterFocus();
  const { active } = useSessionState();
  return <Button title={active ? "Back to focus" : "Enter focus"} variant={variant} icon="focus" fill testID={`${surface}-enter-focus`} onPress={() => { onEnter?.(); enter(); }} />;
}
