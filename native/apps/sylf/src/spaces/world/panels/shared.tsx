// What the lobby's panels share: a heading with the sample notice, and the row for something that arrives with the game.
import type { ReactNode } from "react";
import { View } from "react-native";
import { Badge, EmptyState, ListRow, Placeholder, Stack, Text, useTheme, type IconName } from "@sylf/design-system";
import type { Provenance } from "../data/contracts";

export function SampleNotice({ provenance }: { provenance?: Provenance }) {
  return provenance === "sample" ? <View aria-label="Sample data. Nothing here is real yet."><Badge label="Sample data" /></View> : null;
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <Text variant="label" tone="soft" role="heading" aria-level={3}>{children}</Text>;
}

/** Honest about what is not here yet: it says when it arrives, and it cannot be pressed. */
export function ReservedRow({ title, detail, icon }: { title: string; detail: string; icon?: IconName }) {
  return <ListRow title={title} detail={detail} icon={icon} trailing={<Badge label="Later" />} />;
}

export function PanelLoading() {
  const { space } = useTheme();
  return <Stack gap="md" style={{ paddingVertical: space.sm }}>{(["100%", "78%", "56%"] as const).map((width) => <Placeholder key={width} width={width} height={14} />)}</Stack>;
}

export function PanelEmpty({ title, message, icon }: { title: string; message: string; icon: IconName }) {
  return <EmptyState title={title} message={message} icon={icon} />;
}
