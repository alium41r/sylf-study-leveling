// What the lobby's panels share: section headings, and the row for something that arrives with the game.
import type { ReactNode } from "react";
import { Badge, EmptyState, ListRow, Placeholder, Stack, Text, useTheme, type IconName } from "@sylf/design-system";
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
