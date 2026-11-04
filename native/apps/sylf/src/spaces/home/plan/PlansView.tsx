// AI plans. This view reads what exists and says whether a new plan can be built here. Asking for one, watching it and confirming it arrive in Part 3,
// in this same view, so there is only ever one place for plans. What a student confirmed on the web already shows as quests in Today and Calendar.
import { View } from "react-native";
import { Callout, EmptyState, ListRow, Stack, Text, useTheme } from "@sylf/design-system";
import { usePlans } from "./usePlan";

const STATE_WORDS: Record<string, string> = { DRAFT: "Draft", ACTIVE: "In use", ARCHIVED: "Archived", APPLIED: "In use" };

export function PlansView() {
  const { space } = useTheme();
  const result = usePlans();
  const data = result?.data;
  const plans = data?.plans ?? [];
  if (!result) return <View testID="plan-plans"><Text tone="soft">Loading your plans.</Text></View>;
  const available = data?.readiness.enabled === true && data.readiness.ready === true;
  return (
    <Stack gap="lg" testID="plan-plans">
      {result.live?.failure && !data ? <Callout tone="caution" title="Plans didn't load" message={result.live.failure} /> : null}
      {data && !available ? <View testID="plan-plans-unavailable"><Callout title="AI plans aren't available yet" message={data.readiness.enabled ? data.readiness.reason ?? "The planning service is starting up. Try again in a while." : "Building a plan with Sylvie isn't switched on here yet. Plans you've already confirmed appear as quests in Today and Calendar."} /></View> : null}
      {plans.length ? (
        <Stack gap={"xs"}>
          <Text variant="subheading" role="heading" aria-level={2}>Your plans</Text>
          <View style={{ gap: space.hair }}>{plans.map((plan) => <View key={plan.planId} testID={`plan-item-${plan.planId}`}><ListRow title={plan.title} detail={STATE_WORDS[plan.state] ?? plan.state} /></View>)}</View>
        </Stack>
      ) : data ? <EmptyState icon="planner" title="No plans yet" message="When there's something big to prepare for, a plan turns it into quests on your calendar." /> : null}
    </Stack>
  );
}
