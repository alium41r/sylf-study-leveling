// Gives the shell and the Spaces one store, created outside React in App.tsx.
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useControlHeight, useTheme } from "@sylf/design-system";
import { placeDock, type HomeNavigation, type SessionReadout, type SpacesSnapshot, type SpacesStore, type StudySessionModel, type StudySessionState, type WorkspaceModel, type WorkspaceState, type WorldController, type WorldRuntime } from "@sylf/spaces";
import { DEV_TOOLS } from "./dev-surface";

const StoreContext = createContext<SpacesStore | null>(null);
export const SpacesProvider = StoreContext.Provider;
const HomeContext = createContext<HomeNavigation | null>(null);
export const HomeNavigationProvider = HomeContext.Provider;
const WorkspaceContext = createContext<WorkspaceModel | null>(null);
export const WorkspaceModelProvider = WorkspaceContext.Provider;
const WorldContext = createContext<WorldController | null>(null);
export const WorldControllerProvider = WorldContext.Provider;
const SessionContext = createContext<StudySessionModel | null>(null);
export const StudySessionProvider = SessionContext.Provider;

/** How to reach the account sheet. Null in a build with no backend, so nothing is drawn for it. */
const AccountEntryContext = createContext<{ open(): void } | null>(null);
export const AccountEntryProvider = AccountEntryContext.Provider;
export const useAccountEntry = () => useContext(AccountEntryContext);

export function useSpacesStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useSpacesStore needs a <SpacesProvider>.");
  return store;
}

export function useHomeNavigation() {
  const navigation = useContext(HomeContext);
  if (!navigation) throw new Error("useHomeNavigation needs a <HomeNavigationProvider>.");
  return navigation;
}

export function useWorkspaceModel() {
  const model = useContext(WorkspaceContext);
  if (!model) throw new Error("useWorkspaceModel needs a <WorkspaceModelProvider>.");
  return model;
}

export function useWorkspaceState(): WorkspaceState {
  const model = useWorkspaceModel();
  return useSyncExternalStore(model.subscribe, model.state, model.state);
}

export function useWorldController() {
  const controller = useContext(WorldContext);
  if (!controller) throw new Error("useWorldController needs a <WorldControllerProvider>.");
  return controller;
}

export function useWorldRuntime(): WorldRuntime {
  const controller = useWorldController();
  return useSyncExternalStore(controller.subscribe, controller.getRuntime, controller.getRuntime);
}

export function useStudySession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useStudySession needs a <StudySessionProvider>.");
  return session;
}

/** What has happened. It changes with an action and never with the clock, so it can sit high in a tree. */
export function useSessionState(): StudySessionState {
  const session = useStudySession();
  return useSyncExternalStore(session.subscribe, session.state, session.state);
}

/**
 * The time, for the one small piece of a screen that shows it. `live` stops at the source: a view that is hidden renders nothing
 * and adds no work, and when it returns it reads the true time, because time is derived and not counted.
 */
export function useSessionReadout(live = true): SessionReadout {
  const session = useStudySession();
  const subscribe = useCallback((listener: () => void) => {
    const stopState = session.subscribe(listener);
    const stopClock = live ? session.subscribeClock(listener) : undefined;
    return () => { stopState(); stopClock?.(); };
  }, [session, live]);
  const revision = useSyncExternalStore(subscribe, session.revision, session.revision);
  return useMemo(() => session.readout(), [session, revision, live]);
}

export function useSpaces(): SpacesSnapshot {
  const store = useSpacesStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** The longest label on Home's rail, in the widths of a caption's type. */
const RAIL_LABEL_EMS = 4;

/** Where the corner control sits. `rail` is the width of Home's rail column, so the control stays centered over it. */
export function useShellMetrics() {
  const { space, type } = useTheme();
  const control = useControlHeight();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const edge = space.md;
  // The rail's labels keep their place at large text sizes, so the column grows with them and the corner control stays centered over it.
  const label = Math.ceil(type.caption.fontSize! * Math.min(fontScale, type.caption.maxScale) * RAIL_LABEL_EMS) + space.sm;
  const rail = Math.max(edge * 2 + control, label);
  return { control, edge, insets, top: insets.top + edge, left: insets.left + (rail - control) / 2, rail, contentTop: insets.top + edge + control + space.xl };
}

/** Where the timer dock sits, for the dock itself and for anything that shares its line. Its resting width allows for an hours place. */
export function useDockMetrics() {
  const { space, type } = useTheme();
  const { control, edge, insets, top } = useShellMetrics();
  const { width, height, fontScale } = useWindowDimensions();
  const restWidth = Math.ceil(type.value.fontSize! * Math.min(fontScale, type.value.maxScale) * 5.2) + 16 + space.sm + space.md * 2;
  return { restWidth, height: control, top, ...placeDock({ window: { width, height }, insets, top, edge, control, gap: space.sm, restWidth, reservedRight: DEV_TOOLS ? control : 0 }) };
}
