// One section of the Account page: a title, and what belongs under it. It reports where it sits, so the index beside the page can scroll to it.
import type { ReactNode } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Stack, Text } from "@sylf/design-system";

export function AccountSection({ id, title, detail, onPlace, children }: { id: string; title: string; detail?: string; onPlace: (id: string, y: number) => void; children: ReactNode }) {
  return (
    <Stack gap="md" testID={`account-section-${id}`} onLayout={(event: LayoutChangeEvent) => onPlace(id, event.nativeEvent.layout.y)}>
      <Stack gap="xs">
        <Text variant="heading" role="heading" aria-level={2}>{title}</Text>
        {detail ? <Text variant="small" tone="soft">{detail}</Text> : null}
      </Stack>
      {children}
    </Stack>
  );
}
