// What the tool shells share. Each tool gets its window's small state and lifecycle and nothing else, so a tool cannot reach
// into the window manager, and each draws inside the same quiet page. Nothing in a hidden window may run, so a tool asks `isSeen` first.
import type { ComponentRef, ReactNode, Ref } from "react";
import { ScrollView, View, type ScrollViewProps } from "react-native";
import { Button, EmptyState, Placeholder, Stack, useTheme, type IconName } from "@sylf/design-system";
import type { ToolLifecycle, ToolState, WorkspaceWindow } from "@sylf/spaces";
import { useWorkspaceModel } from "../../../shell/context";
import type { LiveStatus } from "../../../shell/live-result";

export interface ToolProps {
  window: WorkspaceWindow;
  lifecycle: ToolLifecycle;
  patch: (state: ToolState) => void;
}

export const isSeen = (lifecycle: ToolLifecycle) => lifecycle === "active" || lifecycle === "visible";

/** The document this window shows: its own, or one no other window of this tool has open, so a second window is a second document. */
export function useWindowDocument<T extends { id: string }>(window: WorkspaceWindow, documents: T[]): T | undefined {
  const model = useWorkspaceModel();
  const own = documents.find((item) => item.id === window.state.document);
  if (own) return own;
  const taken = new Set(model.state().windows.filter((other) => other.id !== window.id && other.tool === window.tool).map((other) => other.state.document));
  return documents.find((item) => !taken.has(item.id)) ?? documents[0];
}

export function ToolPage({ children, padded = true, contentContainerStyle, ref, ...rest }: ScrollViewProps & { children: ReactNode; padded?: boolean; ref?: Ref<ComponentRef<typeof ScrollView>> }) {
  const { space } = useTheme();
  // "handled": by default a tap with a field focused only dismisses the keyboard, so a button under a field would need pressing twice.
  return <ScrollView ref={ref} showsVerticalScrollIndicator={false} overScrollMode="never" keyboardShouldPersistTaps="handled" {...rest} style={{ flex: 1 }} contentContainerStyle={contentContainerStyle ?? (padded ? { padding: space.lg, gap: space.lg } : undefined)}>{children}</ScrollView>;
}

export function ToolLoading() {
  const { space } = useTheme();
  return <View aria-label="Loading" style={{ padding: space.lg, gap: space.md }}><Placeholder width="72%" height={16} /><Placeholder width="100%" /><Placeholder width="88%" /><Placeholder width="64%" /></View>;
}

export function ToolEmpty({ icon, title, message }: { icon: IconName; title: string; message: string }) {
  const { space } = useTheme();
  return <View style={{ flex: 1, justifyContent: "center", padding: space.md }}><EmptyState icon={icon} title={title} message={message} /></View>;
}

/** A tool later work owns, for someone signed in. It says what is true now, with no sample and no empty shelf that implies something is missing. */
export function ToolLimited({ icon, title, message }: { icon: IconName; title: string; message: string }) {
  return <View testID="tool-state-limited" style={{ flex: 1 }}><ToolEmpty icon={icon} title={title} message={message} /></View>;
}

/** A read that failed with nothing to fall back on. */
export function ToolFailed({ icon, live }: { icon: IconName; live: LiveStatus }) {
  const { space } = useTheme();
  return <View style={{ flex: 1, justifyContent: "center", padding: space.md }}><EmptyState icon={icon} title={live.offline ? "You're offline" : "This didn't load"} message={live.failure ?? "Try again in a moment."} action={<Button title="Try again" size="small" onPress={live.retry} />} /></View>;
}

/** A sentence saying what is not here yet. The window stays useful and honest at the same time. */
export function ToolFootnote({ children }: { children: ReactNode }) {
  const { space } = useTheme();
  return <Stack style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>{children}</Stack>;
}
