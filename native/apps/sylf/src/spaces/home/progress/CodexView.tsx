// The Codex answers how Sylf works. It is the web's own book, read from the shared catalog behind import(), so a build that never opens it never loads it
// and there is no second copy of the text to drift. Chapters, search, links between entries, and a lock where the catalog asks for a level or rank.
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Badge, EmptyState, ListRow, Stack, Text, TextField, useTheme } from "@sylf/design-system";
import { useStats } from "../../../shell/live";
import { PushedPage, Section } from "../HomePage";

type Catalogs = typeof import("@sylf/shared/catalogs");
type Entry = Catalogs["ARCHIVE_ENTRIES"][number];

function useCatalogs() {
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  useEffect(() => {
    let live = true;
    void import("@sylf/shared/catalogs").then((loaded) => { if (live) setCatalogs(loaded); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return catalogs;
}

const textOf = (entry: Entry) => [entry.title, ...entry.content.flatMap((block) => (block.type === "list" ? block.items : [block.text]))].join(" ").toLowerCase();

/** What stops an entry opening, or null. Every entry is open today, and a requirement the catalog adds later is honoured here. */
function lockedBy(entry: Entry, level: number | null, rankLevel: (rank: string) => number | null) {
  const need = entry.requirement;
  if (need.type === "LEVEL") return level !== null && level >= need.value ? null : `Opens at level ${need.value}.`;
  if (need.type === "RANK") { const at = rankLevel(need.value); return at === null || (level !== null && level >= at) ? null : `Opens at rank ${need.value}.`; }
  return null;
}

function Body({ entry }: { entry: Entry }) {
  const { space } = useTheme();
  return (
    <Stack gap="md">
      {entry.content.map((block, index) => block.type === "h3" ? <Text key={index} variant="subheading" role="heading" aria-level={2}>{block.text}</Text>
        : block.type === "p" ? <Text key={index} variant="body" style={{ maxWidth: 640 }}>{block.text}</Text>
        : <Stack key={index} gap="xs">{block.items.map((item) => <View key={item} style={{ flexDirection: "row", gap: space.sm, maxWidth: 640 }}><Text variant="body" tone="soft">·</Text><Text variant="body" style={{ flex: 1 }}>{item}</Text></View>)}</Stack>)}
    </Stack>
  );
}

export function CodexView() {
  const catalogs = useCatalogs();
  const stats = useStats();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const entries = catalogs?.ARCHIVE_ENTRIES ?? [];
  const rankLevel = useMemo(() => (rank: string) => catalogs?.RANK_LADDER.find((rung) => rung.display === rank || rung.db === rank)?.level ?? null, [catalogs]);
  if (!catalogs) return <View testID="progress-codex"><Text tone="soft">Opening the Codex.</Text></View>;
  const level = stats?.level ?? null;
  const open = entries.find((entry) => entry.id === openId) ?? null;
  if (open) {
    const lock = lockedBy(open, level, rankLevel);
    const related = open.related.map((id) => entries.find((entry) => entry.id === id)).filter((entry): entry is Entry => Boolean(entry));
    return (
      <View testID="progress-codex">
        <PushedPage title={open.title} onBack={() => setOpenId(null)} testID="progress-codex-entry">
          {lock ? <EmptyState icon="lock" title="Not open yet" message={lock} /> : <Body entry={open} />}
          {related.length ? <Section title="Related"><Stack gap="xs">{related.map((entry) => <ListRow key={entry.id} title={entry.title} detail={entry.categoryId} onPress={() => setOpenId(entry.id)} />)}</Stack></Section> : null}
        </PushedPage>
      </View>
    );
  }
  const needle = query.trim().toLowerCase();
  const found = needle ? entries.filter((entry) => textOf(entry).includes(needle)) : entries;
  const chapters = [...new Set(found.map((entry) => entry.categoryId))];
  return (
    <Stack gap="xl" testID="progress-codex">
      <TextField label="Search the Codex" value={query} onChangeText={setQuery} autoCapitalize="none" testID="progress-codex-search" />
      {needle && !found.length ? <EmptyState icon="search" title="Nothing matches" message="Try a different word, or clear the search." /> : null}
      {chapters.map((chapter) => (
        <Section key={chapter} title={chapter}>
          <Stack gap="xs">
            {found.filter((entry) => entry.categoryId === chapter).map((entry) => {
              const lock = lockedBy(entry, level, rankLevel);
              return <View key={entry.id} testID={`progress-codex-${entry.id}`}><ListRow title={entry.title} icon={lock ? "lock" : undefined} trailing={lock ? <Badge label="Locked" /> : undefined} onPress={() => setOpenId(entry.id)} /></View>;
            })}
          </Stack>
        </Section>
      ))}
    </Stack>
  );
}
