"use client";
import { useAuth } from "@/app/components/AuthProvider";
import type { PlannerCapabilities } from "@/lib/planner/transport";
import StudentPlannerWorkspace from "./StudentPlannerWorkspace";

/** Keep preview authentication/refresh dependencies out of Classic and Modes.
 * The authenticated shell remains the owner of account/session state. */
export default function StudentPlannerEntry({
  capabilities,
  onExit,
  onQuotaRefresh,
  initialPlanId,
  onPlanSelected,
}: {
  capabilities: PlannerCapabilities;
  onExit: () => void;
  onQuotaRefresh: () => void;
  initialPlanId?: string;
  onPlanSelected?: (id: string | null) => void;
}) {
  const { user, refreshStats } = useAuth();
  return (
    <StudentPlannerWorkspace
      key={`${user?.id ?? "signed-out"}:${initialPlanId ?? "new"}`}
      capabilities={capabilities}
      initialPlanId={initialPlanId}
      onPlanSelected={onPlanSelected}
      onExit={onExit}
      onApplied={() => {
        onQuotaRefresh();
        void refreshStats();
      }}
    />
  );
}
