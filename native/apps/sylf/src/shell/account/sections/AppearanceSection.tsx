// Appearance lives on this device. It is seeded once from the colours chosen on the web, and never written back, because Native's themes are not web's
// and writing them to the account would corrupt web's own preference. The Theme Studio opens as its own page.
import { View } from "react-native";
import { Button, Stack, Text, useAppearance, themeName } from "@sylf/design-system";
import { AccountSection } from "./Section";

export function AppearanceSection({ onPlace, onOpen }: { onPlace: (id: string, y: number) => void; onOpen: () => void }) {
  const { preference } = useAppearance();
  return (
    <AccountSection id="appearance" title="Appearance" detail="Colour, type and feel. This stays on this device." onPlace={onPlace}>
      <Stack gap="sm">
        <Text variant="small" testID="account-theme-name">{themeName(preference)}</Text>
        <View style={{ flexDirection: "row" }}><Button title="Customise" testID="account-open-studio" onPress={onOpen} /></View>
      </Stack>
    </AccountSection>
  );
}
