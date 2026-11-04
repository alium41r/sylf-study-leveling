// What every destination shares: a still strip that lines up with the Spaces icon, and a page that scrolls beneath it and
// comes back to where it was. The sample notice sits in the strip, so it stays on screen however far a page is scrolled.
import { useRef, useSyncExternalStore, type ComponentRef, type ReactNode } from "react";
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Badge, Button, EmptyState, IconButton, Placeholder, Segmented, Stack, Text, useDismiss, useTheme, useWindowClass, type IconName } from "@sylf/design-system";
import { HOME_VIEWS, type HomeDestination, type HomeViewDestination, type HomeViewOf } from "@sylf/spaces";
import { useDockMetrics, useHomeNavigation, useShellMetrics } from "../../shell/context";
import type { LiveStatus } from "../../shell/live-result";
import type { Provenance } from "./data/contracts";

const PAGE_WIDTH = 1080;
/** Below this a line of context is a stub of a word, which says less than nothing, so it steps aside. */
const MIN_EYEBROW = 144;
const BADGE_ROOM = 108;
/** Side by side until a section would be narrower than this, then they wrap, so a third section never squeezes the others. */
const SECTION_WIDTH = 260;
const LOADING_ROWS = ["100%", "82%", "64%"] as const;

function useRestoredScroll(destination: HomeDestination, ready: boolean) {
  const navigation = useHomeNavigation();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const target = useRef(navigation.scrollOf(destination));
  const isReady = useRef(ready);
  isReady.current = ready;
  // Waits for the page's real content: before that the position would be clamped to the height of the loading state.
  const onContentSizeChange = () => {
    if (!isReady.current || !target.current) return;
    scroller.current?.scrollTo({ y: target.current, animated: false });
    target.current = 0;
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => { if (!target.current) navigation.noteScroll(destination, event.nativeEvent.contentOffset.y); };
  return { ref: scroller, onContentSizeChange, onScroll };
}

export function HomePage({ destination, eyebrow, provenance, live, ready, children }: { destination: HomeDestination; eyebrow?: string; provenance?: Provenance; live?: LiveStatus; ready: boolean; children: ReactNode }) {
  const { color, space } = useTheme();
  const { size, width } = useWindowClass();
  const { control, edge, insets, left, rail, top } = useShellMetrics();
  const { restLeft } = useDockMetrics();
  const scroll = useRestoredScroll(destination, ready);
  const compact = size === "compact";
  // The strip shares its line with the timer dock, so its words stop short of it. In a narrow window the sample notice is what stays.
  const stripStart = compact ? left + control + space.md : insets.left + rail + space.xl + Math.max(0, (width - insets.left - rail - space.xl - insets.right - space.xxl - PAGE_WIDTH) / 2);
  const stripRoom = restLeft - space.md - stripStart;
  const sides = compact ? { paddingLeft: insets.left + space.lg, paddingRight: insets.right + space.lg } : { paddingLeft: space.xl, paddingRight: insets.right + space.xxl };
  return (
    <View style={{ flex: 1 }}>
      <View style={{ marginTop: top, marginBottom: space.sm, height: control, justifyContent: "center", ...(compact ? { paddingLeft: left + control + space.md, paddingRight: insets.right + edge } : sides) }}>
        <View style={{ width: "100%", maxWidth: PAGE_WIDTH, alignSelf: "center" }}>
          <View testID={`home-strip-${destination}`} style={{ flexDirection: "row", alignItems: "center", gap: space.md, maxWidth: stripRoom }}>
            {eyebrow && stripRoom >= (provenance === "sample" ? MIN_EYEBROW + BADGE_ROOM : MIN_EYEBROW) ? <Text variant="caption" tone="soft" numberOfLines={1} style={{ flexShrink: 1 }}>{eyebrow}</Text> : null}
            {provenance === "sample" ? <View aria-label="Sample data. Nothing in Home is real yet."><Badge label="Sample data" /></View> : null}
            {live?.offline ? <View testID="home-offline" aria-label="Offline. Showing what you last saw."><Badge label="Offline" /></View> : null}
          </View>
        </View>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        {...scroll}
        testID={`home-scroll-${destination}`}
        style={{ flex: 1 }}
        scrollEventThrottle={64}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ ...sides, paddingTop: space.lg, paddingBottom: compact ? space.xl : space.sky + insets.bottom, backgroundColor: color.ground }}
      >
        <View style={{ width: "100%", maxWidth: PAGE_WIDTH, alignSelf: "center", gap: space.air }}>{children}</View>
      </ScrollView>
    </View>
  );
}

/** Two columns only when there is room for both. Between the sizes, the supporting sections sit side by side under the main one. */
export function HomeColumns({ primary, secondary }: { primary: ReactNode; secondary: ReactNode[] }) {
  const { space } = useTheme();
  const { size } = useWindowClass();
  if (size === "expanded") return <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.air }}><View style={{ flex: 3, minWidth: 0, gap: space.air }}>{primary}</View><View style={{ flex: 2, minWidth: 0, gap: space.air }}>{secondary}</View></View>;
  return (
    <>
      <View style={{ gap: space.air }}>{primary}</View>
      {size === "medium" ? <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: space.xxl }}>{secondary.map((section, index) => <View key={index} style={{ flexGrow: 1, flexBasis: SECTION_WIDTH, minWidth: 0 }}>{section}</View>)}</View> : <View style={{ gap: space.air }}>{secondary}</View>}
    </>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="md">
      <Text variant="subheading" role="heading" aria-level={2}>{title}</Text>
      {children}
    </Stack>
  );
}

/** The view a destination is on, kept with Home's other state so it survives everything that does. */
export function useHomeView<D extends HomeViewDestination>(destination: D): HomeViewOf<D> {
  const navigation = useHomeNavigation();
  return useSyncExternalStore(navigation.subscribeDetail, () => navigation.viewOf(destination), () => navigation.viewOf(destination));
}

/** One level of navigation inside a destination. It is `Segmented`, so it scrolls in a narrow window and its Marker travels as everywhere else. */
export function SubNav<D extends HomeViewDestination>({ destination, label, labels }: { destination: D; label: string; labels: Record<HomeViewOf<D>, string> }) {
  const navigation = useHomeNavigation();
  const value = useHomeView(destination);
  const options = (HOME_VIEWS[destination] as readonly HomeViewOf<D>[]).map((view) => ({ value: view, label: labels[view] }));
  return <View testID={`home-subnav-${destination}`}><Segmented<HomeViewOf<D>> label={label} value={value} options={options} onChange={(view) => navigation.setView(destination, view)} /></View>;
}

/** A page pushed inside a destination, for a long flow. Back, Escape and Android Back all leave it, because it joins the one dismiss stack. */
export function PushedPage({ title, onBack, children, testID }: { title: string; onBack: () => void; children: ReactNode; testID?: string }) {
  const { space } = useTheme();
  useDismiss(true, onBack);
  return (
    <Stack gap="lg">
      <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <IconButton icon="chevronLeft" label="Back" testID="pushed-back" onPress={onBack} />
        <Text variant="heading" role="heading" aria-level={1} numberOfLines={1} style={{ flex: 1 }}>{title}</Text>
      </View>
      {children}
    </Stack>
  );
}

export function PageTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <Stack gap="xs">
      <Text variant="display" role="heading" aria-level={1}>{title}</Text>
      {detail ? <Text tone="soft" style={{ maxWidth: 560 }}>{detail}</Text> : null}
    </Stack>
  );
}

/** A destination with nothing in it yet. Written for a real person, because a build without sample data shows these. */
export function EmptyPage({ title, icon, heading, message }: { title: string; icon: IconName; heading: string; message: string }) {
  return (
    <>
      <PageTitle title={title} />
      <EmptyState icon={icon} title={heading} message={message} />
    </>
  );
}

/** A read that failed with nothing to fall back on. It says why, and offers the one thing that could help. */
export function FailedPage({ title, icon, live }: { title: string; icon: IconName; live: LiveStatus }) {
  return (
    <>
      <PageTitle title={title} />
      <View testID="home-failed"><EmptyState icon={icon} title={live.offline ? "You're offline" : "This didn't load"} message={live.failure ?? "Try again in a moment."} action={<Button title="Try again" size="small" testID="home-retry" onPress={live.retry} />} /></View>
    </>
  );
}

export function LoadingPage({ title }: { title: string }) {
  const { space } = useTheme();
  return (
    <>
      <PageTitle title={title} />
      <View aria-label="Loading" style={{ gap: space.md, maxWidth: 560 }}>{LOADING_ROWS.map((width) => <Placeholder key={width} width={width} />)}</View>
    </>
  );
}

