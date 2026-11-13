// Plan answers what's ahead, and how to shape it. Three views, one level of navigation, and each mounts the first time it is opened and stays, so going
// back and forth costs nothing (risk R17). With nobody signed in there is nothing of anyone's to plan, and it says so.
import { Suspense, lazy, useState } from "react";
import { View } from "react-native";
import { EmptyState, useTheme } from "@sylf/design-system";
import type { HomeViewOf } from "@sylf/spaces";
import { useLiveBackend } from "../../../shell/backend";
import { HomePage, PageTitle, SubNav, useHomeView } from "../HomePage";

const CalendarView = lazy(() => import("../plan/CalendarView").then((module) => ({ default: module.CalendarView })));
const QuestsView = lazy(() => import("../plan/QuestsView").then((module) => ({ default: module.QuestsView })));
const PlansView = lazy(() => import("../plan/PlansView").then((module) => ({ default: module.PlansView })));
const StudioView = lazy(() => import("../plan/studio/StudioView").then((module) => ({ default: module.StudioView })));

type View_ = HomeViewOf<"plan">;
const LABELS: Record<View_, string> = { studio: "Planner", calendar: "Calendar", quests: "Quests and goals", plans: "Classic plans" };
const SCREENS = { studio: StudioView, calendar: CalendarView, quests: QuestsView, plans: PlansView };

export function PlanDestination() {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const view = useHomeView("plan");
  const [visited, setVisited] = useState<View_[]>([view]);
  if (!visited.includes(view)) setVisited([...visited, view]);
  return (
    <HomePage destination="plan" eyebrow="What's ahead" ready>
      <PageTitle title="Plan" />
      {!backend ? <EmptyState icon="calendar" title="Your plan lives in your account" message="Sign in to keep a calendar, quests and goals, on every device." /> : (
        <View style={{ gap: space.xl }}>
          <SubNav destination="plan" label="Plan views" labels={LABELS} />
          {visited.map((id) => {
            const Screen = SCREENS[id];
            return <View key={id} style={id === view ? undefined : { display: "none" }} testID={`plan-view-${id}`}><Suspense fallback={null}><Screen /></Suspense></View>;
          })}
        </View>
      )}
    </HomePage>
  );
}
