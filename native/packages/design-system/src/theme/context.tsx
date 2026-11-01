// Delivers the resolved theme. The provider also owns everything a theme touches outside React's tree:
// fonts, the root background, and the status bar.
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { AccessibilityInfo, StyleSheet, View, useColorScheme, useWindowDimensions, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { applyRootBackground, useSystemContrast } from "../runtime/system";
import { installInputListeners } from "../runtime/input-listeners";
import { windowSizeClass, type WindowSizeClass } from "@sylf/platform";
import type { ThemeAxes } from "./axes";
import { fontsReady, loadFonts } from "./font-loader";
import { resolveAxes, type AccessPreference } from "./preference";
import { resolveDesignCached, type DesignTheme } from "./resolve";
import type { AppearanceSnapshot, AppearanceStore } from "./store";

const ThemeContext = createContext<DesignTheme | null>(null);
const StoreContext = createContext<AppearanceStore | null>(null);
const FormatContext = createContext<"touch" | "pointer">("touch");
const AccessContext = createContext<{ moreContrast: boolean; reducedMotion: boolean; textScale: number } | null>(null);

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme needs an <AppearanceProvider>.");
  return theme;
}

export function useAppearanceStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useAppearanceStore needs an <AppearanceProvider>.");
  return store;
}

export function useAppearance(): AppearanceSnapshot {
  const store = useAppearanceStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Touch-sized or pointer-sized controls. Follows the device's primary input, never the current window. */
export const useInputFormat = () => useContext(FormatContext);

export function useControlHeight() {
  const { density } = useTheme();
  return density.control[useInputFormat()];
}

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/** Themed styles, rebuilt only when the theme changes. Factories live at module level so identity is stable. */
export function useThemedStyles<T extends NamedStyles>(factory: (theme: DesignTheme) => T): T {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(factory(theme)) as T, [factory, theme]);
}

function themeFaces(theme: DesignTheme) {
  return [...new Set(Object.values(theme.type).map((style) => style.fontFamily as string))];
}

function useResolvedAccess(access: AccessPreference) {
  const systemContrast = useSystemContrast();
  const [systemReduced, setSystemReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (live) setSystemReduced(value); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setSystemReduced);
    return () => { live = false; sub.remove(); };
  }, []);
  return { moreContrast: access.contrast === "more" || systemContrast, reducedMotion: access.motion === "reduced" || systemReduced, textScale: access.textScale };
}

export interface AppearanceProviderProps {
  store: AppearanceStore;
  inputFormat: "touch" | "pointer";
  children: ReactNode;
}

export function AppearanceProvider({ store, inputFormat, children }: AppearanceProviderProps) {
  const { preference } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const scheme = useColorScheme();
  const access = useResolvedAccess(preference.access);
  const mode = preference.mode === "system" ? (scheme === "dark" ? "dark" : "light") : preference.mode;
  const axes = useMemo(() => resolveAxes(preference), [preference]);
  const next = useMemo(() => resolveDesignCached(axes, { mode, ...access }), [axes, mode, access.moreContrast, access.reducedMotion, access.textScale]);

  // Web loads faces on demand: the old theme stays up until the new one can render without a flash of fallback text.
  const [theme, setTheme] = useState<DesignTheme | null>(fontsReady() ? next : null);
  useEffect(() => {
    let live = true;
    void loadFonts(themeFaces(next)).catch(() => undefined).finally(() => { if (live) setTheme(next); });
    return () => { live = false; };
  }, [next]);
  useEffect(() => installInputListeners(), []);
  useEffect(() => { if (theme) applyRootBackground(theme.color.ground); }, [theme]);

  if (!theme) return null;
  return (
    <StoreContext.Provider value={store}>
      <FormatContext.Provider value={inputFormat}>
        <AccessContext.Provider value={access}>
          <ThemeContext.Provider value={theme}>
            <StatusBar style={theme.palette.polarity === "dark" ? "light" : "dark"} />
            <ThemeVeil ground={theme.color.ground} />
            {children}
          </ThemeContext.Provider>
        </AccessContext.Provider>
      </FormatContext.Provider>
    </StoreContext.Provider>
  );
}

/** A themed subtree: live previews now, per-Space themes later. It only changes tokens, so it costs one resolution. */
export function ThemeScope({ axes, mode, children }: { axes: ThemeAxes; mode?: DesignTheme["mode"]; children: ReactNode }) {
  const parent = useTheme();
  const access = useContext(AccessContext);
  // The system's accessibility settings count as well as the app's own, so a scoped subtree cannot animate past reduced motion.
  const context = { mode: mode ?? parent.mode, moreContrast: access?.moreContrast, reducedMotion: access?.reducedMotion, textScale: access?.textScale };
  const theme = useMemo(() => resolveDesignCached(axes, context), [axes, context.mode, context.moreContrast, context.reducedMotion, context.textScale]);
  useEffect(() => { void loadFonts(themeFaces(theme)).catch(() => undefined); }, [theme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Hands a captured theme to content rendered elsewhere (portals keep the scope they were opened from). */
export const ThemeRelay = ThemeContext.Provider;

/** On a theme or mode change, the previous ground dissolves instead of the whole screen snapping. */
function ThemeVeil({ ground }: { ground: string }) {
  const theme = useTheme();
  const [veil, setVeil] = useState<string | null>(null);
  const [last, setLast] = useState(ground);
  const opacity = useSharedValue(0);
  if (ground !== last) { setLast(ground); setVeil(last); }
  useEffect(() => {
    if (!veil) return;
    opacity.value = 1;
    opacity.value = withTiming(0, { duration: theme.motion.reduced ? 90 : 260 });
    const timer = setTimeout(() => setVeil(null), 300);
    return () => clearTimeout(timer);
  }, [veil, opacity, theme.motion.reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (!veil) return null;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}><Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: veil }, style]} /></View>;
}

export function useWindowClass(): { size: WindowSizeClass; width: number; height: number; landscape: boolean } {
  const { width, height } = useWindowDimensions();
  return { size: windowSizeClass(width), width, height, landscape: width > height };
}
