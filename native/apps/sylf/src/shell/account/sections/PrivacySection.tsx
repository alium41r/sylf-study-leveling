// Privacy: each setting, and who it lets see what, in a sentence. Three levels, because the database has three. A change saves at once and reads back, so
// the page never shows a setting the server did not keep.
import { View } from "react-native";
import { Callout, Select, Stack, Text, useNotice } from "@sylf/design-system";
import { PRIVACY_LEVELS, type PrivacyLevel, type PrivacySetting } from "@sylf/backend";
import { useLiveBackend } from "../../backend";
import { describeFailureText } from "../failure";
import { usePrivacy } from "../useAccount";
import { AccountSection } from "./Section";

const LEVEL_NAMES: Record<PrivacyLevel, string> = { PUBLIC: "Everyone", FRIENDS: "Friends", PRIVATE: "Only me" };
const SETTINGS: { id: PrivacySetting; label: string; says: (level: string) => string }[] = [
  { id: "profileVisibility", label: "Your profile", says: (l) => `${l} can open your profile.` },
  { id: "showOnlineStatus", label: "When you're online", says: (l) => `${l} can see when you're online.` },
  { id: "showCurrentSession", label: "What you're studying now", says: (l) => `${l} can see your session while it runs.` },
  { id: "showStudyHours", label: "Study time", says: (l) => `${l} can see your hours, and they count you in the rankings.` },
  { id: "showRank", label: "Level and rank", says: (l) => `${l} can see your level and rank, and they count you in the rankings.` },
  { id: "showAchievements", label: "Honours", says: (l) => `${l} can see what you've earned.` },
  { id: "allowFriendRequests", label: "Friend requests", says: (l) => `${l} can send you a friend request.` },
  { id: "allowDirectMessages", label: "Messages", says: (l) => `${l} can message you.` },
];

export function PrivacySection({ onPlace }: { onPlace: (id: string, y: number) => void }) {
  const backend = useLiveBackend();
  const notice = useNotice();
  const result = usePrivacy();
  const data = result?.data;
  const change = async (setting: PrivacySetting, level: PrivacyLevel) => {
    if (!backend) return;
    try { await backend.reads.account.savePrivacy({ [setting]: level }); }
    catch (error) { notice(describeFailureText(error)); }
    backend.resources.invalidate("account-privacy");
    backend.resources.invalidate("progress");
  };
  return (
    <AccountSection id="privacy" title="Privacy" detail="Who sees what. Changes save at once." onPlace={onPlace}>
      {!result ? <Text tone="soft">Loading your settings.</Text> : !data ? <Callout tone="caution" title="Privacy didn't load" message={result.live.failure ?? "Try again in a moment."} /> : (
        <Stack gap="lg">
          {SETTINGS.map(({ id, label, says }) => {
            const level = (data[id] ?? "PUBLIC") as PrivacyLevel;
            const known = (PRIVACY_LEVELS as readonly string[]).includes(level);
            return (
              <View key={id} testID={`account-privacy-${id}`}>
                <Select label={label} value={known ? level : "FRIENDS"} options={PRIVACY_LEVELS.map((value) => ({ value, label: LEVEL_NAMES[value] }))} onChange={(value) => void change(id, value as PrivacyLevel)} />
                <Text variant="caption" tone="soft">{says(known ? LEVEL_NAMES[level] : "Friends")}</Text>
              </View>
            );
          })}
        </Stack>
      )}
    </AccountSection>
  );
}
