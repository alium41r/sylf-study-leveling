// Where the dashboard begins: the date, the greeting, and the day in one sentence.
// It heads the progress part on a desktop and the whole page on a phone.
import { memo } from "react";
import { View } from "react-native";
import { Stack, Text } from "@sylf/design-system";

export const Header = memo(function Header({ date, greeting, detail, compact }: { date: string; greeting: string; detail?: string; compact: boolean }) {
  return (
    <View testID="today-header">
      <Stack gap="xs" style={{ maxWidth: 640 }}>
        <Text variant="caption" tone="soft">{date}</Text>
        <Text variant={compact ? "title" : "display"} role="heading" aria-level={1}>{greeting}</Text>
        {detail ? <Text tone="soft">{detail}</Text> : null}
      </Stack>
    </View>
  );
});
