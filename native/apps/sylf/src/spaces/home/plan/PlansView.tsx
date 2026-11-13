// AI plans (Part 3 slice A). The list of what exists, whether a new plan can be built here, and the one journey from a goal to confirmed quests.
// There is one place for plans, and the server owns every decision in it. Plans a student already confirmed show as quests in Today and Calendar.
import { useState } from "react";
import { View } from "react-native";
import { Button, Callout, EmptyState, ListRow, Stack, Text, useTheme } from "@sylf/design-system";
import { usePlans } from "./usePlan";
import { NewPlanSheet } from "./NewPlanSheet";
import { PlannerFlow } from "./PlannerFlow";

const STATE_WORDS: Record<string, string> = { DRAFT: "Draft", ACTIVE: "In use", ARCHIVED: "Archived", APPLIED: "In use" };

export function PlansView() {
  const { space } = useTheme();
  const result = usePlans();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Requests handed over from Sylvie now go to the Planning Studio, which owns new planning; classic plans stay here to finish and review.
  const [prefill, setPrefill] = useState("");
  const data = result?.data;
  const plans = data?.plans ?? [];
  if (!result) return <View testID="plan-plans"><Text tone="soft">Loading your plans.</Text></View>;
  if (open) return <PlannerFlow planId={open} onBack={() => setOpen(null)} />;
  const available = data?.readiness.enabled === true && data.readiness.ready === true;
  return (
    <Stack gap="lg" testID="plan-plans">
      {result.live?.failure && !data ? <Callout tone="caution" title="Plans didn't load" message={result.live.failure} /> : null}
      {data && !available ? <View testID="plan-plans-unavailable"><Callout title="AI plans aren't available yet" message={data.readiness.enabled ? data.readiness.reason ?? "The planning service is starting up. Try again in a while." : "Building a plan with Sylvie isn't switched on here yet. Plans you've already confirmed appear as quests in Today and Calendar."} /></View> : null}
      {available ? <Button title="New plan" variant="emphasis" icon="plus" testID="plan-new" onPress={() => { setPrefill(""); setCreating(true); }} /> : null}
      {plans.length ? (
        <Stack gap={"xs"}>
          <Text variant="subheading" role="heading" aria-level={2}>Your plans</Text>
          <View style={{ gap: space.hair }}>{plans.map((plan) => <View key={plan.planId} testID={`plan-item-${plan.planId}`}><ListRow title={plan.title} detail={STATE_WORDS[plan.state] ?? plan.state} onPress={() => setOpen(plan.planId)} /></View>)}</View>
        </Stack>
      ) : data ? <EmptyState icon="planner" title="No plans yet" message="When there's something big to prepare for, a plan turns it into quests on your calendar." /> : null}
      <NewPlanSheet open={creating} initialGoal={prefill} onClose={() => setCreating(false)} onCreated={(planId) => { setCreating(false); setOpen(planId); }} />
    </Stack>
  );
}
