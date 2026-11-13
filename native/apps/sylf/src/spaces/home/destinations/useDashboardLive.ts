// True only while the dashboard is what the person is looking at: Today is the destination on screen, the app is in front, the account page is not over it
// and the Focus environment is not open above the Spaces. Anything on the dashboard that moves or ticks asks this first, so a hidden dashboard does no work.
import { useSyncExternalStore } from "react";
import { useHomeNavigation } from "../../../shell/context";
import { useFocusEnvironmentOpen } from "../../../shell/focus/environment";
import { useDestinationSeen } from "../circle/useSeen";

export function useDashboardLive(): boolean {
  const navigation = useHomeNavigation();
  const seen = useDestinationSeen("today");
  const accountOpen = useSyncExternalStore(navigation.subscribeDetail, navigation.accountOpen, navigation.accountOpen);
  const environmentOpen = useFocusEnvironmentOpen();
  return seen && !accountOpen && !environmentOpen;
}
