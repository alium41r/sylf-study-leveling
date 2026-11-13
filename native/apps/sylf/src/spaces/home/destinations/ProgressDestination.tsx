import { Suspense, lazy, useState } from "react";
import { View } from "react-native";
import { useTheme } from "@sylf/design-system";
import type { HomeViewOf } from "@sylf/spaces";
import { HomePage, PageTitle, SubNav, useHomeView } from "../HomePage";

const OverviewView = lazy(() => import("../progress/OverviewView").then((module) => ({ default: module.OverviewView })));
const StatsView = lazy(() => import("../progress/StatsView").then((module) => ({ default: module.StatsView })));
const StandingView = lazy(() => import("../progress/StandingView").then((module) => ({ default: module.StandingView })));
const HonoursView = lazy(() => import("../progress/HonoursView").then((module) => ({ default: module.HonoursView })));
const SkillsView = lazy(() => import("../progress/SkillsView").then((module) => ({ default: module.SkillsView })));
const CodexView = lazy(() => import("../progress/CodexView").then((module) => ({ default: module.CodexView })));

type View_ = HomeViewOf<"progress">;
const LABELS: Record<View_, string> = { overview: "Overview", stats: "Stats", standing: "Standing", honours: "Honours", skills: "Skills", codex: "Codex" };
const SCREENS = { overview: OverviewView, stats: StatsView, standing: StandingView, honours: HonoursView, skills: SkillsView, codex: CodexView };

export function ProgressDestination() {
  const { space } = useTheme();
  const view = useHomeView("progress");
  const [visited, setVisited] = useState<View_[]>([view]);
  if (!visited.includes(view)) setVisited([...visited, view]);
  return (
    <HomePage destination="progress" eyebrow="Your study record" ready>
      <PageTitle title="Progress" />
      <View style={{ gap: space.xl }}>
        <SubNav destination="progress" label="Progress views" labels={LABELS} />
        {visited.map((id) => {
          const Screen = SCREENS[id];
          return <View key={id} style={id === view ? undefined : { display: "none" }} testID={`progress-view-${id}`}><Suspense fallback={null}><Screen /></Suspense></View>;
        })}
      </View>
    </HomePage>
  );
}
