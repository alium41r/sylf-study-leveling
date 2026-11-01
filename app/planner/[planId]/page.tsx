import { notFound } from "next/navigation";
import StudentPlannerScreen from "@/app/components/planner/student/StudentPlannerScreen";
import { DurableIdV2Schema } from "@/lib/planner/v2/contracts";
export default async function PlannerPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  if (!DurableIdV2Schema.safeParse(planId).success) notFound();
  return <StudentPlannerScreen initialPlanId={planId} />;
}
