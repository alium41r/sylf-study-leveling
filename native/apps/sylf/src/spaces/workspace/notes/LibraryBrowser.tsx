// The library inside a Notes, PDFs or Whiteboard window: what is here, newest first, by notebook, with search. Creating starts from a
// template. Everything acts on the one Notes library, so a note made here appears in Resources and in every other window at once.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ScrollView, View, type LayoutChangeEvent } from "react-native";
import { Button, Chip, ContextArea, Dialog, EmptyState, Icon, Menu, Press, Text, TextField, useNotice, useTheme, type IconName, type MenuItem , type ViewHandle } from "@sylf/design-system";
import { BOARD_TEMPLATES, PAPER_TEMPLATES, TYPED_TEMPLATES, type LibraryEntry, type NoteKind, type NotesLibrary } from "@sylf/notes";
import { useLibrarySnapshot } from "../../../shell/notes/library";
import { importPdfFile } from "./pdf-import";
import { useDragSource } from "../drop";

export const KIND_ICON: Record<NoteKind, IconName> = { note: "notes", handwriting: "pen", pdf: "pdf", board: "whiteboard" };
export const KIND_LABEL: Record<NoteKind, string> = { note: "Typed note", handwriting: "Handwriting", pdf: "PDF", board: "Whiteboard" };

export function relativeTime(time: number, now = Date.now()) {
  const minutes = Math.round((now - time) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "Yesterday" : `${days} days ago`;
  return new Date(time).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

interface Props {
  library: NotesLibrary;
  kinds: NoteKind[];
  /** Which kinds this window creates first. */
  primary: NoteKind;
  onOpen(entry: LibraryEntry): void;
  /** Opens it in a window of its own, beside this one. */
  onOpenNew?(entry: LibraryEntry): void;
  footer?: ReactNode;
}

type Filter = { notebook: string | "all" | "trash" };

export default function LibraryBrowser({ library, kinds, primary, onOpen, onOpenNew, footer }: Props) {
  const { space } = useTheme();
  const notice = useNotice();
  const snapshot = useLibrarySnapshot(library);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>({ notebook: "all" });
  const [width, setWidth] = useState(480);
  const [creating, setCreating] = useState(false);
  const [naming, setNaming] = useState<{ title: string; value: string; apply(value: string): Promise<unknown> } | null>(null);
  const newButton = useRef<ViewHandle>(null);

  const entries = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return snapshot.entries
      .filter((e) => kinds.includes(e.kind))
      .filter((e) => (filter.notebook === "trash" ? e.trashed : !e.trashed && (filter.notebook === "all" || e.notebookId === filter.notebook)))
      .filter((e) => words.every((w) => `${e.title} ${e.text || e.preview}`.toLowerCase().includes(w)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated);
  }, [snapshot.entries, kinds, filter, query]);

  const notebookId = filter.notebook === "all" || filter.notebook === "trash" ? null : filter.notebook;
  const run = (task: Promise<unknown>, done?: string) => { void task.then(() => { if (done) notice(done); }, (error: unknown) => notice(error instanceof Error ? error.message : "That didn't work.")); };
  const create = async (kind: Exclude<NoteKind, "pdf">, template?: string) => {
    setCreating(false);
    try {
      const options = kind === "note" ? { kind, template, title: template && template !== "blank" ? TYPED_TEMPLATES.find((t) => t.id === template)?.label : undefined } : { kind, paper: template as never };
      const id = await library.create({ ...options, notebookId });
      const entry = library.getSnapshot().entries.find((e) => e.id === id);
      if (entry) onOpen(entry);
    } catch (error) { notice(error instanceof Error ? error.message : "The note could not be created."); }
  };
  const importPdf = async () => {
    setCreating(false);
    try {
      const id = await importPdfFile(library, notebookId);
      const entry = id ? library.getSnapshot().entries.find((e) => e.id === id) : null;
      if (entry) onOpen(entry);
    } catch (error) { notice(error instanceof Error ? error.message : "That PDF could not be added."); }
  };

  const createItems: MenuItem[] = [
    ...(kinds.includes("note") ? TYPED_TEMPLATES.map((t) => ({ key: `note-${t.id}`, label: t.id === "blank" ? "Typed note" : t.label, detail: t.detail, icon: "notes" as IconName, onSelect: () => void create("note", t.id) })) : []),
    ...(kinds.includes("handwriting") ? PAPER_TEMPLATES.slice(0, 6).map((t) => ({ key: `ink-${t.id}`, label: `Handwriting, ${t.label.toLowerCase()}`, icon: "pen" as IconName, onSelect: () => void create("handwriting", t.id) })) : []),
    ...(kinds.includes("board") ? BOARD_TEMPLATES.map((t) => ({ key: `board-${t.id}`, label: `Whiteboard, ${t.label.toLowerCase()}`, icon: "whiteboard" as IconName, onSelect: () => void create("board", t.id) })) : []),
    ...(kinds.includes("pdf") ? [{ key: "pdf", label: "Import a PDF", icon: "fileImport" as IconName, onSelect: () => void importPdf() }] : []),
  ];
  const primaryAction = () => {
    if (primary === "pdf") void importPdf();
    else if (primary === "board") void create("board", "dotted");
    else setCreating(true);
  };

  const entryMenu = (entry: LibraryEntry): MenuItem[] => entry.trashed ? [
    { key: "restore", label: "Restore", icon: "reset", onSelect: () => run(library.restore(entry.id), "Restored") },
    { key: "delete", label: "Delete forever", icon: "trash", destructive: true, onSelect: () => run(library.remove(entry.id), "Deleted") },
  ] : [
    { key: "open", label: "Open", icon: KIND_ICON[entry.kind], onSelect: () => onOpen(entry) },
    ...(onOpenNew ? [{ key: "window", label: "Open in a new window", icon: "split" as IconName, onSelect: () => onOpenNew(entry) }] : []),
    { key: "rename", label: "Rename", icon: "type", onSelect: () => setNaming({ title: "Rename", value: entry.title, apply: (v) => library.rename(entry.id, v) }) },
    { key: "pin", label: entry.pinned ? "Unpin" : "Pin to top", icon: "pin", onSelect: () => run(library.pin(entry.id, !entry.pinned)) },
    ...snapshot.notebooks.filter((n) => n.id !== entry.notebookId).map((n) => ({ key: `move-${n.id}`, label: `Move to ${n.title}`, icon: "folder" as IconName, onSelect: () => run(library.move(entry.id, n.id), `Moved to ${n.title}`) })),
    ...(entry.notebookId ? [{ key: "unfile", label: "Take out of notebook", icon: "folder" as IconName, onSelect: () => run(library.move(entry.id, null)) }] : []),
    { key: "copy", label: "Duplicate", icon: "copy", onSelect: () => run(library.duplicate(entry.id), "Duplicated") },
    { key: "trash", label: "Move to trash", icon: "trash", destructive: true, onSelect: () => run(library.trash(entry.id), "Moved to trash") },
  ];

  const columns = Math.max(1, Math.floor((width - space.md * 2 + space.sm) / 196));
  const cardWidth = (width - space.md * 2 - space.sm * (columns - 1)) / columns;
  const notebookColor = (id: string | null) => snapshot.notebooks.find((n) => n.id === id)?.color;
  const trashed = snapshot.entries.some((e) => e.trashed && kinds.includes(e.kind));

  return (
    <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.md }}>
        <View style={{ flex: 1, minWidth: 0 }}><TextField label="Search" hideLabel icon="search" placeholder="Search" value={query} onChangeText={setQuery} returnKeyType="search" /></View>
        <View ref={newButton} collapsable={false}><Button title={primary === "pdf" ? "Import" : "New"} icon={primary === "pdf" ? "fileImport" : "plus"} variant="emphasis" size="small" onPress={primaryAction} onLongPress={() => setCreating(true)} /></View>
        {primary === "pdf" || primary === "board" ? <IconMore anchor={newButton} items={createItems} /> : null}
      </View>
      <Menu open={creating} anchor={newButton} onClose={() => setCreating(false)} items={createItems} label="Create" side="bottom" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm }}>
        <Chip label="All" selected={filter.notebook === "all"} onPress={() => setFilter({ notebook: "all" })} />
        {snapshot.notebooks.map((n) => (
          <ContextArea key={n.id} label={n.title} items={[{ key: "rename", label: "Rename", icon: "type", onSelect: () => setNaming({ title: "Rename notebook", value: n.title, apply: (v) => library.renameNotebook(n.id, v) }) }, { key: "delete", label: "Delete notebook", detail: "Its notes stay", icon: "trash", destructive: true, onSelect: () => { setFilter({ notebook: "all" }); run(library.deleteNotebook(n.id)); } }]}>
            <Chip label={n.title} icon="folder" selected={filter.notebook === n.id} onPress={() => setFilter({ notebook: n.id })} />
          </ContextArea>
        ))}
        <Chip label="Notebook" icon="plus" onPress={() => setNaming({ title: "New notebook", value: "", apply: async (v) => setFilter({ notebook: await library.createNotebook(v) }) })} />
        {trashed || filter.notebook === "trash" ? <Chip label="Trash" icon="trash" selected={filter.notebook === "trash"} onPress={() => setFilter({ notebook: "trash" })} /> : null}
      </ScrollView>
      {snapshot.failure ? <View style={{ paddingHorizontal: space.md }}><Text variant="small" tone="critical">{snapshot.failure}</Text></View> : null}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.md, paddingTop: space.xs, gap: space.sm, flexDirection: "row", flexWrap: "wrap" }} keyboardShouldPersistTaps="handled">
        {!snapshot.ready ? null : entries.length ? entries.map((entry) => (
          <ContextArea key={entry.id} label={entry.title} items={entryMenu(entry)}>
            <Card entry={entry} width={cardWidth} tint={notebookColor(entry.notebookId)} onOpen={onOpen} />
          </ContextArea>
        )) : (
          <View style={{ width: "100%", paddingTop: space.xl }}>
            {query ? <EmptyState icon="search" title="Nothing matches" message="Try another word." /> : filter.notebook === "trash" ? <EmptyState icon="trash" title="Trash is empty" message="Deleted notes wait here until you remove them." /> : <Starter kinds={kinds} onCreate={create} onImport={importPdf} />}
          </View>
        )}
      </ScrollView>
      {footer}
      <Dialog open={!!naming} onClose={() => setNaming(null)} title={naming?.title ?? ""} actions={[{ label: "Cancel", onPress: () => setNaming(null) }, { label: "Save", variant: "emphasis", onPress: () => { const n = naming; setNaming(null); if (n?.value.trim()) run(n.apply(n.value)); } }]}>
        <TextField label="Name" hideLabel autoFocus value={naming?.value ?? ""} onChangeText={(value) => setNaming((n) => (n ? { ...n, value } : n))} onSubmitEditing={() => { const n = naming; setNaming(null); if (n?.value.trim()) run(n.apply(n.value)); }} />
      </Dialog>
    </View>
  );
}

function Card({ entry, width, tint, onOpen }: { entry: LibraryEntry; width: number; tint?: string; onOpen(entry: LibraryEntry): void }) {
  const { space, color } = useTheme();
  const ref = useRef<ViewHandle>(null);
  // On desktop a card can be dragged onto the canvas, where it opens in a window of its own.
  useDragSource(ref, entry.trashed ? null : entry.id);
  return (
    <View ref={ref} collapsable={false} style={{ width }}>
      <Press label={`${entry.title}, ${KIND_LABEL[entry.kind]}`} hint={entry.trashed ? "In the trash" : undefined} onPress={() => (entry.trashed ? undefined : onOpen(entry))} testID={`library-entry-${entry.kind}`}
        style={{ opacity: entry.trashed ? 0.6 : 1 }} bodyStyle={{ padding: space.sm, gap: space.sm }}>
        <Cover entry={entry} tint={tint} />
        <View style={{ gap: 2, paddingHorizontal: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {entry.pinned ? <Icon name="pin" size={13} color={color.inkSoft} /> : null}
            <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{entry.title}</Text>
          </View>
          <Text variant="caption" tone="soft" numberOfLines={1}>{entry.kind === "pdf" || entry.kind === "handwriting" ? `${entry.pages} ${entry.pages === 1 ? "page" : "pages"} · ` : ""}{relativeTime(entry.updated)}</Text>
        </View>
      </Press>
    </View>
  );
}

function IconMore({ anchor, items }: { anchor: React.RefObject<ViewHandle | null>; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const { color } = useTheme();
  return (
    <>
      <Press label="More ways to create" onPress={() => setOpen(true)} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}><Icon name="chevronDown" size={18} color={color.inkSoft} /></Press>
      <Menu open={open} anchor={anchor } onClose={() => setOpen(false)} items={items} label="Create" side="bottom" />
    </>
  );
}

/** First run: three ways in, with no paragraph to read. */
function Starter({ kinds, onCreate, onImport }: { kinds: NoteKind[]; onCreate(kind: Exclude<NoteKind, "pdf">, template?: string): void; onImport(): void }) {
  const { space } = useTheme();
  const options: { key: string; icon: IconName; title: string; detail: string; onPress(): void }[] = [];
  if (kinds.includes("note")) options.push({ key: "note", icon: "notes", title: "Typed note", detail: "Headings, lists, checklists", onPress: () => onCreate("note", "blank") }, { key: "lecture", icon: "bulletList", title: "Lecture notes", detail: "Key ideas, questions, summary", onPress: () => onCreate("note", "lecture") });
  if (kinds.includes("handwriting")) options.push({ key: "ink", icon: "pen", title: "Handwriting", detail: "Ruled paper for a pen", onPress: () => onCreate("handwriting", "ruled") });
  if (kinds.includes("board")) options.push({ key: "board", icon: "whiteboard", title: "Whiteboard", detail: "An open canvas to think on", onPress: () => onCreate("board", "dotted") });
  if (kinds.includes("pdf")) options.push({ key: "pdf", icon: "fileImport", title: "Import a PDF", detail: "Read and annotate past papers", onPress: onImport });
  return (
    <View style={{ gap: space.sm, alignItems: "stretch", maxWidth: 420, alignSelf: "center", width: "100%" }}>
      {options.map((o) => <StarterRow key={o.key} icon={o.icon} title={o.title} detail={o.detail} onPress={o.onPress} />)}
    </View>
  );
}

function StarterRow({ icon, title, detail, onPress }: { icon: IconName; title: string; detail: string; onPress(): void }) {
  const theme = useTheme();
  return (
    <Press label={title} hint={detail} onPress={onPress} style={theme.surface("raised", "md")} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: theme.space.md, padding: theme.space.md }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.accent.wash }}><Icon name={icon} color={theme.color.accent.ink} /></View>
      <View style={{ flex: 1, gap: 2 }}><Text variant="label">{title}</Text><Text variant="caption" tone="soft">{detail}</Text></View>
      <Icon name="chevronRight" size={16} color={theme.color.inkFaint} />
    </Press>
  );
}

/** A small page in the document's own paper, never the theme's. */
function Cover({ entry, tint }: { entry: LibraryEntry; tint?: string }) {
  const lines = entry.kind === "note" ? [0.86, 0.72, 0.9, 0.55] : [];
  return (
    <View style={{ height: 112, borderRadius: 10, backgroundColor: entry.kind === "board" ? "#fbfbf8" : "#ffffff", borderWidth: 1, borderColor: "rgba(20,24,40,0.08)", overflow: "hidden", padding: 12, gap: 7 }}>
      {tint ? <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: tint }} /> : null}
      {entry.kind === "note" ? (
        <>
          <Text variant="caption" numberOfLines={3} style={{ color: "#3a3f4a", lineHeight: 15 }}>{entry.preview || " "}</Text>
          {!entry.preview ? lines.map((w, i) => <View key={i} style={{ height: 4, width: `${w * 100}%`, borderRadius: 2, backgroundColor: "#e7e9ef" }} />) : null}
        </>
      ) : entry.kind === "handwriting" ? (
        [0, 1, 2, 3, 4, 5].map((i) => <View key={i} style={{ height: 1, backgroundColor: "#dfe4ee", marginTop: i ? 9 : 4 }} />)
      ) : entry.kind === "board" ? (
        <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 11, padding: 2 }}>{Array.from({ length: 24 }, (_, i) => <View key={i} style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: "#c9ccd6" }} />)}</View>
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><View style={{ width: 54, height: 72, backgroundColor: "#f6f7fa", borderWidth: 1, borderColor: "#e3e6ec", alignItems: "center", justifyContent: "center" }}><Text variant="micro" style={{ color: "#c0453b", fontWeight: "700" }}>PDF</Text></View></View>
      )}
      <View style={{ position: "absolute", right: 8, bottom: 8 }}><Icon name={KIND_ICON[entry.kind]} size={15} color="#8a90a0" /></View>
    </View>
  );
}
