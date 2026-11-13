// The Notes, PDFs and Whiteboards explorer. One library supplies every view and every window.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Button, ColorPicker, Dialog, EmptyState, Icon, IconButton, Menu, Press, Sheet, Text, TextField, Tooltip, useControlHeight, useNotice, useTheme, type IconName, type MenuItem, type ViewHandle } from "@sylf/design-system";
import { inLibraryOrder, type Cover, type LibraryEntry, type NoteKind, type Notebook, type NotesLibrary } from "@sylf/notes";
import { useLibrarySnapshot } from "../../../shell/notes/library";
import { useSessionState } from "../../../shell/context";
import { KIND_ICON, LibraryGallery, type ReorderActions } from "./LibraryGallery";
import { LibraryNavigation } from "./LibraryNavigation";
import { CoverImage } from "./LibraryPreview";
import { folderIndex, folderKey, folderPath, folderRows, ROOT_LIBRARY, type LibraryLocation, type LibraryPlace, type LibrarySort } from "./library-view";
import NoteStyleSheet from "./NoteStyleSheet";
import { createOptions, noteStyle } from "./note-style";
import { importPdfFile } from "./pdf-import";
import { pickImage, type PickedImage } from "./pick-image";

export { KIND_ICON, KIND_LABEL, relativeTime } from "./LibraryGallery";
export type { LibraryLocation } from "./library-view";

const COVER_COLORS = ["#5b7cfa", "#2f9e8f", "#d9822b", "#c2547a", "#7a62d6", "#4f8a3a", "#c8423b", "#3d8bd9", "#8a6d3b", "#55606e"];
const SWATCHES = COVER_COLORS.map((hex) => ({ hex, name: `Colour ${hex}` }));
const COVER_ICONS = ["📘", "📗", "📙", "📕", "📓", "🧮", "📐", "🧪", "🔬", "🧬", "🌍", "🏛️", "💡", "🎵", "🎨", "💻", "📝", "⭐", "🔥", "🎯"];

interface Props {
  library: NotesLibrary;
  kinds: NoteKind[];
  /** Which kinds this window creates first. */
  primary: NoteKind;
  location: LibraryLocation | null;
  onLocation(location: LibraryLocation): void;
  onOpen(entry: LibraryEntry): void;
  /** Opens it in a window of its own, beside this one. */
  onOpenNew?(entry: LibraryEntry): void;
  footer?: ReactNode;
}

type Appearance = { id: string; title: string; color: string | null; icon: string | null };
type Customizing = Appearance & ({ kind: "folder" } | { kind: "entry"; image: Cover["image"]; picked?: PickedImage | null });
const SORT: Record<LibrarySort, string> = { folder: "Folder order", recent: "Most recent", name: "Name" };
const NO_FOLDERS: Notebook[] = [];
const NO_ENTRIES: LibraryEntry[] = [];
const NO_EXPANSION: readonly string[] = [];

export default function LibraryBrowser({ library, kinds, primary, location, onLocation, onOpen, onOpenNew, footer }: Props) {
  const theme = useTheme();
  const { space, color, shape } = theme;
  const notice = useNotice();
  const snapshot = useLibrarySnapshot(library);
  const session = useSessionState();
  const studyingId = session.active?.subjectId ?? session.plan?.subjectId ?? null;
  const studying = studyingId == null ? null : String(studyingId);
  const current = location ?? ROOT_LIBRARY;
  const { place, query, sort = "folder", view = "grid", expanded: expandedIds = NO_EXPANSION } = current;
  const [size, setSize] = useState({ width: 480, height: 520 });
  const [arranging, setArranging] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [naming, setNaming] = useState<{ title: string; value: string; apply(value: string): Promise<unknown>; action?: string; placeholder?: string; allowEmpty?: boolean } | null>(null);
  const [styling, setStyling] = useState(false);
  const [moving, setMoving] = useState<{ title: string; apply(folder: string | null): Promise<unknown>; exclude?: string } | null>(null);
  const [customizing, setCustomizing] = useState<Customizing | null>(null);
  const [deleting, setDeleting] = useState<LibraryEntry | null>(null);
  const [libraryMenu, setLibraryMenu] = useState(false);
  const [sortMenu, setSortMenu] = useState(false);
  const libraryAnchor = useRef<ViewHandle>(null);
  const sortAnchor = useRef<ViewHandle>(null);

  const folders = snapshot.notebooks;
  const index = useMemo(() => folderIndex(folders, snapshot.order, sort), [folders, snapshot.order, sort]);
  const inTrash = "trash" in place, inImported = "imported" in place, inFolders = "folder" in place;
  const folder = inFolders && place.folder ? index.byId.get(place.folder) ?? null : null;
  const folderId = folder?.id ?? null;
  const path = folderPath(folder, index.byId);
  const parent = path.at(-2) ?? null;
  const searching = query.trim().length > 0;
  const expanded = useMemo(() => new Set(expandedIds), [expandedIds]);
  const browse = (next: LibraryPlace) => {
    setArranging(false);
    setDrawer(false);
    const path = "folder" in next && next.folder ? folderPath(index.byId.get(next.folder) ?? null, index.byId) : [];
    const branch = new Set([...expanded, ...path.map(({ id }) => id)]);
    onLocation({ ...current, place: next, query: "", expanded: [...branch] });
  };
  const toggleFolder = (id: string) => {
    const branch = new Set(expanded);
    if (branch.has(id)) branch.delete(id);
    else branch.add(id);
    onLocation({ ...current, expanded: [...branch] });
  };
  const childFolders = !searching && inFolders ? index.children.get(folderKey(folderId)) ?? NO_FOLDERS : NO_FOLDERS;
  const scoped = useMemo(() => snapshot.entries.filter((entry) => kinds.includes(entry.kind)), [snapshot.entries, kinds]);
  const counts = useMemo(() => {
    const docs = new Map<string, number>();
    let all = 0, trash = 0, imported = 0;
    for (const entry of scoped) {
      if (entry.trashed) { trash++; continue; }
      all++;
      if (entry.kind === "pdf") imported++;
      if (entry.notebookId) docs.set(entry.notebookId, (docs.get(entry.notebookId) ?? 0) + 1);
    }
    return { docs, all, trash, imported };
  }, [scoped]);
  const cardCounts = useMemo(() => new Map(folders.map(({ id }) => [id, (counts.docs.get(id) ?? 0) + (index.children.get(id)?.length ?? 0)])), [counts, folders, index]);

  const order = !searching && inFolders && sort === "folder" ? snapshot.order?.[folderKey(folderId)] : undefined;
  const entries = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = scoped.filter((entry) => {
      if (entry.trashed !== inTrash || (inImported && entry.kind !== "pdf")) return false;
      if (inFolders && !words.length) {
        const home = entry.notebookId && index.byId.has(entry.notebookId) ? entry.notebookId : null;
        if (home !== folderId) return false;
      }
      if (!words.length) return true;
      const text = `${entry.title} ${entry.text || entry.preview}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
    filtered.sort((a, b) => sort === "name" ? a.title.localeCompare(b.title) : inImported ? b.created - a.created : b.updated - a.updated);
    return inLibraryOrder(filtered, order);
  }, [scoped, inTrash, inImported, inFolders, folderId, query, sort, order, index.byId]);

  const openEntry = (entry: LibraryEntry) => { onLocation(current); onOpen(entry); };
  const run = (task: Promise<unknown>, done?: string) => { void task.then(() => { if (done) notice(done); }, (error: unknown) => notice(error instanceof Error ? error.message : "That didn't work.")); };
  const create = async (kind: "note" | "board", title: string) => {
    try {
      const id = await library.create({ ...createOptions(kind, noteStyle.get(), title.trim() || undefined), notebookId: folderId, subjectId: studying });
      const entry = library.getSnapshot().entries.find((e) => e.id === id);
      if (entry) openEntry(entry);
    } catch (error) { notice(error instanceof Error ? error.message : "The note could not be created."); }
  };
  const importPdf = async () => {
    try {
      const id = await importPdfFile(library, folderId, studying);
      const entry = id ? library.getSnapshot().entries.find((e) => e.id === id) : null;
      if (entry) openEntry(entry);
    } catch (error) { notice(error instanceof Error ? error.message : "That PDF could not be added."); }
  };
  const newFolder = () => setNaming({ title: folder ? `New folder in ${folder.title}` : "New folder", value: "", apply: async (value) => {
    await library.createNotebook(value, folderId);
    browse({ folder: folderId });
  } });

  const askName = (kind: "note" | "board") => setNaming({ title: kind === "board" ? "New whiteboard" : "New note", value: "", action: "Create", allowEmpty: true, placeholder: kind === "board" ? "Whiteboard" : "Untitled note", apply: (v) => create(kind, v) });
  const primaryAction = () => {
    if (primary === "pdf" || inImported) void importPdf();
    else askName(primary === "board" ? "board" : "note");
  };
  const submitName = () => { const n = naming; setNaming(null); if (n && (n.allowEmpty || n.value.trim())) run(n.apply(n.value.trim())); };
  const pickFolder = (title: string, apply: (folder: string | null) => Promise<unknown>, exclude?: string) => setMoving({ title, apply, exclude });
  const entryMenu = (entry: LibraryEntry): MenuItem[] => entry.trashed ? [
    { key: "restore", label: "Restore", icon: "reset", onSelect: () => run(library.restore(entry.id), "Restored") },
    { key: "delete", label: "Delete forever", icon: "trash", destructive: true, onSelect: () => setDeleting(entry) },
  ] : [
    { key: "open", label: "Open", icon: KIND_ICON[entry.kind], onSelect: () => openEntry(entry) },
    ...(onOpenNew ? [{ key: "window", label: "Open in a new window", icon: "split" as IconName, onSelect: () => onOpenNew(entry) }] : []),
    { key: "rename", label: "Rename", icon: "type", onSelect: () => setNaming({ title: "Rename", value: entry.title, apply: (v) => library.rename(entry.id, v) }) },
    { key: "look", label: "Customize cover", icon: "palette", onSelect: () => setCustomizing({ kind: "entry", id: entry.id, title: entry.title, ...entry.cover }) },
    { key: "move", label: "Move to a folder", icon: "folder", onSelect: () => pickFolder(`Move ${entry.title}`, (to) => library.move(entry.id, to)) },
    { key: "pin", label: entry.pinned ? "Unpin" : "Pin to top", icon: "pin", onSelect: () => run(library.pin(entry.id, !entry.pinned)) },
    { key: "copy", label: "Duplicate", icon: "copy", onSelect: () => run(library.duplicate(entry.id), "Duplicated") },
    { key: "trash", label: "Move to trash", icon: "trash", destructive: true, onSelect: () => run(library.trash(entry.id), "Moved to trash") },
  ];
  const folderMenu = (f: Notebook): MenuItem[] => [
    { key: "open", label: "Open", icon: "folder", onSelect: () => browse({ folder: f.id }) },
    { key: "rename", label: "Rename", icon: "type", onSelect: () => setNaming({ title: "Rename folder", value: f.title, apply: (v) => library.renameNotebook(f.id, v) }) },
    { key: "look", label: "Customize folder", icon: "palette", onSelect: () => setCustomizing({ kind: "folder", id: f.id, title: f.title, color: f.color, icon: f.icon ?? null }) },
    { key: "sub", label: "New subfolder", icon: "plus", onSelect: () => setNaming({ title: `New folder in ${f.title}`, value: "", apply: async (v) => { await library.createNotebook(v, f.id); } }) },
    { key: "move", label: "Move into another folder", icon: "folder", onSelect: () => pickFolder(`Move ${f.title}`, (to) => library.updateNotebook(f.id, { parentId: to }), f.id) },
    { key: "delete", label: "Delete folder", detail: "What is inside moves up", icon: "trash", destructive: true, onSelect: () => run(library.deleteNotebook(f.id), "Folder deleted") },
  ];

  const libraryTitle = primary === "pdf" ? "PDFs" : primary === "board" ? "Whiteboards" : "Notes";
  const allLabel = `All ${libraryTitle === "PDFs" ? libraryTitle : libraryTitle.toLowerCase()}`;
  const primaryLabel = primary === "pdf" ? "Import" : inImported ? "Import PDF" : primary === "board" ? "New whiteboard" : "New note";
  const primaryIcon = primary === "pdf" || inImported ? "fileImport" : "plus";
  const visibleEntries = searching || inTrash || inImported ? entries : entries.filter((entry) => !entry.pinned);
  const pinned = searching || inTrash || inImported ? NO_ENTRIES : entries.filter((entry) => entry.pinned);
  const canArrange = inFolders && !searching && Math.max(childFolders.length, pinned.length, visibleEntries.length) > 1;
  const arrangingHere = arranging && canArrange;
  const list = arrangingHere || view === "list" || size.width < 278 || size.height < 300;
  const rail = size.width >= 864;
  const railWidth = Math.min(240, Math.round(size.width * 0.23));
  const mainWidth = size.width - (rail ? railWidth : 0);
  const reorder = (items: { id: string }[], index: number): ReorderActions | undefined => {
    if (!arrangingHere) return undefined;
    const id = items[index].id, previous = items[index - 1], next = items[index + 1];
    return {
      up: previous ? () => run(library.reorder(id, previous.id, "before")) : undefined,
      down: next ? () => run(library.reorder(id, next.id, "after")) : undefined,
    };
  };
  const setSort = (next: LibrarySort) => { setArranging(false); onLocation({ ...current, sort: next }); };
  const switchView = () => { setArranging(false); onLocation({ ...current, view: view === "grid" ? "list" : "grid" }); };
  const styleLabel = primary === "board" ? "Whiteboard style" : "Note style";
  const menuItems: MenuItem[] = [
    ...(!inTrash ? [{ key: "folder", label: folder ? "New subfolder" : "New folder", icon: "folder" as const, onSelect: newFolder }] : []),
    ...(!inTrash && primary === "note" && !inImported ? [{ key: "import", label: "Import PDF", icon: "fileImport" as const, onSelect: () => void importPdf() }] : []),
    { key: "all", label: allLabel, icon: KIND_ICON[primary], selected: "all" in place, onSelect: () => browse({ all: true }) },
    { key: "folders", label: "Manage folders", icon: "folder", selected: inFolders && !folder, onSelect: () => browse({ folder: null }) },
    { key: "trash", label: "Trash", icon: "trash", selected: inTrash, onSelect: () => browse({ trash: true }) },
    ...(canArrange ? [{ key: "arrange", label: arrangingHere ? "Finish arranging" : "Arrange items", icon: "checkList" as const, onSelect: () => { onLocation({ ...current, sort: "folder" }); setArranging(!arrangingHere); } }] : []),
    ...path.slice(0, -1).map(({ id, title }) => ({ key: id, label: `Go to ${title}`, icon: "folder" as const, onSelect: () => browse({ folder: id }) })),
  ];
  const dropInto = (id: string, target: Notebook) => run(library.move(id, target.id), `Moved to ${target.title}`);
  const navigation = <LibraryNavigation title={rail ? `${libraryTitle} library` : undefined} allLabel={allLabel} place={place} childrenByParent={index.children} counts={cardCounts}
    allCount={counts.all} folderCount={folders.length} trashCount={counts.trash} importedCount={primary === "note" ? counts.imported : undefined}
    expanded={expanded} onChoose={browse} onToggle={toggleFolder} onDropDocument={dropInto} />;
  const locationTitle = searching ? "Search results" : inTrash ? "Trash" : inImported ? "Imported PDFs" : inFolders ? folder?.title ?? "Folders" : allLabel;
  const noun = searching ? "result" : primary === "pdf" || inImported ? "PDF" : primary === "board" ? "whiteboard" : "document";
  const documentCount = `${entries.length} ${noun}${entries.length === 1 ? "" : "s"}`;
  const subtitle = childFolders.length ? `${childFolders.length} ${childFolders.length === 1 ? "folder" : "folders"} · ${documentCount}` : documentCount;
  const narrow = mainWidth < 360;
  const empty = snapshot.ready && !snapshot.failure ? (
    <View style={{ flex: 1, justifyContent: "center", alignSelf: "center", maxWidth: 340, paddingVertical: narrow ? space.xs : space.lg }}>
      {searching ? <EmptyState icon="search" title="Nothing matches" message="Try a different word or note title." />
        : inTrash ? <EmptyState icon="trash" title="Trash is empty" message="Deleted documents wait here until you remove them." />
        : folder ? <EmptyState icon="folder" title="This folder is empty" message="Documents you create here stay in this folder." />
        : inFolders ? <EmptyState icon="folder" title="No folders yet" message="Create a folder to organize your library." action={<Button title="New folder" icon="plus" size="small" onPress={newFolder} />} />
        : <EmptyState compact={narrow || size.height < 300} icon={inImported ? "pdf" : KIND_ICON[primary]} title={primary === "pdf" || inImported ? "No PDFs yet" : primary === "board" ? "No whiteboards yet" : "No notes yet"}
            message={primary === "pdf" || inImported ? "Import a PDF to read and annotate it." : primary === "board" ? "Create a whiteboard to sketch and work through ideas." : "Create a note to type and write on the same page."} />}
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: color.plane }} testID="notes-library"
      onLayout={({ nativeEvent: { layout } }) => setSize((previous) => previous.width === layout.width && previous.height === layout.height ? previous : { width: layout.width, height: layout.height })}>
      {rail ? (
        <View style={{ width: railWidth, backgroundColor: color.raised, borderRightWidth: 1, borderRightColor: color.line }} testID="library-rail">
          {navigation}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ width: "100%", maxWidth: 1392, alignSelf: "center", paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            {!rail ? <Tooltip text="Browse library">{(tooltip) => (
              <IconButton {...tooltip} icon="sidebar" size="small" label="Browse library" expanded={drawer} onPress={() => setDrawer(true)} style={{ alignSelf: "center" }} testID="library-browse" />
            )}</Tooltip> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant={mainWidth >= 480 ? "title" : narrow ? "subheading" : "heading"} numberOfLines={narrow ? 2 : 1} role="heading" aria-level={1} testID="library-heading">{locationTitle}</Text>
              <Text variant="caption" tone="soft" numberOfLines={1}>{subtitle}</Text>
            </View>
            {!inTrash ? narrow || (primary === "board" && mainWidth < 440) ?
              <Tooltip text={primaryLabel}>{(tooltip) => <IconButton {...tooltip} icon={primaryIcon} label={primaryLabel} active onPress={primaryAction} testID="library-new" style={{ alignSelf: "center" }} />}</Tooltip>
              : <Button title={primaryLabel} icon={primaryIcon} variant="emphasis" size="small" testID="library-new" onPress={primaryAction} /> : null}
          </View>
          {folder && !searching ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <Press label={parent ? "Go to Folders" : "Back to Folders"} onPress={() => browse({ folder: null })} bodyStyle={{ padding: space.xs }}>
                <Text variant="caption" tone="soft">Folders</Text>
              </Press>
              {parent ? <>
                <Icon name="chevronRight" size={12} color={color.inkSoft} />
                <Press label={`Back to ${parent.title}`} onPress={() => browse({ folder: parent.id })} style={{ flexShrink: 1 }} bodyStyle={{ padding: space.xs }}>
                  <Text variant="caption" numberOfLines={1} tone="soft">{parent.title}</Text>
                </Press>
              </> : null}
              <Icon name="chevronRight" size={12} color={color.inkSoft} />
              <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{folder.title}</Text>
              <Tooltip text="New subfolder">{(tooltip) => <IconButton {...tooltip} icon="folder" size="small" label="New subfolder" onPress={newFolder} />}</Tooltip>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <TextField label="Search" hideLabel icon="search" placeholder={inTrash ? "Search trash" : mainWidth < 490 ? "Search" : "Search every folder"}
                value={query} onChangeText={(next) => { setArranging(false); onLocation({ ...current, query: next }); }} returnKeyType="search" />
            </View>
            {query ? <IconButton icon="close" size="small" label="Clear search" onPress={() => onLocation({ ...current, query: "" })} /> : null}
            <View ref={sortAnchor} collapsable={false}>
              <Tooltip text={`Sort · ${SORT[sort]}`}>{(tooltip) => <IconButton {...tooltip} icon="sliders" size="small" label="Sort library" expanded={sortMenu} onPress={() => setSortMenu(true)} />}</Tooltip>
            </View>
            {size.width >= 278 && size.height >= 300 ? <Tooltip text={view === "grid" ? "List view" : "Grid view"}>{(tooltip) => (
              <IconButton {...tooltip} icon={view === "grid" ? "list" : "grid"} size="small" label={view === "grid" ? "List view" : "Grid view"} onPress={switchView} />
            )}</Tooltip> : null}
            {primary !== "pdf" ? <Tooltip text={styleLabel}>{(tooltip) => (
              <IconButton {...tooltip} icon="settings" size="small" label={styleLabel} testID="note-style-open" onPress={() => setStyling(true)} />
            )}</Tooltip> : null}
            <View ref={libraryAnchor} collapsable={false}>
              <Tooltip text="Library options">{(tooltip) => <IconButton {...tooltip} icon="more" size="small" label="Library options" expanded={libraryMenu} onPress={() => setLibraryMenu(true)} />}</Tooltip>
            </View>
          </View>
          {arrangingHere ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: shape.radius.sm, backgroundColor: color.selected }}>
              <Text variant="caption" tone="soft" style={{ flex: 1 }}>Move items with the arrows. Order saves as you go.</Text>
              <Button title="Done arranging" size="small" variant="ghost" onPress={() => setArranging(false)} />
            </View>
          ) : null}
          {snapshot.failure ? <Text variant="small" tone="critical">{snapshot.failure}</Text> : null}
        </View>
        <LibraryGallery library={library} width={mainWidth} list={list} folders={childFolders} entries={visibleEntries} pinned={pinned}
          counts={cardCounts} folderHeading={folder ? "Subfolders" : null} entryHeading={childFolders.length || pinned.length ? (inFolders && !folder ? "Unfiled" : libraryTitle) : null}
          empty={empty} scrollKey={`${searching ? "search" : locationTitle}:${folderId ?? ""}:${list}`}
          entryMenu={entryMenu} folderMenu={folderMenu} reorder={reorder} onOpen={openEntry}
          onFolder={(folder) => browse({ folder: folder.id })} onDropDocument={dropInto} />
        {footer}
      </View>
      {!rail && drawer ? <Sheet open={drawer} onClose={() => setDrawer(false)} title={`Browse ${libraryTitle.toLowerCase()}`} width={320}>
        <View style={{ minHeight: 0, flexGrow: 1, flexShrink: 1, height: 480 }}>{navigation}</View>
      </Sheet> : null}
      <Menu open={libraryMenu} anchor={libraryAnchor} onClose={() => setLibraryMenu(false)} items={menuItems} label="Library options" />
      <Menu open={sortMenu} anchor={sortAnchor} onClose={() => setSortMenu(false)} label="Sort library" items={(Object.keys(SORT) as LibrarySort[]).map((key) => ({
        key, label: SORT[key], selected: sort === key, detail: key === "folder" ? "Saved order within each folder" : undefined, onSelect: () => setSort(key),
      }))} />
      <Dialog open={!!naming} onClose={() => setNaming(null)} title={naming?.title ?? ""} actions={[{ label: "Cancel", onPress: () => setNaming(null) }, { label: naming?.action ?? "Save", variant: "emphasis", onPress: () => submitName() }]}>
        <TextField label="Name" hideLabel autoFocus placeholder={naming?.placeholder} value={naming?.value ?? ""} onChangeText={(value) => setNaming((n) => (n ? { ...n, value } : n))} onSubmitEditing={() => submitName()} testID="library-name" />
      </Dialog>
      <NoteStyleSheet open={styling} onClose={() => setStyling(false)} notes={kinds.includes("note")} boards={kinds.includes("board")} />
      <Dialog open={!!moving} onClose={() => setMoving(null)} title={moving?.title ?? ""} actions={[{ label: "Cancel", onPress: () => setMoving(null) }]}>
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          <FolderRow title="Top level" icon={null} depth={0} onPress={() => { const m = moving; setMoving(null); if (m) run(m.apply(null), "Moved"); }} />
          {moving ? folderRows(index.children, undefined, moving.exclude).map(({ folder: f, depth }) => <FolderRow key={f.id} title={f.title} icon={f.icon ?? null} tint={f.color} depth={depth + 1} onPress={() => { const m = moving; setMoving(null); if (m) run(m.apply(f.id), `Moved to ${f.title}`); }} />) : null}
        </ScrollView>
      </Dialog>
      <Dialog open={!!customizing} onClose={() => setCustomizing(null)} title={customizing?.kind === "folder" ? "Customize folder" : "Customize cover"} actions={[
        { label: "Cancel", onPress: () => setCustomizing(null) },
        { label: "Save", variant: "emphasis", onPress: () => {
          if (!customizing) return;
          const { id, color, icon } = customizing;
          setCustomizing(null);
          if (customizing.kind === "folder") run(library.updateNotebook(id, { color: color ?? COVER_COLORS[0], icon }));
          else run(library.setCover(id, { color, icon, image: customizing.picked }), "Cover saved");
        } },
      ]}>
        {customizing ? <Customizer library={library} value={customizing} onChange={setCustomizing}
          onChoose={() => { void pickImage(512).then((picked) => {
            if (picked) setCustomizing((current) => current === customizing && current?.kind === "entry" ? { ...current, picked } : current);
          }, (error: unknown) => notice(error instanceof Error ? error.message : "That picture could not be opened.")); }} /> : null}
      </Dialog>
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete forever?" message={deleting ? `“${deleting.title}” will be permanently deleted from this library.` : undefined}
        actions={[{ label: "Cancel", onPress: () => setDeleting(null) }, { label: "Delete forever", variant: "critical", onPress: () => {
          if (deleting) run(library.remove(deleting.id), "Deleted");
          setDeleting(null);
        } }]} />
    </View>
  );
}

function FolderRow({ title, icon, tint, depth, onPress }: { title: string; icon: string | null; tint?: string; depth: number; onPress(): void }) {
  const { space, color } = useTheme();
  return (
    <Press label={title} onPress={onPress} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, paddingLeft: space.sm + Math.min(6, depth) * space.lg, paddingRight: space.sm }}>
      {icon ? <Text style={{ fontSize: 16 }}>{icon}</Text> : <Icon name={depth ? "folder" : "home"} size={18} color={tint ?? color.inkSoft} />}
      <Text variant="body" numberOfLines={1}>{title}</Text>
    </Press>
  );
}

function Customizer({ library, value, onChange, onChoose }: { library: NotesLibrary; value: Customizing; onChange(next: Customizing): void; onChoose(): void }) {
  const { space, color, shape } = useTheme();
  const iconSize = Math.max(44, useControlHeight());
  const recolor = (hex: string) => onChange({ ...value, color: hex });
  return (
    <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md, padding: space.xs }}>
      {value.kind === "entry" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ width: space.air, height: space.air, borderRadius: shape.radius.sm, backgroundColor: value.color ?? color.sunken, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
            {value.color ? null : <Icon name="notes" size={20} color={color.inkSoft} />}
            <CoverImage library={library} image={value.picked === undefined ? value.image : null} uri={value.picked?.url} />
          </View>
          <View style={{ flex: 1, gap: space.xs }}>
            <Text variant="label" numberOfLines={1}>{value.title}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              <Button title="Choose image" icon="image" size="small" onPress={onChoose} />
              {(value.picked === undefined ? value.image : value.picked) ? <Button title="Remove image" variant="ghost" size="small" onPress={() => onChange({ ...value, picked: null })} /> : null}
            </View>
          </View>
        </View>
      ) : null}
      <ColorPicker label={value.kind === "folder" ? "Folder colour" : "Cover colour"} value={value.color ?? color.accent.fill} swatches={SWATCHES} onPreview={recolor} onCommit={recolor} />
      {value.kind === "entry" && value.color ? <Button title="Clear colour" variant="ghost" size="small" onPress={() => onChange({ ...value, color: null })} /> : null}
      <Text variant="subheading">Icon</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <IconButton label="No icon" icon="close" active={!value.icon} onPress={() => onChange({ ...value, icon: null })} />
        {COVER_ICONS.map((icon) => (
          <Press key={icon} label={`Icon ${icon}`} selected={value.icon === icon} onPress={() => onChange({ ...value, icon })}
            bodyStyle={{ width: iconSize, height: iconSize, borderRadius: shape.radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: value.icon === icon ? color.selected : color.sunken }}>
            <Text variant="body">{icon}</Text>
          </Press>
        ))}
      </View>
    </ScrollView>
  );
}
