// What Notes, PDFs and Whiteboard windows share: a library until a document is chosen, then that document, with a slim header to go
// back, rename and see that it saved. A window keeps only a pointer to its document; the document itself lives in the Notes library.
import { useEffect, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Activity, Button, Dialog, EmptyState, Icon, IconButton, Menu, Press, Text, TextField, useNotice, useTheme, type MenuItem , type ViewHandle } from "@sylf/design-system";
import type { LibraryEntry, NoteKind, NotesLibrary, OpenDocument, SaveState } from "@sylf/notes";
import { adoptDeviceNotes, notesAreDurable, useDeviceNotesWaiting, useLibrarySnapshot, useNotesLibrary } from "../../../shell/notes/library";
import { isSeen, type ToolProps } from "../tools/shared";
import BoardCanvas from "./BoardCanvas";
import LibraryBrowser, { KIND_ICON } from "./LibraryBrowser";
import PagedInk from "./PagedInk";
import RichTextEditor from "./RichTextEditor";

/** Opens a document for as long as the window shows it, sharing the replica with any other window on it. */
export function useOpenDocument(library: NotesLibrary, id: string | null) {
  const [state, setState] = useState<{ id: string; document: OpenDocument | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!id) { setState(null); return; }
    let live = true, held: OpenDocument | null = null;
    setState({ id, document: null, error: null });
    library.open(id).then((document) => { if (live) { held = document; setState({ id, document, error: null }); } else document.release(); }, (error: unknown) => { if (live) setState({ id, document: null, error: error instanceof Error ? error.message : "This document could not be opened." }); });
    return () => { live = false; held?.release(); };
  }, [library, id]);
  return state?.id === id ? state : null;
}

function useSaveState(document: OpenDocument | null): SaveState {
  const [state, setState] = useState<SaveState>(document?.saveState() ?? "saved");
  useEffect(() => { if (!document) return; setState(document.saveState()); return document.subscribe(() => setState(document.saveState())); }, [document]);
  return state;
}

interface Props extends ToolProps { kinds: NoteKind[]; primary: NoteKind }

export default function DocumentTool({ window, lifecycle, patch, onProvenance, kinds, primary }: Props) {
  const { space, color } = useTheme();
  const notice = useNotice();
  const library = useNotesLibrary();
  const snapshot = useLibrarySnapshot(library);
  const id = typeof window.state.document === "string" ? window.state.document : null;
  const entry = id ? snapshot.entries.find((e) => e.id === id) : undefined;
  const opened = useOpenDocument(library, id && (entry || !snapshot.ready) ? id : null);
  const saving = useSaveState(opened?.document ?? null);
  const [width, setWidth] = useState(600);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const menuAnchor = useRef<ViewHandle>(null);
  const waiting = useDeviceNotesWaiting(library.owner);
  useEffect(() => { onProvenance(false); }, [onProvenance]);
  // The title bar names the document, and forgets a document that was deleted elsewhere.
  useEffect(() => {
    if (entry && window.state.title !== entry.title) patch({ title: entry.title });
    if (id && snapshot.ready && !entry) patch({ document: null, title: null });
  }, [entry?.title, id, snapshot.ready]);
  useEffect(() => { if (entry?.trashed) patch({ document: null, title: null }); }, [entry?.trashed]);

  const open = (next: LibraryEntry) => patch({ document: next.id, title: next.title, page: 0, bx: null, by: null, bz: null });
  const close = () => patch({ document: null, title: null });
  const editable = isSeen(lifecycle);

  if (!snapshot.ready && !snapshot.failure) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Activity label="Opening your notes" /></View>;

  if (!id || !entry) {
    return (
      <LibraryBrowser library={library} kinds={kinds} primary={primary} onOpen={open}
        footer={
          <>
            {waiting > 0 ? (
              <Press label="Move notes from this device into your account" onPress={() => void adoptDeviceNotes(library).then((n) => notice(`${n} ${n === 1 ? "note" : "notes"} moved into your account`), () => notice("They could not be moved. Try again."))} style={{ marginHorizontal: space.md, marginBottom: space.sm }} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm }}>
                <Icon name="layers" size={18} color={color.accent.ink} />
                <Text variant="small" style={{ flex: 1 }}>{waiting} {waiting === 1 ? "note" : "notes"} from before you signed in</Text>
                <Text variant="label" tone="accent">Move here</Text>
              </Press>
            ) : null}
            {notesAreDurable ? null : <Text variant="caption" tone="caution" style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>This browser cannot keep notes. They last until it closes.</Text>}
          </>
        } />
    );
  }

  const document = opened?.document;
  const kind = entry.kind;
  const items: MenuItem[] = [
    { key: "rename", label: "Rename", icon: "type", onSelect: () => setRenaming(entry.title) },
    { key: "pin", label: entry.pinned ? "Unpin" : "Pin to top", icon: "pin", onSelect: () => void library.pin(entry.id, !entry.pinned) },
    { key: "copy", label: "Duplicate", icon: "copy", onSelect: () => void library.duplicate(entry.id).then(() => notice("Duplicated")) },
    { key: "trash", label: "Move to trash", icon: "trash", destructive: true, onSelect: () => { void library.trash(entry.id).then(() => notice("Moved to trash")); close(); } },
  ];
  const narrow = width < 460;
  const home = snapshot.notebooks.find((n) => n.id === entry.notebookId)?.title ?? (primary === "pdf" ? "PDFs" : primary === "board" ? "Boards" : "Notes");

  return (
    <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.xs, paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: color.line }}>
        <Press label={`Back to ${home}`} onPress={close} feedback="surface" bodyStyle={{ flexDirection: "row", alignItems: "center", gap: 2, paddingRight: space.sm, paddingVertical: 4 }}>
          <Icon name="chevronLeft" size={16} color={color.inkSoft} />
          <Text variant="label" tone="soft" numberOfLines={1}>{home}</Text>
        </Press>
        <View style={{ flex: 1 }} />
        <Text variant="micro" tone={saving === "failed" ? "critical" : "faint"} aria-live="polite">{saving === "saving" ? "Saving" : saving === "failed" ? "Not saved" : "Saved"}</Text>
        <View ref={menuAnchor} collapsable={false}><IconButton icon="more" size="small" label="Document options" onPress={() => setMenu(true)} /></View>
      </View>
      {opened?.error ? (
        <View style={{ flex: 1, justifyContent: "center" }}><EmptyState icon="warning" title="This didn't open" message={opened.error} action={<Button title="Back to notes" size="small" onPress={close} />} /></View>
      ) : !document ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Activity label="Opening" /></View>
      ) : kind === "note" ? (
        <RichTextEditor key={document.id} document={document} editable={editable} narrow={narrow} />
      ) : kind === "board" ? (
        <BoardCanvas key={document.id} document={document} editable={editable}
          camera={typeof window.state.bz === "number" ? { x: Number(window.state.bx), y: Number(window.state.by), zoom: window.state.bz } : null}
          onCamera={(c) => patch({ bx: Math.round(c.x), by: Math.round(c.y), bz: Math.round(c.zoom * 1000) / 1000 })} />
      ) : (
        <PagedInk key={document.id} library={library} document={document} pdf={kind === "pdf"} editable={editable}
          initialPage={typeof window.state.page === "number" ? window.state.page : 0} onPage={(page) => { if (page !== window.state.page) patch({ page }); }} />
      )}
      <Menu open={menu} anchor={menuAnchor } onClose={() => setMenu(false)} items={items} label="Document" side="bottom" />
      <Dialog open={renaming !== null} onClose={() => setRenaming(null)} title="Rename" actions={[{ label: "Cancel", onPress: () => setRenaming(null) }, { label: "Save", variant: "emphasis", onPress: () => { if (renaming?.trim()) void library.rename(entry.id, renaming); setRenaming(null); } }]}>
        <TextField label="Name" hideLabel autoFocus value={renaming ?? ""} onChangeText={setRenaming} onSubmitEditing={() => { if (renaming?.trim()) void library.rename(entry.id, renaming); setRenaming(null); }} />
      </Dialog>
    </View>
  );
}
