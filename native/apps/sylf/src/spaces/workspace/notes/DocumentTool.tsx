// Notes, PDFs and Whiteboards share a library and the navigation around each document. A window keeps only a pointer to its document.
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Activity, Button, DOCUMENT_DEFAULTS, Dialog, EmptyState, Icon, IconButton, Press, Text, TextField, Tooltip, useControlHeight, useNotice, useTheme, type MenuItem } from "@sylf/design-system";
import type { LibraryEntry, NoteKind, NotesLibrary, OpenDocument, SaveState } from "@sylf/notes";
import { adoptDeviceNotes, notesAreDurable, useDeviceNotesWaiting, useLibrarySnapshot, useNotesLibrary } from "../../../shell/notes/library";
import { isSeen, type ToolProps } from "../tools/shared";
import BoardCanvas from "./BoardCanvas";
import LibraryBrowser, { KIND_ICON, type LibraryLocation } from "./LibraryBrowser";
import DocumentActions, { type DocumentActionsProps } from "./DocumentActions";
import { ToolbarRow } from "./FormatBar";
import PagedInk from "./PagedInk";
import NoteEditor from "./NoteEditor";
import { isLayeredNote } from "@sylf/notes";
import { detectCapabilities } from "@sylf/platform";

const stylusDevice = (() => { try { return detectCapabilities().input.stylus === true; } catch { return false; } })();
import { openBeside, openDocumentWindow } from "./open-window";
import { useWorkspaceModel, useWorkspaceState } from "../../../shell/context";
import { LIVE_EDITORS } from "./editor-budget";
import { useNoteStyle } from "./note-style";

// BlockNote and ProseMirror are large: they load with the first typed note, never with the app.
const RichTextEditor = lazy(() => import("./RichTextEditor"));

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

export default function DocumentTool({ window, lifecycle, patch, kinds, primary }: Props) {
  const { space, color } = useTheme();
  const control = Math.round(useControlHeight() * 0.82);
  const notice = useNotice();
  const library = useNotesLibrary();
  const model = useWorkspaceModel();
  const snapshot = useLibrarySnapshot(library);
  const id = typeof window.state.document === "string" ? window.state.document : null;
  const entry = id ? snapshot.entries.find((e) => e.id === id) : undefined;
  const opened = useOpenDocument(library, id && (entry ? !entry.trashed : !snapshot.ready) ? id : null);
  const saving = useSaveState(opened?.document ?? null);
  const [width, setWidth] = useState(600);
  const [location, setLocation] = useState<LibraryLocation | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const waiting = useDeviceNotesWaiting(library.owner);
  // A note opens in the mode the note style asks for; the window remembers a switch only for the note it was made on.
  const open = (next: LibraryEntry) => patch({ document: next.id, title: next.title, page: 0, bx: null, by: null, bz: null, mode: null });
  const opensIn = useNoteStyle().opensIn;
  const close = () => {
    if (!location && entry?.notebookId) setLocation({ place: { folder: entry.notebookId }, query: "" });
    if (window.state.bare === true && model.state().layout === "fill") model.setLayout("free");
    patch({ document: null, title: null, bare: false });
  };
  // The title bar follows the library, including a rename or removal in another window.
  useEffect(() => {
    if (id && snapshot.ready && (!entry || entry.trashed)) close();
    else if (entry && window.state.title !== entry.title) patch({ title: entry.title });
  }, [entry?.title, entry?.trashed, id, snapshot.ready]);
  const editable = isSeen(lifecycle);
  const workspace = useWorkspaceState();
  useEffect(() => {
    if (window.state.bare !== true || (id && workspace.layout === "fill")) return;
    if (workspace.layout === "fill") model.setLayout("free");
    patch({ bare: false });
  }, [id, window.state.bare, workspace.layout]);
  // The most recently used typed notes keep a running editor; the others show their text, and a touch brings one back.
  const liveEditor = useMemo(() => workspace.recent.filter((wid) => {
    const w = workspace.windows.find((item) => item.id === wid);
    return w && !w.minimized && typeof w.state.document === "string" && snapshot.entries.find((e) => e.id === w.state.document)?.kind === "note";
  }).slice(0, LIVE_EDITORS).includes(window.id), [workspace.recent, workspace.windows, snapshot.entries, window.id]);

  if (!snapshot.ready && !snapshot.failure) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Activity label="Opening your notes" /></View>;

  if (!id || !entry || entry.trashed) {
    return (
      <LibraryBrowser library={library} kinds={kinds} primary={primary} location={location} onLocation={setLocation} onOpen={open} onOpenNew={(next) => { if (!openDocumentWindow(model, next, null, false)) notice("The Workspace is full. Close a window first."); }}
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
  const companion = snapshot.entries.find((e) => !e.trashed && (e.id === entry.linkedTo || e.linkedTo === entry.id));
  const showBeside = (next: LibraryEntry) => {
    const current = model.state();
    if (current.layout === "fill" && current.windows.find((item) => item.id === window.id)?.state.bare === true) {
      patch({ bare: false });
      model.setLayout("free");
    }
    if (!openBeside(model, window.id, next)) notice("The Workspace is full. Close a window first.");
  };
  const notesBeside = async () => {
    try {
      const existing = snapshot.entries.find((e) => e.linkedTo === entry.id && !e.trashed);
      const id = existing?.id ?? (await library.create({ kind: "note", title: `${entry.title} notes`, notebookId: entry.notebookId, template: "lecture", linkedTo: entry.id }));
      const next = library.getSnapshot().entries.find((e) => e.id === id);
      if (next) showBeside(next);
    } catch (error) { notice(error instanceof Error ? error.message : "The note could not be made."); }
  };
  const update = (task: Promise<unknown>, message?: string) => {
    void task.then(() => { if (message) notice(message); }, (error: unknown) => {
      notice(error instanceof Error ? error.message : "This change could not be saved.");
    });
  };
  const items: MenuItem[] = [
    ...(companion ? [{
      key: "companion", label: `Open ${companion.title} beside`, icon: KIND_ICON[companion.kind],
      onSelect: () => showBeside(companion),
    }] : kind !== "note" ? [{ key: "beside", label: "Take notes beside this", icon: "split" as const, onSelect: () => void notesBeside() }] : []),
    { key: "rename", label: "Rename", icon: "type", onSelect: () => setRenaming(entry.title) },
    { key: "pin", label: entry.pinned ? "Unpin" : "Pin to top", icon: "pin", onSelect: () => update(library.pin(entry.id, !entry.pinned)) },
    { key: "copy", label: "Duplicate", icon: "copy", onSelect: () => update(library.duplicate(entry.id), "Duplicated") },
    { key: "trash", label: "Move to trash", icon: "trash", destructive: true, onSelect: () => update(library.trash(entry.id), "Moved to trash") },
  ];
  const compact = width < control * 11 + 92;
  const compactInk = width < control * 16 + 100;
  const layered = !!document && kind === "note" && isLayeredNote(document.descriptor());
  const showsEditor = !!document && (layered || editable && (kind !== "note" || liveEditor));
  const pageOnly = window.state.bare === true && workspace.layout === "fill";
  const toolbarHoldsFullScreen = !!document && (kind !== "note" || layered);
  const togglePageOnly = () => {
    if (pageOnly) { patch({ bare: false }); model.setLayout("free"); return; }
    // Take a fresh snapshot of the Canvas, including windows opened since entering a layout.
    if (workspace.layout !== "free") model.setLayout("free");
    const note = model.state().windows.find((item) => item.id === window.id);
    if (note?.minimized) model.restore(window.id);
    else model.focus(window.id);
    patch({ bare: true });
    model.setLayout("fill");
    for (const other of model.state().windows) {
      if (other.id !== window.id && !other.minimized) model.minimize(other.id);
    }
  };
  const actions: DocumentActionsProps = {
    saving,
    items,
    fullScreen: toolbarHoldsFullScreen ? { active: pageOnly, toggle: togglePageOnly }
      : workspace.layout !== "fill" ? { active: false, toggle: () => { model.focus(window.id); model.setLayout("fill"); } } : undefined,
  };
  const browseFolder = location ? ("folder" in location.place ? location.place.folder : null) : entry.notebookId;
  const home = location?.query.trim() ? "search results" : location && "imported" in location.place ? "Imported PDFs" : snapshot.notebooks.find((n) => n.id === browseFolder)?.title ?? (primary === "pdf" ? "PDFs" : primary === "board" ? "Whiteboards" : "Notes");
  const back = pageOnly ? null : (
    <Tooltip text={`Back to ${home}`}>
      {(tooltip) => <IconButton {...tooltip} icon="chevronLeft" size="small" label={`Back to ${home}`} testID="document-back" onPress={close} />}
    </Tooltip>
  );
  const end = <DocumentActions {...actions} compact={compact} showStatus={width >= control * 15 + 165 && !pageOnly} />;

  return (
    <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {showsEditor ? null : <ToolbarRow start={back} end={end} />}
      {opened?.error ? (
        <View style={{ flex: 1, justifyContent: "center" }}><EmptyState icon="warning" title="This didn't open" message={opened.error} action={<Button title="Back to notes" size="small" onPress={close} />} /></View>
      ) : !document ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Activity label="Opening" /></View>
      ) : layered ? (
        <NoteEditor key={document.id} library={library} document={document} editable={editable} width={width} navigation={back} actions={actions}
          mode={window.state.mode === "type" || window.state.mode === "write" ? window.state.mode : opensIn !== "auto" ? opensIn : stylusDevice ? "write" : "type"} onMode={(mode) => patch({ mode })}
          initialPage={typeof window.state.page === "number" ? window.state.page : 0} onPage={(page) => { if (page !== window.state.page) patch({ page }); }} />
      ) : kind === "note" && !liveEditor ? (
        <Press label="Edit this note" onPress={() => model.focus(window.id)} feedback="none" style={{ flex: 1 }} bodyStyle={{ flex: 1, backgroundColor: DOCUMENT_DEFAULTS.paper, padding: space.xl }}>
          <Text variant="body" style={{ color: DOCUMENT_DEFAULTS.ink, lineHeight: 24 }} numberOfLines={30}>{entry.text || entry.preview || " "}</Text>
        </Press>
      ) : kind === "note" ? (
        <Suspense fallback={<View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: DOCUMENT_DEFAULTS.paper }}><Activity label="Opening the editor" /></View>}>
          <RichTextEditor key={document.id} document={document} editable={editable} compact={compact} leading={back} end={end} />
        </Suspense>
      ) : kind === "board" ? (
        <BoardCanvas key={document.id} document={document} editable={editable} compact={compactInk} compactUndo={!compact} leading={back} corner={end}
          camera={typeof window.state.bz === "number" ? { x: Number(window.state.bx), y: Number(window.state.by), zoom: window.state.bz } : null}
          onCamera={(c) => patch({ bx: Math.round(c.x), by: Math.round(c.y), bz: Math.round(c.zoom * 1000) / 1000 })} />
      ) : (
        <PagedInk key={document.id} library={library} document={document} pdf={kind === "pdf"} editable={editable} compact={compactInk} compactUndo={!compact} leading={back} corner={end}
          initialPage={typeof window.state.page === "number" ? window.state.page : 0} onPage={(page) => { if (page !== window.state.page) patch({ page }); }} />
      )}
      <Dialog open={renaming !== null} onClose={() => setRenaming(null)} title="Rename" actions={[{ label: "Cancel", onPress: () => setRenaming(null) }, { label: "Save", variant: "emphasis", onPress: () => { if (renaming?.trim()) update(library.rename(entry.id, renaming)); setRenaming(null); } }]}>
        <TextField label="Name" hideLabel autoFocus value={renaming ?? ""} onChangeText={setRenaming} onSubmitEditing={() => { if (renaming?.trim()) update(library.rename(entry.id, renaming)); setRenaming(null); }} />
      </Dialog>
    </View>
  );
}
