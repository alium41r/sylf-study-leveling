// Study in the account is a doorway, not a second copy. The daily target and rest days are Plan's, and the rhythms are Focus's, so each opens there, and
// this only says what they are now.
import { View } from "react-native";
import { ListRow, Stack, Text } from "@sylf/design-system";
import { useLiveBackend } from "../../backend";
import { useHomeNavigation } from "../../context";
import { formatMinutes } from "../../../spaces/home/format";
import { useScheduleLine } from "../useSchedule";
import { AccountSection } from "./Section";

export function StudySection({ onPlace, onLeave }: { onPlace: (id: string, y: number) => void; onLeave: () => void }) {
  const backend = useLiveBackend();
  const navigation = useHomeNavigation();
  const schedule = useScheduleLine();
  const go = (open: () => void) => { onLeave(); open(); };
  return (
    <AccountSection id="study" title="Study" onPlace={onPlace}>
      <Stack gap="xs">
        <View testID="account-study-target"><ListRow title="Daily target and rest days" detail={schedule ? `${formatMinutes(schedule.dailyGoalMinutes)} a day. ${schedule.restLine}` : "Set in Plan"} onPress={() => go(() => { navigation.select("plan"); navigation.setView("plan", "quests"); })} /></View>
        <View testID="account-study-rhythm"><ListRow title="Rhythms and breaks" detail="Pomodoro, 52/17 and the rest, set in Focus" onPress={() => go(() => navigation.select("focus"))} /></View>
        <View testID="account-study-subjects"><ListRow title="Subjects" detail="Add, rename and archive them in Plan" onPress={() => go(() => { navigation.select("plan"); navigation.setView("plan", "quests"); })} /></View>
      </Stack>
      {backend ? null : <Text variant="caption" tone="soft">Sign in to keep these on every device.</Text>}
    </AccountSection>
  );
}
