// Which development surface covers the Spaces, kept outside React so an OS-driven remount does not drop it.
import { useSyncExternalStore } from "react";
import { devToolsEnabled, type HomeDataScenario, type WorldDataScenario, type WorldHostScenario } from "./links";

export const DEV_TOOLS = devToolsEnabled(__DEV__, process.env.EXPO_PUBLIC_SYLF_DEV_TOOLS);

interface DevSurface { showcase: boolean; chapter: string | null; request: number; homeData: HomeDataScenario | null; worldData: WorldDataScenario | null; worldHost: WorldHostScenario | null; probe: boolean }

let surface: DevSurface = { showcase: false, chapter: null, request: 0, homeData: null, worldData: null, worldHost: null, probe: false };
const listeners = new Set<() => void>();
const publish = (next: DevSurface) => { surface = next; listeners.forEach((listener) => listener()); };

export const openShowcase = (chapter: string | null = null) => publish({ ...surface, showcase: true, chapter, request: surface.request + 1 });
export const closeShowcase = () => publish({ ...surface, showcase: false });
export const openProbe = () => publish({ ...surface, probe: true });
export const setHomeDataScenario = (homeData: HomeDataScenario | null) => publish({ ...surface, homeData });
export const setWorldScenarios = (worldData: WorldDataScenario | null, worldHost: WorldHostScenario | null) => publish({ ...surface, worldData: worldData ?? surface.worldData, worldHost: worldHost ?? surface.worldHost });
/** Read when someone enters, not during render, so the World controller does not need to know about the development surface. */
export const worldHostScenario = () => surface.worldHost;
export const useDevSurface = () => useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => surface, () => surface);
