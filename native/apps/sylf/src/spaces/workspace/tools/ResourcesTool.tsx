// The Resource Shelf: one view over everything in the Notes library, never a second store. It filters by kind, subject and notebook,
// puts the subject being studied right now first, and opens each document in the tool that owns it, in a window of its own.
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Chip, ContextArea, EmptyState, Icon, Press, Text, TextField, useNotice, useTheme, type IconName, type MenuItem, type ViewHandle } from "@sylf/design-system";
import type { LibraryEntry, NoteKind } from "@sylf/notes";
import { useSessionState, useWorkspaceModel } from "../../../shell/context";
import { useSubjects } from "../../../shell/live";
import { useLibrarySnapshot, useNotesLibrary } from "../../../shell/notes/library";
import { useDragSource } from "../drop";
import { KIND_ICON, KIND_LABEL, relativeTime } from "../notes/LibraryBrowser";
import { openDocumentWindow } from "../notes/open-window";
import { ToolPage, type ToolProps } from "./shared";

const KINDS: { value: NoteKind | "all"; label: string; icon?: IconName }[] = [{ value: "all", label: "All" }, { value: "note", label: "Notes", icon: "notes" }, { value: "handwriting", label: "Handwriting", icon: "pen" }, { value: "pdf", label: "PDFs", icon: "pdf" }, { value: "board", label: "Boards", icon: "whiteboard" }];

export default function ResourcesTool({ onProvenance }: ToolProps) {
  const { space, color } = useTheme();
  const model = useWorkspaceModel();
  const notice = useNotice();
  const library = useNotesLibrary();
  const snapshot = useLibrarySnapshot(library);
  const subjects = useSubjects();
  const session = useSessionState();
  const [kind, setKind] = useState<NoteKind | "all">("all");
  const [subject, setSubject] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => { onProvenance(false); }, [onProvenance]);

  const studying = session.active?.subjectId ?? session.plan?.subjectId ?? null;
  const subjectName = (id: string | null) => subjects.find((s) => String(s.id) === id)?.name ?? null;
  const used = useMemo(() => [...new Set(snapshot.entries.filter((e) => !e.trashed && e.subjectId).map((e) => e.subjectId!))], [snapshot.entries]);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return snapshot.entries
      .filter((e) => !e.trashed && (kind === "all" || e.kind === kind) && (!subject || e.subjectId === subject))
      .filter((e) => words.every((w) => `${e.title} ${e.text || e.preview}`.toLowerCase().includes(w)))
      .sort((a, b) => Number(b.subjectId === String(studying)) - Number(a.subjectId === String(studying)) || Number(b.pinned) - Number(a.pinned) || b.updated - a.updated);
  }, [snapshot.entries, kind, subject, query, studying]);

  const open = (entry: LibraryEntry) => { if (!openDocumentWindow(model, entry, null)) notice("The Workspace is full. Close a window first."); };
  const menu = (entry: LibraryEntry): MenuItem[] => [
    { key: "open", label: "Open", icon: KIND_ICON[entry.kind], onSelect: () => open(entry) },
    ...subjects.slice(0, 12).map((s) => ({ key: `s${s.id}`, label: String(s.id) === entry.subjectId ? `Untag ${s.name}` : `Tag ${s.name}`, selected: String(s.id) === entry.subjectId, onSelect: () => void library.setSubject(entry.id, String(s.id) === entry.subjectId ? null : String(s.id)) })),
    { key: "pin", label: entry.pinned ? "Unpin" : "Pin to top", icon: "pin", onSelect: () => void library.pin(entry.id, !entry.pinned) },
  ];

  if (!snapshot.ready) return <View style={{ flex: 1 }} />;
  if (!snapshot.entries.some((e) => !e.trashed)) return <View style={{ flex: 1, justifyContent: "center", padding: space.md }}><EmptyState icon="resources" title="Nothing on the shelf" message="Notes, PDFs and boards you make in Workspace appear here, ready to open beside each other." /></View>;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space.md, paddingTop: space.md }}><TextField label="Search" hideLabel icon="search" placeholder="Search everything" value={query} onChangeText={setQuery} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.md, paddingTop: space.sm }}>
        {KINDS.map((k) => <Chip key={k.value} label={k.label} icon={k.icon} selected={kind === k.value} onPress={() => setKind(k.value)} />)}
      </ScrollView>
      {used.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.md, paddingTop: space.xs }}>
          {used.map((id) => <Chip key={id} label={subjectName(id) ?? "Subject"} icon={id === String(studying) ? "focus" : undefined} selected={subject === id} onPress={() => setSubject(subject === id ? null : id)} />)}
        </ScrollView>
      ) : null}
      <ToolPage padded={false}>
        <View style={{ padding: space.sm }}>
          {shown.length ? shown.map((entry) => (
            <ContextArea key={entry.id} label={entry.title} items={menu(entry)}>
              <ShelfRow entry={entry} subject={subjectName(entry.subjectId)} notebook={snapshot.notebooks.find((n) => n.id === entry.notebookId)?.title ?? null} studying={!!studying && entry.subjectId === String(studying)} onOpen={open} />
            </ContextArea>
          )) : <EmptyState icon="search" title="Nothing matches" message="Try another filter." />}
        </View>
      </ToolPage>
      <Text variant="micro" tone="faint" style={{ paddingHorizontal: space.lg, paddingBottom: space.sm, color: color.inkFaint }}>{shown.length} of {snapshot.entries.filter((e) => !e.trashed).length}</Text>
    </View>
  );
}

function ShelfRow({ entry, subject, notebook, studying, onOpen }: { entry: LibraryEntry; subject: string | null; notebook: string | null; studying: boolean; onOpen(entry: LibraryEntry): void }) {
  const { space, color } = useTheme();
  const ref = useRef<ViewHandle>(null);
  useDragSource(ref, entry.id);
  const detail = [KIND_LABEL[entry.kind], subject, notebook, relativeTime(entry.updated)].filter(Boolean).join(" · ");
  return (
    <View ref={ref} collapsable={false}>
      <Press label={`${entry.title}, ${detail}`} onPress={() => onOpen(entry)} testID={`shelf-${entry.kind}`} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.sm, paddingVertical: space.sm }}>
        <View style={{ width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: studying ? color.accent.wash : color.sunken }}><Icon name={KIND_ICON[entry.kind]} size={18} color={studying ? color.accent.ink : color.inkSoft} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text variant="label" numberOfLines={1}>{entry.title}</Text>
          <Text variant="caption" tone="soft" numberOfLines={1}>{detail}</Text>
        </View>
        {entry.pinned ? <Icon name="pin" size={14} color={color.inkFaint} /> : null}
      </Press>
    </View>
  );
}
