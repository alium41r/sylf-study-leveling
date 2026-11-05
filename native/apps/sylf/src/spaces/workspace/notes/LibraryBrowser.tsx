// The library inside a Notes, PDFs or Whiteboard window: folders within folders, then documents, newest first, with search. Folders and
// notes take a colour and an emoji. Everything acts on the one Notes library, so a change here appears in Resources and every window.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ScrollView, View, type LayoutChangeEvent } from "react-native";
import { Button, Chip, ContextArea, Dialog, EmptyState, Icon, Menu, Press, Text, TextField, useNotice, useTheme, type IconName, type MenuItem, type ViewHandle } from "@sylf/design-system";
import { BOARD_TEMPLATES, PAPER_TEMPLATES, TYPED_TEMPLATES, type LibraryEntry, type NoteKind, type Notebook, type NotesLibrary } from "@sylf/notes";
import { useLibrarySnapshot } from "../../../shell/notes/library";
import { importPdfFile } from "./pdf-import";
import { useDragSource, useDropTarget } from "../drop";
import { useSessionState } from "../../../shell/context";

export const KIND_ICON: Record<NoteKind, IconName> = { note: "notes", handwriting: "notes", pdf: "pdf", board: "whiteboard" };
export const KIND_LABEL: Record<NoteKind, string> = { note: "Note", handwriting: "Note", pdf: "PDF", board: "Whiteboard" };
export const COVER_COLORS = ["#5b7cfa", "#2f9e8f", "#d9822b", "#c2547a", "#7a62d6", "#4f8a3a", "#c8423b", "#3d8bd9", "#8a6d3b", "#55606e"];
export const COVER_ICONS = ["📘", "📗", "📙", "📕", "📓", "🧮", "📐", "🧪", "🔬", "🧬", "🌍", "🏛️", "💡", "🎵", "🎨", "💻", "📝", "⭐", "🔥", "🎯"];

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

type Place = { folder: string | null } | { trash: true };
type Customizing = { kind: "folder"; id: string; color: string | null; icon: string | null } | { kind: "entry"; id: string; color: string | null; icon: string | null };

export default function LibraryBrowser({ library, kinds, primary, onOpen, onOpenNew, footer }: Props) {
  const { space, color } = useTheme();
  const notice = useNotice();
  const snapshot = useLibrarySnapshot(library);
  // What is made during a study session belongs to its subject, so the Resource Shelf can bring it back next time.
  const session = useSessionState();
  const studyingId = session.active?.subjectId ?? session.plan?.subjectId ?? null;
  const studying = studyingId == null ? null : String(studyingId);
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<Place>({ folder: null });
  const [width, setWidth] = useState(480);
  const [creating, setCreating] = useState(false);
  const [naming, setNaming] = useState<{ title: string; value: string; apply(value: string): Promise<unknown> } | null>(null);
  const [moving, setMoving] = useState<{ title: string; apply(folder: string | null): Promise<unknown>; exclude?: string } | null>(null);
  const [customizing, setCustomizing] = useState<Customizing | null>(null);
  const newButton = useRef<ViewHandle>(null);

  const folders = snapshot.notebooks;
  const inTrash = "trash" in place;
  const folderId = "folder" in place ? place.folder : null;
  const folder = folders.find((f) => f.id === folderId) ?? null;
  const path = useMemo(() => { const out: Notebook[] = []; let at = folder; while (at) { out.unshift(at); at = folders.find((f) => f.id === at!.parentId) ?? null; } return out; }, [folder, folders]);
  const searching = query.trim().length > 0;
  const childFolders = searching || inTrash ? [] : folders.filter((f) => (f.parentId ?? null) === folderId).sort((a, b) => a.title.localeCompare(b.title));
  const count = (id: string): number => snapshot.entries.filter((e) => !e.trashed && e.notebookId === id && kinds.includes(e.kind)).length + folders.filter((f) => f.parentId === id).reduce((n, f) => n + count(f.id), 0);

  const entries = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return snapshot.entries
      .filter((e) => kinds.includes(e.kind))
      // Search looks everywhere; otherwise a folder shows what is directly in it.
      .filter((e) => (inTrash ? e.trashed : !e.trashed && (words.length ? true : e.notebookId === folderId)))
      .filter((e) => words.every((w) => `${e.title} ${e.text || e.preview}`.toLowerCase().includes(w)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated);
  }, [snapshot.entries, kinds, inTrash, folderId, query]);

  const run = (task: Promise<unknown>, done?: string) => { void task.then(() => { if (done) notice(done); }, (error: unknown) => notice(error instanceof Error ? error.message : "That didn't work.")); };
  const create = async (kind: Exclude<NoteKind, "pdf">, template?: string, paper?: string) => {
    setCreating(false);
    try {
      const options = kind === "board" ? { kind, paper: (paper ?? template) as never } : { kind: "note" as const, template: template ?? "blank", paper: (paper ?? "ruled") as never, title: template && template !== "blank" ? TYPED_TEMPLATES.find((t) => t.id === template)?.label : undefined };
      const id = await library.create({ ...options, notebookId: folderId, subjectId: studying });
      const entry = library.getSnapshot().entries.find((e) => e.id === id);
      if (entry) onOpen(entry);
    } catch (error) { notice(error instanceof Error ? error.message : "The note could not be created."); }
  };
  const importPdf = async () => {
    setCreating(false);
    try {
      const id = await importPdfFile(library, folderId, studying);
      const entry = id ? library.getSnapshot().entries.find((e) => e.id === id) : null;
      if (entry) onOpen(entry);
    } catch (error) { notice(error instanceof Error ? error.message : "That PDF could not be added."); }
  };
  const newFolder = () => setNaming({ title: folder ? `New folder in ${folder.title}` : "New folder", value: "", apply: async (v) => { await library.createNotebook(v, folderId); } });

  const notes = kinds.includes("note");
  const createItems: MenuItem[] = [
    ...(notes ? PAPER_TEMPLATES.slice(0, 4).map((t) => ({ key: `note-${t.id}`, label: `Note, ${t.label.toLowerCase()}`, detail: "Type and write on the same pages", icon: "notes" as IconName, onSelect: () => void create("note", "blank", t.id) })) : []),
    ...(notes ? TYPED_TEMPLATES.filter((t) => t.id !== "blank").map((t) => ({ key: `tpl-${t.id}`, label: t.label, detail: t.detail, icon: "bulletList" as IconName, onSelect: () => void create("note", t.id, "ruled") })) : []),
    ...(kinds.includes("board") ? BOARD_TEMPLATES.map((t) => ({ key: `board-${t.id}`, label: `Whiteboard, ${t.label.toLowerCase()}`, icon: "whiteboard" as IconName, onSelect: () => void create("board", t.id) })) : []),
    ...(kinds.includes("pdf") ? [{ key: "pdf", label: "Import a PDF", icon: "fileImport" as IconName, onSelect: () => void importPdf() }] : []),
    { key: "folder", label: folder ? "New subfolder" : "New folder", icon: "folder", onSelect: () => { setCreating(false); newFolder(); } },
  ];
  const primaryAction = () => {
    if (primary === "pdf") void importPdf();
    else if (primary === "board") void create("board", "dotted");
    else setCreating(true);
  };

  const pickFolder = (title: string, apply: (folder: string | null) => Promise<unknown>, exclude?: string) => setMoving({ title, apply, exclude });
  const entryMenu = (entry: LibraryEntry): MenuItem[] => entry.trashed ? [
    { key: "restore", label: "Restore", icon: "reset", onSelect: () => run(library.restore(entry.id), "Restored") },
    { key: "delete", label: "Delete forever", icon: "trash", destructive: true, onSelect: () => run(library.remove(entry.id), "Deleted") },
  ] : [
    { key: "open", label: "Open", icon: KIND_ICON[entry.kind], onSelect: () => onOpen(entry) },
    ...(onOpenNew ? [{ key: "window", label: "Open in a new window", icon: "split" as IconName, onSelect: () => onOpenNew(entry) }] : []),
    { key: "rename", label: "Rename", icon: "type", onSelect: () => setNaming({ title: "Rename", value: entry.title, apply: (v) => library.rename(entry.id, v) }) },
    { key: "look", label: "Colour and icon", icon: "palette", onSelect: () => setCustomizing({ kind: "entry", id: entry.id, ...entry.cover }) },
    { key: "move", label: "Move to a folder", icon: "folder", onSelect: () => pickFolder(`Move ${entry.title}`, (to) => library.move(entry.id, to)) },
    { key: "pin", label: entry.pinned ? "Unpin" : "Pin to top", icon: "pin", onSelect: () => run(library.pin(entry.id, !entry.pinned)) },
    { key: "copy", label: "Duplicate", icon: "copy", onSelect: () => run(library.duplicate(entry.id), "Duplicated") },
    { key: "trash", label: "Move to trash", icon: "trash", destructive: true, onSelect: () => run(library.trash(entry.id), "Moved to trash") },
  ];
  const folderMenu = (f: Notebook): MenuItem[] => [
    { key: "open", label: "Open", icon: "folder", onSelect: () => setPlace({ folder: f.id }) },
    { key: "rename", label: "Rename", icon: "type", onSelect: () => setNaming({ title: "Rename folder", value: f.title, apply: (v) => library.renameNotebook(f.id, v) }) },
    { key: "look", label: "Colour and icon", icon: "palette", onSelect: () => setCustomizing({ kind: "folder", id: f.id, color: f.color, icon: f.icon ?? null }) },
    { key: "sub", label: "New subfolder", icon: "plus", onSelect: () => setNaming({ title: `New folder in ${f.title}`, value: "", apply: async (v) => { await library.createNotebook(v, f.id); } }) },
    { key: "move", label: "Move into another folder", icon: "folder", onSelect: () => pickFolder(`Move ${f.title}`, (to) => library.updateNotebook(f.id, { parentId: to }), f.id) },
    { key: "delete", label: "Delete folder", detail: "What is inside moves up", icon: "trash", destructive: true, onSelect: () => run(library.deleteNotebook(f.id), "Folder deleted") },
  ];

  const columns = Math.max(1, Math.floor((width - space.md * 2 + space.sm) / 196));
  const cardWidth = (width - space.md * 2 - space.sm * (columns - 1)) / columns;
  const trashed = snapshot.entries.some((e) => e.trashed && kinds.includes(e.kind));

  return (
    <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.md }}>
        <View style={{ flex: 1, minWidth: 0 }}><TextField label="Search" hideLabel icon="search" placeholder="Search every folder" value={query} onChangeText={setQuery} returnKeyType="search" /></View>
        <View ref={newButton} collapsable={false}><Button title={primary === "pdf" ? "Import" : "New"} icon={primary === "pdf" ? "fileImport" : "plus"} variant="emphasis" size="small" onPress={primaryAction} onLongPress={() => setCreating(true)} /></View>
        {primary === "pdf" || primary === "board" ? <IconMore anchor={newButton} items={createItems} /> : null}
      </View>
      <Menu open={creating} anchor={newButton} onClose={() => setCreating(false)} items={createItems} label="Create" side="bottom" />
      {/* Where you are: the top, then each folder down to this one. */}
      <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.xs, alignItems: "center", paddingHorizontal: space.md, paddingVertical: space.sm }}>
        <Chip label="All" icon="home" selected={!inTrash && !folderId} onPress={() => setPlace({ folder: null })} />
        {path.map((f) => (
          <View key={f.id} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Icon name="chevronRight" size={14} color={color.inkFaint} />
            <Chip label={`${f.icon ? `${f.icon} ` : ""}${f.title}`} selected={f.id === folderId} onPress={() => setPlace({ folder: f.id })} />
          </View>
        ))}
        <View style={{ width: space.sm }} />
        <Chip label={folder ? "Subfolder" : "Folder"} icon="plus" onPress={newFolder} />
        {trashed || inTrash ? <Chip label="Trash" icon="trash" selected={inTrash} onPress={() => setPlace({ trash: true })} /> : null}
      </ScrollView>
      {snapshot.failure ? <View style={{ paddingHorizontal: space.md }}><Text variant="small" tone="critical">{snapshot.failure}</Text></View> : null}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.md, paddingTop: space.xs, gap: space.sm, flexDirection: "row", flexWrap: "wrap" }} keyboardShouldPersistTaps="handled">
        {childFolders.map((f) => (
          <ContextArea key={f.id} label={f.title} items={folderMenu(f)}>
            <FolderTile folder={f} width={cardWidth} items={count(f.id)} onOpen={() => setPlace({ folder: f.id })} onDropDocument={(id) => run(library.move(id, f.id), `Moved to ${f.title}`)} />
          </ContextArea>
        ))}
        {!snapshot.ready ? null : entries.length ? entries.map((entry) => (
          <ContextArea key={entry.id} label={entry.title} items={entryMenu(entry)}>
            <Card entry={entry} width={cardWidth} onOpen={onOpen} />
          </ContextArea>
        )) : childFolders.length ? null : (
          <View style={{ width: "100%", paddingTop: space.xl }}>
            {searching ? <EmptyState icon="search" title="Nothing matches" message="Try another word." /> : inTrash ? <EmptyState icon="trash" title="Trash is empty" message="Deleted notes wait here until you remove them." /> : folder ? <EmptyState icon="folder" title={`${folder.title} is empty`} message="New notes made here are kept in this folder." /> : <Starter kinds={kinds} onCreate={create} onImport={importPdf} />}
          </View>
        )}
      </ScrollView>
      {footer}
      <Dialog open={!!naming} onClose={() => setNaming(null)} title={naming?.title ?? ""} actions={[{ label: "Cancel", onPress: () => setNaming(null) }, { label: "Save", variant: "emphasis", onPress: () => { const n = naming; setNaming(null); if (n?.value.trim()) run(n.apply(n.value)); } }]}>
        <TextField label="Name" hideLabel autoFocus value={naming?.value ?? ""} onChangeText={(value) => setNaming((n) => (n ? { ...n, value } : n))} onSubmitEditing={() => { const n = naming; setNaming(null); if (n?.value.trim()) run(n.apply(n.value)); }} />
      </Dialog>
      <Dialog open={!!moving} onClose={() => setMoving(null)} title={moving?.title ?? ""} actions={[{ label: "Cancel", onPress: () => setMoving(null) }]}>
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          <FolderRow title="Top level" icon={null} depth={0} onPress={() => { const m = moving; setMoving(null); if (m) run(m.apply(null), "Moved"); }} />
          {tree(folders, null, 1, moving?.exclude).map(({ folder: f, depth }) => <FolderRow key={f.id} title={f.title} icon={f.icon ?? null} tint={f.color} depth={depth} onPress={() => { const m = moving; setMoving(null); if (m) run(m.apply(f.id), `Moved to ${f.title}`); }} />)}
        </ScrollView>
      </Dialog>
      <Dialog open={!!customizing} onClose={() => setCustomizing(null)} title="Colour and icon" actions={[{ label: "Done", variant: "emphasis", onPress: () => setCustomizing(null) }]}>
        {customizing ? <Customizer value={customizing} onChange={(next) => {
          setCustomizing(next);
          if (next.kind === "folder") run(library.updateNotebook(next.id, { color: next.color ?? COVER_COLORS[0], icon: next.icon }));
          else run(library.setCover(next.id, { color: next.color, icon: next.icon }));
        }} /> : null}
      </Dialog>
    </View>
  );
}

/** Folders as an indented list, leaving out one folder and everything inside it (a folder cannot move into itself). */
function tree(folders: Notebook[], parent: string | null, depth: number, exclude?: string): { folder: Notebook; depth: number }[] {
  return folders.filter((f) => (f.parentId ?? null) === parent && f.id !== exclude).sort((a, b) => a.title.localeCompare(b.title)).flatMap((f) => [{ folder: f, depth }, ...tree(folders, f.id, depth + 1, exclude)]);
}

function FolderRow({ title, icon, tint, depth, onPress }: { title: string; icon: string | null; tint?: string; depth: number; onPress(): void }) {
  const { space, color } = useTheme();
  return (
    <Press label={title} onPress={onPress} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, paddingLeft: space.sm + depth * 18, paddingRight: space.sm }}>
      {icon ? <Text style={{ fontSize: 16 }}>{icon}</Text> : <Icon name={depth ? "folder" : "home"} size={18} color={tint ?? color.inkSoft} />}
      <Text variant="body" numberOfLines={1}>{title}</Text>
    </Press>
  );
}

function FolderTile({ folder, width, items, onOpen, onDropDocument }: { folder: Notebook; width: number; items: number; onOpen(): void; onDropDocument(id: string): void }) {
  const { space } = useTheme();
  const ref = useRef<ViewHandle>(null);
  // On desktop, a note dragged onto a folder goes into it.
  useDropTarget(ref, { onDocument: (id) => onDropDocument(id) });
  return (
    <View ref={ref} collapsable={false} style={{ width }}>
      <Press label={`${folder.title} folder, ${items} ${items === 1 ? "item" : "items"}`} onPress={onOpen} testID="library-folder" bodyStyle={{ padding: space.sm, gap: space.sm }}>
        <View style={{ height: 112, borderRadius: 12, backgroundColor: `${folder.color}22`, borderWidth: 1, borderColor: `${folder.color}55`, alignItems: "center", justifyContent: "center" }}>
          <View style={{ position: "absolute", left: 12, top: 10, width: 44, height: 10, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: `${folder.color}55` }} />
          {folder.icon ? <Text style={{ fontSize: 40 }}>{folder.icon}</Text> : <Icon name="folder" size={40} color={folder.color} />}
        </View>
        <View style={{ gap: 2, paddingHorizontal: 2 }}>
          <Text variant="label" numberOfLines={1}>{folder.title}</Text>
          <Text variant="caption" tone="soft">{items} {items === 1 ? "item" : "items"}</Text>
        </View>
      </Press>
    </View>
  );
}

function Customizer({ value, onChange }: { value: Customizing; onChange(next: Customizing): void }) {
  const { space, color } = useTheme();
  return (
    <View style={{ gap: space.md, maxWidth: 340 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {value.kind === "entry" ? <Press label="No colour" selected={!value.color} onPress={() => onChange({ ...value, color: null })} feedback="none" bodyStyle={{ width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: !value.color ? color.ink : color.line, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={14} color={color.inkSoft} /></Press> : null}
        {COVER_COLORS.map((c) => <Press key={c} label={`Colour ${c}`} selected={value.color === c} onPress={() => onChange({ ...value, color: c })} feedback="none" bodyStyle={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: value.color === c ? 3 : 0, borderColor: color.ink }} />)}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Press label="No icon" selected={!value.icon} onPress={() => onChange({ ...value, icon: null })} feedback="none" bodyStyle={{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: !value.icon ? 2 : 1, borderColor: !value.icon ? color.accent.fill : color.line }}><Icon name="close" size={14} color={color.inkSoft} /></Press>
        {COVER_ICONS.map((icon) => <Press key={icon} label={`Icon ${icon}`} selected={value.icon === icon} onPress={() => onChange({ ...value, icon })} feedback="none" bodyStyle={{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: value.icon === icon ? 2 : 1, borderColor: value.icon === icon ? color.accent.fill : color.line }}><Text style={{ fontSize: 20 }}>{icon}</Text></Press>)}
      </View>
    </View>
  );
}

function Card({ entry, width, onOpen }: { entry: LibraryEntry; width: number; onOpen(entry: LibraryEntry): void }) {
  const { space, color } = useTheme();
  const ref = useRef<ViewHandle>(null);
  // On desktop a card can be dragged onto the canvas, where it opens in a window of its own.
  useDragSource(ref, entry.trashed ? null : entry.id);
  return (
    <View ref={ref} collapsable={false} style={{ width }}>
      <Press label={`${entry.title}, ${KIND_LABEL[entry.kind]}`} hint={entry.trashed ? "In the trash" : undefined} onPress={() => (entry.trashed ? undefined : onOpen(entry))} testID={`library-entry-${entry.kind}`}
        style={{ opacity: entry.trashed ? 0.6 : 1 }} bodyStyle={{ padding: space.sm, gap: space.sm }}>
        <Cover entry={entry} />
        <View style={{ gap: 2, paddingHorizontal: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {entry.pinned ? <Icon name="pin" size={13} color={color.inkSoft} /> : null}
            <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{entry.title}</Text>
          </View>
          <Text variant="caption" tone="soft" numberOfLines={1}>{entry.kind !== "board" && entry.pages > 1 || entry.kind === "pdf" ? `${entry.pages} ${entry.pages === 1 ? "page" : "pages"} · ` : ""}{relativeTime(entry.updated)}</Text>
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
function Starter({ kinds, onCreate, onImport }: { kinds: NoteKind[]; onCreate(kind: Exclude<NoteKind, "pdf">, template?: string, paper?: string): void; onImport(): void }) {
  const { space } = useTheme();
  const options: { key: string; icon: IconName; title: string; detail: string; onPress(): void }[] = [];
  if (kinds.includes("note")) options.push(
    { key: "note", icon: "notes", title: "New note", detail: "Type and write on the same pages", onPress: () => onCreate("note", "blank", "ruled") },
    { key: "lecture", icon: "bulletList", title: "Lecture notes", detail: "Key ideas, questions, summary", onPress: () => onCreate("note", "lecture", "ruled") },
    { key: "grid", icon: "pen", title: "Note on grid paper", detail: "For working and diagrams", onPress: () => onCreate("note", "blank", "grid") },
  );
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
function Cover({ entry }: { entry: LibraryEntry }) {
  const tint = entry.cover.color;
  const lines = entry.kind === "note" ? [0.86, 0.72, 0.9, 0.55] : [];
  return (
    <View style={{ height: 112, borderRadius: 10, backgroundColor: entry.kind === "board" ? "#fbfbf8" : "#ffffff", borderWidth: 1, borderColor: "rgba(20,24,40,0.08)", overflow: "hidden", padding: 12, gap: 7 }}>
      {tint ? <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, backgroundColor: tint }} /> : null}
      {entry.cover.icon ? <Text style={{ position: "absolute", right: 10, top: 8, fontSize: 22 }}>{entry.cover.icon}</Text> : null}
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
