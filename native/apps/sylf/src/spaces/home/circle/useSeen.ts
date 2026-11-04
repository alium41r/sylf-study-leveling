// True while a Home destination is the one on screen and the app is in the foreground. Anything that polls asks this first, so a destination that
// stays mounted after its first visit (R17) reads nothing in the background.
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import type { HomeDestination } from "@sylf/spaces";
import { useHomeNavigation } from "../../../shell/context";

export function useDestinationSeen(destination: HomeDestination): boolean {
  const navigation = useHomeNavigation();
  const current = useSyncExternalStore(navigation.subscribe, () => navigation.destination(), () => navigation.destination());
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => { const subscription = AppState.addEventListener("change", (state) => setForeground(state === "active")); return () => subscription.remove(); }, []);
  return current === destination && foreground;
}
