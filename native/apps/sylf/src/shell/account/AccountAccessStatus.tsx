import { ScrollView } from "react-native";
import { Activity, EmptyState, SafeArea, Stack, Text, useTheme } from "@sylf/design-system";

export function AccountAccessStatus({ waiting }: { waiting: boolean }) {
  const { color, space } = useTheme();
  return (
    <SafeArea style={{ flex: 1, backgroundColor: color.ground }}>
      <ScrollView keyboardShouldPersistTaps="handled" testID={waiting ? "account-connecting" : "account-unconfigured"} contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", padding: space.xl }}>
        <Stack gap="lg" align="center" style={{ width: "100%", maxWidth: 440 }}>
          <Text variant="display" role="heading" aria-level={1}>Sylf</Text>
          {waiting ? <Activity label="Opening Sylf" /> : <EmptyState icon="lock" title="Connect Sylf to sign in" message="This installation needs a Sylf server address. Open a configured build to access your account." />}
        </Stack>
      </ScrollView>
    </SafeArea>
  );
}
