"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../AuthProvider";
import type { PendingSylvieAction } from "@/lib/ai/sylvie/action";
import type { SylviePlannerHandoff } from "@/lib/ai/sylvie/planner-bridge";
import { openPlannerHandoff } from "@/lib/ai/sylvie/planner-handoff-client";
import styles from "./SylvieResponseActions.module.css";

interface SylvieResponseActionsProps {
  pendingAction?: PendingSylvieAction;
  plannerHandoff?: SylviePlannerHandoff;
  busy: boolean;
  onConfirm: (token: string) => void | Promise<void>;
}

/** A response can offer a reviewable change or carry a request into the existing Planner. */
export default function SylvieResponseActions({
  pendingAction,
  plannerHandoff,
  busy,
  onConfirm,
}: SylvieResponseActionsProps) {
  const [settled, setSettled] = useState<{ token: string; status: "sent" | "cancelled" } | null>(null);
  const submittedRef = useRef<string | null>(null);
  if (!pendingAction && !plannerHandoff) return null;
  const status = settled?.token === pendingAction?.token ? settled?.status : undefined;

  const confirm = () => {
    if (!pendingAction || busy || submittedRef.current === pendingAction.token) return;
    submittedRef.current = pendingAction.token;
    setSettled({ token: pendingAction.token, status: "sent" });
    void onConfirm(pendingAction.token);
  };

  return (
    <div className={styles.actions}>
      {pendingAction && (status ? (
        <p className={styles.status} role="status">
          {status === "cancelled" ? "Change cancelled." : "Confirmation sent."}
        </p>
      ) : (
        <div className={styles.proposal}>
          <p className={styles.summary}>{pendingAction.summary}</p>
          <div className={styles.buttons}>
            <button type="button" className={styles.primary} disabled={busy} onClick={confirm}>Confirm change</button>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => setSettled({ token: pendingAction.token, status: "cancelled" })}>Cancel</button>
          </div>
        </div>
      ))}
      {plannerHandoff && <PlannerReview handoff={plannerHandoff} busy={busy} />}
    </div>
  );
}

function PlannerReview({ handoff, busy }: { handoff: SylviePlannerHandoff; busy: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  return (
    <button
      type="button"
      className={styles.secondary}
      disabled={busy || !user}
      onClick={() => { if (user) openPlannerHandoff(handoff, (href) => router.push(href), user.id); }}
    >
      Review in Planner
    </button>
  );
}
