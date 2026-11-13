import { useMemo, useRef } from "react";
import { FlatList, View } from "react-native";
import { contrast, Icon, IconButton, Press, Text, useControlHeight, useTheme, type IconName, type ViewHandle } from "@sylf/design-system";
import type { Notebook } from "@sylf/notes";
import { useDropTarget } from "../drop";
import { folderRows, type LibraryPlace } from "./library-view";

interface Props {
  title?: string;
  allLabel: string;
  place: LibraryPlace;
  childrenByParent: ReadonlyMap<string, Notebook[]>;
  counts: ReadonlyMap<string, number>;
  allCount: number;
  folderCount: number;
  trashCount: number;
  importedCount?: number;
  expanded: ReadonlySet<string>;
  onToggle(id: string): void;
  onChoose(place: LibraryPlace): void;
  onDropDocument(document: string, folder: Notebook): void;
}

export function LibraryNavigation({ title, allLabel, place, childrenByParent, counts, allCount, folderCount, trashCount, importedCount, expanded, onToggle, onChoose, onDropDocument }: Props) {
  const { space, color } = useTheme();
  const rows = useMemo(() => folderRows(childrenByParent, expanded), [childrenByParent, expanded]);
  const header = (
    <View style={{ gap: space.xs, paddingBottom: space.xs }}>
      {title ? <Text variant="caption" tone="soft" style={{ paddingHorizontal: space.sm, marginBottom: space.xs }}>{title}</Text> : null}
      <NavigationRow title={allLabel} icon="notes" count={allCount} selected={"all" in place} onPress={() => onChoose({ all: true })} />
      {importedCount !== undefined ? <NavigationRow title="Imported PDFs" icon="fileImport" count={importedCount} selected={"imported" in place} onPress={() => onChoose({ imported: true })} /> : null}
      <NavigationRow title="Trash" icon="trash" count={trashCount} selected={"trash" in place} onPress={() => onChoose({ trash: true })} />
      <View style={{ height: 1, backgroundColor: color.line, marginVertical: space.sm, marginHorizontal: space.sm }} />
      <NavigationRow title="Folders" icon="folder" count={folderCount} selected={"folder" in place && place.folder === null} onPress={() => onChoose({ folder: null })} />
    </View>
  );
  return (
    <FlatList data={rows} keyExtractor={(row) => row.folder.id} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator
      ListHeaderComponent={header} contentContainerStyle={{ padding: space.sm, gap: space.hair }} testID="library-navigation"
      renderItem={({ item: { folder, depth, hasChildren } }) => (
        <FolderBranch folder={folder} depth={depth} count={counts.get(folder.id) ?? 0} expanded={expanded.has(folder.id)}
          selected={"folder" in place && place.folder === folder.id} onToggle={hasChildren ? () => onToggle(folder.id) : undefined}
          onPress={() => onChoose({ folder: folder.id })} onDropDocument={(id) => onDropDocument(id, folder)} />
      )} />
  );
}

function FolderBranch({ folder, depth, count, expanded, selected, onPress, onToggle, onDropDocument }: {
  folder: Notebook; depth: number; count: number; expanded: boolean; selected: boolean;
  onPress(): void; onToggle?(): void; onDropDocument(id: string): void;
}) {
  const { space } = useTheme();
  const slot = Math.round(useControlHeight() * 0.82);
  const target = useRef<ViewHandle>(null);
  useDropTarget(target, { onDocument: onDropDocument });
  return (
    <View ref={target} collapsable={false} style={{ marginLeft: Math.min(depth, 3) * space.sm, flexDirection: "row", alignItems: "center" }}>
      <View style={{ width: slot }}>
        {onToggle ? <IconButton icon={expanded ? "chevronDown" : "chevronRight"} size="small" label={`${expanded ? "Collapse" : "Expand"} ${folder.title}`}
          expanded={expanded} onPress={onToggle} /> : null}
      </View>
      <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
        <NavigationRow title={folder.title} label={`Browse ${folder.title}`} icon="folder" tint={folder.color} emoji={folder.icon} count={count} selected={selected} onPress={onPress} />
      </View>
    </View>
  );
}

function NavigationRow({ title, label = title, icon, tint, emoji, count, selected, onPress }: {
  title: string; label?: string; icon: IconName; tint?: string; emoji?: string | null; count: number; selected: boolean; onPress(): void;
}) {
  const { color, space, shape } = useTheme();
  const height = Math.max(useControlHeight(), 44);
  const bg = selected ? color.selected : color.raised;
  return (
    <Press label={label} hint={`${count}`} selected={selected} onPress={onPress} radius={shape.radius.sm}
      bodyStyle={{ minHeight: height, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, backgroundColor: selected ? bg : undefined }}>
      {emoji ? <Text variant="label">{emoji}</Text>
        : <Icon name={icon} size={17} color={tint && contrast(tint, bg) >= 3 ? tint : selected ? color.accent.ink : color.inkSoft} markColor={tint} />}
      <Text variant="label" style={{ flex: 1, minWidth: 0 }} numberOfLines={2} tone={selected ? "ink" : "soft"}>{title}</Text>
      <Text variant="micro" tone="soft">{count}</Text>
    </Press>
  );
}
