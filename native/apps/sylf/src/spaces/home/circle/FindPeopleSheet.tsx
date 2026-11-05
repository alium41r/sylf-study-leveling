// Finding people: search by name or username, and send a request. The server limits results to ten, marks who is already a friend, and refuses with
// its own words when someone does not accept requests. Searching waits for two characters and for the typing to pause.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Badge, Button, ListRow, Sheet, Stack, Text, TextField, useNotice, useTheme } from "@sylf/design-system";
import type { UserSearchResult } from "@sylf/backend";
import { useLiveBackend } from "../../../shell/backend";
import { openProfile } from "../../../shell/profile/store";
import { describeFailureText } from "../../../shell/account/failure";

export function FindPeopleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const notice = useNotice();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[] | null>(null);
  const [sent, setSent] = useState<number[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => { if (!open) { setQuery(""); setResults(null); setSent([]); } }, [open]);
  useEffect(() => {
    const term = query.trim();
    if (!backend || term.length < 2) { setResults(null); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(() => { backend.reads.social.search(term, controller.signal).then(setResults, (error: { kind?: string }) => { if (error.kind !== "cancelled") notice(describeFailureText(error)); }); }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [backend, query, notice]);

  const request = async (person: UserSearchResult) => {
    if (!backend || busy !== null) return;
    setBusy(person.id);
    try { await backend.reads.social.sendRequest(person.id); setSent((current) => [...current, person.id]); notice(`Request sent to ${person.name ?? person.username}.`); backend.resources.invalidate("circle"); }
    catch (error) { notice(describeFailureText(error)); }
    setBusy(null);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Find people">
      <View style={{ padding: space.lg }}>
        <Stack gap="md">
          <TextField label="Name or username" helper="At least two letters." value={query} onChangeText={setQuery} autoCapitalize="none" testID="find-query" />
          {results && !results.length ? <Text variant="small" tone="soft">Nobody matched.</Text> : null}
          {results?.map((person) => (
            <View key={person.id} testID={`find-${person.id}`}>
              <ListRow title={person.name ?? person.username} detail={`@${person.username}`} onPress={() => { onClose(); openProfile(person.username); }} trailing={person.isFriend ? <Badge label="Friend" /> : sent.includes(person.id) ? <Badge label="Requested" /> : <Button title="Add" size="small" disabled={busy !== null} onPress={() => void request(person)} />} />
            </View>
          ))}
        </Stack>
      </View>
    </Sheet>
  );
}
