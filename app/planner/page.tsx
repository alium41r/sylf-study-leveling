import { redirect } from "next/navigation";
import StudentPlannerScreen from "@/app/components/planner/student/StudentPlannerScreen";
import { DurableIdV2Schema } from "@/lib/planner/v2/contracts";
export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ planId?: string }>;
}) {
  const { planId } = await searchParams;
  if (planId && DurableIdV2Schema.safeParse(planId).success)
    redirect(`/planner/${planId}`);
  return <StudentPlannerScreen />;
}
