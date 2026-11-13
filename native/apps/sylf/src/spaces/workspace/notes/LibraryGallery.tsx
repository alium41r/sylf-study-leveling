import { useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { FlatList, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { ContextArea, DOCUMENT_DEFAULTS, Icon, IconButton, Menu, Press, Text, useInputFormat, useTheme, type IconName, type MenuItem, type ViewHandle } from "@sylf/design-system";
import type { LibraryEntry, NoteKind, Notebook, NotesLibrary } from "@sylf/notes";
import { useDragSource, useDropTarget } from "../drop";
import { CoverImage, LibraryPreview } from "./LibraryPreview";

export const KIND_ICON: Record<NoteKind, IconName> = { note: "notes", handwriting: "notes", pdf: "pdf", board: "whiteboard" };
export const KIND_LABEL: Record<NoteKind, string> = { note: "Note", handwriting: "Note", pdf: "PDF", board: "Whiteboard" };

export function relativeTime(time: number, now = Date.now()) {
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "Yesterday" : `${days} days ago`;
  return new Date(time).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export type ReorderActions = { up?: () => void; down?: () => void };
type Row = { kind: "heading"; key: string; label: string; count: number }
  | { kind: "folders"; key: string; width: number; items: Notebook[]; start: number }
  | { kind: "documents"; key: string; width: number; items: LibraryEntry[]; start: number; pinned: boolean };

interface Props {
  library: NotesLibrary;
  width: number;
  list: boolean;
  folders: Notebook[];
  entries: LibraryEntry[];
  pinned: LibraryEntry[];
  counts: ReadonlyMap<string, number>;
  folderHeading: string | null;
  entryHeading: string | null;
  empty: ReactElement | null;
  scrollKey: string;
  entryMenu(entry: LibraryEntry): MenuItem[];
  folderMenu(folder: Notebook): MenuItem[];
  reorder(items: { id: string }[], index: number): ReorderActions | undefined;
  onOpen(entry: LibraryEntry): void;
  onFolder(folder: Notebook): void;
  onDropDocument(id: string, folder: Notebook): void;
}

export function LibraryGallery({ library, width, list, folders, entries, pinned, counts, folderHeading, entryHeading, empty, scrollKey, entryMenu, folderMenu, reorder, onOpen, onFolder, onDropDocument }: Props) {
  const { space } = useTheme();
  const outerWidth = Math.min(width, 1392);
  const innerWidth = Math.max(1, outerWidth - space.lg * 2);
  const gap = space.md;
  const folderColumns = list ? 1 : Math.min(10, Math.max(2, Math.floor((innerWidth + gap) / (108 + gap))));
  const columns = list ? 1 : Math.min(8, Math.max(2, Math.floor((innerWidth + gap) / (132 + gap))));
  const rows = useMemo(() => {
    const data: Row[] = [];
    if (folders.length) {
      if (folderHeading) data.push({ kind: "heading", key: "folders", label: folderHeading, count: folders.length });
      const width = (innerWidth - (folderColumns - 1) * gap) / folderColumns;
      for (let i = 0; i < folders.length; i += folderColumns) data.push({ kind: "folders", key: folders[i].id, width, items: folders.slice(i, i + folderColumns), start: i });
    }
    const width = (innerWidth - (columns - 1) * gap) / columns;
    for (const section of [{ pinned: true, items: pinned, label: "Pinned" }, { pinned: false, items: entries, label: entryHeading }]) {
      if (!section.items.length) continue;
      if (section.label) data.push({ kind: "heading", key: section.pinned ? "pinned" : "documents", label: section.label, count: section.items.length });
      for (let i = 0; i < section.items.length; i += columns) data.push({ kind: "documents", key: section.items[i].id, width, items: section.items.slice(i, i + columns), start: i, pinned: section.pinned });
    }
    return data;
  }, [folders, entries, pinned, folderHeading, entryHeading, columns, folderColumns, innerWidth, gap]);

  const [viewable, setViewable] = useState<ReadonlySet<string>>(() => new Set());
  const onViewable = useRef(({ viewableItems }: { viewableItems: { key: string }[] }) => {
    setViewable(new Set(viewableItems.map((item) => item.key)));
  });
  const viewability = useRef({ itemVisiblePercentThreshold: 5, minimumViewTime: 70 });

  return (
    <FlatList key={scrollKey} data={rows} keyExtractor={(row) => row.key} testID={list ? "library-list" : "library-gallery"}
      onViewableItemsChanged={onViewable.current} viewabilityConfig={viewability.current} keyboardShouldPersistTaps="handled"
      initialNumToRender={5} maxToRenderPerBatch={8} windowSize={5}
      style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ flexGrow: 1, width: "100%", maxWidth: 1392, alignSelf: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg }}
      ListEmptyComponent={empty ?? undefined}
      renderItem={({ item: row, index }) => {
        if (row.kind === "heading") return (
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, paddingBottom: space.sm }}>
            <Text variant="subheading" role="heading" aria-level={2}>{row.label}</Text>
            <Text variant="micro" tone="soft">{row.count}</Text>
          </View>
        );
        return (
          <View style={{ flexDirection: "row", alignItems: "stretch", gap, paddingBottom: list ? space.xs : space.lg }}>
            {row.kind === "folders" ? row.items.map((folder, i) => (
              <FolderCard key={folder.id} folder={folder} count={counts.get(folder.id) ?? 0} width={row.width} list={list}
                menu={folderMenu(folder)} reorder={reorder(folders, row.start + i)} onOpen={() => onFolder(folder)} onDropDocument={(id) => onDropDocument(id, folder)} />
            )) : row.items.map((entry, i) => (
              <DocumentCard key={entry.id} library={library} entry={entry} width={row.width} list={list}
                visible={index < 3 || viewable.has(row.key)} menu={entryMenu(entry)} reorder={reorder(row.pinned ? pinned : entries, row.start + i)}
                onOpen={entry.trashed ? undefined : () => onOpen(entry)} />
            ))}
          </View>
        );
      }} />
  );
}

function FolderCard({ folder, count, width, list, menu, reorder, onOpen, onDropDocument }: {
  folder: Notebook; count: number; width: number; list: boolean; menu: MenuItem[]; reorder?: ReorderActions;
  onOpen(): void; onDropDocument(id: string): void;
}) {
  const { color } = useTheme();
  const target = useRef<ViewHandle>(null);
  useDropTarget(target, { onDocument: onDropDocument });
  const detail = `${count} ${count === 1 ? "item" : "items"}`;
  const art = list ? <Icon name="folder" size={20} color={color.inkSoft} markColor={folder.color} /> : (
    <Svg width={width * 0.72} height={Math.min(82, width * 0.60)} viewBox="0 0 120 88" accessible={false}>
      <Path d="M9 21a6 6 0 0 1 6-6h29l11 10h50a6 6 0 0 1 6 6v43H9Z" fill={folder.color} />
      {count > 0 ? <>
        <Rect x={34} y={30} width={62} height={42} rx={3} fill={DOCUMENT_DEFAULTS.paper} opacity={0.54} />
        <Rect x={24} y={25} width={62} height={47} rx={3} fill={DOCUMENT_DEFAULTS.paper} opacity={0.92} />
      </> : null}
      <Path d="M9 38h38c7 0 9 10 16 10h48v26a7 7 0 0 1-7 7H16a7 7 0 0 1-7-7Z" fill={folder.color} />
      <Path d="M9 38h38c7 0 9 10 16 10h48v26a7 7 0 0 1-7 7H16a7 7 0 0 1-7-7Z" fill={color.ground} opacity={0.22} />
    </Svg>
  );
  return (
    <View ref={target} collapsable={false} style={{ width }}>
      <GalleryCard title={folder.title} label={`${folder.title} folder, ${detail}`} detail={detail} list={list} folder
        tint={folder.color} emoji={folder.icon} art={art} menu={menu} reorder={reorder} onOpen={onOpen} testID="library-folder" />
    </View>
  );
}

function DocumentCard({ library, entry, width, list, visible, menu, reorder, onOpen }: {
  library: NotesLibrary; entry: LibraryEntry; width: number; list: boolean; visible: boolean; menu: MenuItem[]; reorder?: ReorderActions; onOpen?(): void;
}) {
  const target = useRef<ViewHandle>(null);
  const { color } = useTheme();
  useDragSource(target, entry.trashed || reorder ? null : entry.id);
  const metadata = `${entry.kind === "pdf" ? "PDF · " : ""}${relativeTime(entry.updated)}`;
  const detail = list && entry.preview && entry.preview !== entry.title ? entry.preview : metadata;
  return (
    <View ref={target} collapsable={false} style={{ width }}>
      <GalleryCard title={entry.title} label={`${entry.title}, ${KIND_LABEL[entry.kind]}`} detail={detail} list={list}
        tint={entry.cover.color} emoji={entry.cover.icon} pinned={entry.pinned}
        art={list ? (
          <>
            <Icon name={KIND_ICON[entry.kind]} size={19} color={color.inkSoft} />
            {visible && entry.cover.image ? <CoverImage library={library} image={entry.cover.image} /> : null}
          </>
        ) : <LibraryPreview library={library} entry={entry} width={width} height={Math.round(width * 0.88)} visible={visible} />}
        menu={menu} reorder={reorder} onOpen={onOpen} testID={`library-entry-${entry.kind}`} />
    </View>
  );
}

function GalleryCard({ title, label, detail, list, folder, tint, emoji, pinned, art, menu, reorder, onOpen, testID }: {
  title: string; label: string; detail: string; list: boolean; folder?: boolean; tint?: string | null; emoji?: string | null; pinned?: boolean;
  art: ReactNode; menu: MenuItem[]; reorder?: ReorderActions; onOpen?(): void; testID: string;
}) {
  const theme = useTheme();
  const { color, density, shape, space } = theme;
  const format = useInputFormat();
  const [open, setOpen] = useState(false);
  const anchor = useRef<ViewHandle>(null);
  const previewStyle = list
    ? { width: space.xxl, height: space.xxl, borderRadius: shape.radius.sm, backgroundColor: color.sunken }
    : { width: "100%" as const, borderRadius: shape.radius.md, backgroundColor: color.sunken, ...(folder ? { paddingVertical: space.xs } : {}) };
  return (
    <View style={list ? { flexDirection: "row", alignItems: "center", gap: space.xs, borderBottomWidth: 1, borderBottomColor: color.line } : undefined}>
      <View style={list ? { flex: 1, minWidth: 0 } : undefined}>
        <ContextArea label={title} items={menu}>
          {(longPress) => (
            <Press label={label} hint={detail} onPress={onOpen ?? (() => setOpen(true))} onLongPress={longPress} delayLongPress={380} testID={testID} radius={shape.radius.md}
              bodyStyle={list ? { flexDirection: "row", alignItems: "center", minHeight: density.row[format], paddingHorizontal: space.xs, paddingVertical: space.xs, gap: space.md }
                : { gap: space.sm, paddingBottom: space.xs }}>
              <View style={[previewStyle, { alignItems: "center", justifyContent: "center", overflow: "hidden" }, !list && !folder ? { borderWidth: 1, borderColor: color.lineStrong } : null]}>
                {art}
                {tint && (list || !folder) ? <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: space.xs, backgroundColor: tint }} /> : null}
                {emoji ? <View style={[theme.surface("raised", "xs"), { position: "absolute", bottom: list ? 0 : space.xs, right: list ? 0 : space.xs, paddingHorizontal: space.xs }]}>
                  <Text variant="caption">{emoji}</Text>
                </View> : null}
              </View>
              <View style={list ? { flex: 1, minWidth: 0 } : { gap: space.xs, paddingHorizontal: space.xs }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.xs }}>
                  <Text variant="label" numberOfLines={list ? 1 : 2} style={{ flex: 1, minWidth: 0 }}>{title}</Text>
                  {pinned ? <Icon name="pin" size={13} color={color.accent.ink} /> : null}
                </View>
                <Text variant="caption" tone="soft" numberOfLines={1} style={list ? undefined : { paddingRight: 38 }}>{detail}</Text>
              </View>
            </Press>
          )}
        </ContextArea>
      </View>
      {reorder ? <>
        <IconButton icon="chevronUp" size="small" label={`Move ${title} up`} disabled={!reorder.up} onPress={reorder.up} />
        <IconButton icon="chevronDown" size="small" label={`Move ${title} down`} disabled={!reorder.down} onPress={reorder.down} />
      </> : (
        <View ref={anchor} collapsable={false} style={list ? undefined : { position: "absolute", right: 0, bottom: -space.xs }}>
          <IconButton icon="more" size="small" label={`Options for ${title}`} expanded={open} onPress={() => setOpen(true)} />
        </View>
      )}
      <Menu open={open} anchor={anchor} onClose={() => setOpen(false)} items={menu} label={title} />
    </View>
  );
}
