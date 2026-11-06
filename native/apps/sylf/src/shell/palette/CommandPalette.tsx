// The command palette's window: type to find a note, a tool, a window, a place or an action, and Enter runs the first. Arrow keys
// move through the list; on touch, a tap runs a row. Loaded the first time it opens, so it costs start-up nothing.
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Platform, ScrollView, TextInput, View } from "react-native";
import { Dialog, Icon, Press, Spotlight, Text, useNotice, useTheme, type IconName } from "@sylf/design-system";
import type { LibraryEntry, NoteKind } from "@sylf/notes";
import { HOME_DESTINATIONS, HOME_LABELS, LAYOUT_LABELS, SPACE_LABELS, TOOLS, LAUNCHER_TOOLS, windowTitle, type HomeDestination, type ToolId, type WorkspaceLayout } from "@sylf/spaces";
import { useAccountEntry, useHomeNavigation, useSessionState, useSpacesStore, useStudySession, useWorkspaceModel, useWorkspaceState } from "../context";
import { focusEnvironment } from "../focus/environment";
import { useLibrarySnapshot, useNotesLibrary } from "../notes/library";
import { TOOL_ICONS } from "../../spaces/workspace/icons";
import { openDocumentWindow } from "../../spaces/workspace/notes/open-window";
import { createOptions, noteStyle } from "../../spaces/workspace/notes/note-style";
import { commandPalette, rankCommands, type Command } from "./palette";

const KIND: Record<NoteKind, { label: string; icon: "notes" | "pdf" | "whiteboard" }> = { note: { label: "Note", icon: "notes" }, handwriting: { label: "Note", icon: "notes" }, pdf: { label: "PDF", icon: "pdf" }, board: { label: "Whiteboard", icon: "whiteboard" } };
const HOME_ICONS: Record<HomeDestination, IconName> = { today: "today", plan: "calendar", focus: "focus", circle: "circle", progress: "progress" };
const TOOL_WORDS: Partial<Record<ToolId, string[]>> = { calculator: ["maths", "sum"], timer: ["stopwatch", "countdown"], audio: ["music", "sound", "ambience"], sylvie: ["assistant", "ai", "help"], resources: ["shelf", "library", "files"], notes: ["notebook", "write"], pdfs: ["paper", "document"], whiteboard: ["board", "draw", "sketch"] };
const mac = Platform.OS === "web" && typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

function ago(time: number) {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export default function CommandPalette({ open }: { open: boolean }) {
  const { space, color, shape } = useTheme();
  const notice = useNotice();
  const store = useSpacesStore();
  const navigation = useHomeNavigation();
  const model = useWorkspaceModel();
  const workspace = useWorkspaceState();
  const session = useStudySession();
  const sessionState = useSessionState();
  const account = useAccountEntry();
  const library = useNotesLibrary();
  const snapshot = useLibrarySnapshot(library);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [clearing, setClearing] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  const rows = useRef(new Map<number, { y: number; height: number }>());
  const viewport = useRef({ y: 0, height: 0 });

  useEffect(() => { if (open) { setQuery(""); setActive(0); const t = setTimeout(() => input.current?.focus(), 60); return () => clearTimeout(t); } }, [open]);

  const commands = useMemo<Command[]>(() => {
    const spaces = store.available();
    const hasWorkspace = spaces.includes("workspace");
    const toWorkspace = () => store.select("workspace");
    const studying = sessionState.active?.subjectId ?? sessionState.plan?.subjectId ?? null;
    const openEntry = (entry: Pick<LibraryEntry, "id" | "kind" | "title">) => { toWorkspace(); if (!openDocumentWindow(model, entry, null)) notice("The Workspace is full. Close a window first."); };
    // New notes and boards take the note style set behind the Notes library's gear.
    const create = async (kind: "note" | "board", flow?: "endless") => {
      try {
        const style = noteStyle.get();
        const id = await library.create({ ...createOptions(kind, flow ? { ...style, flow } : style, undefined), subjectId: studying == null ? null : String(studying) });
        const entry = library.getSnapshot().entries.find((e) => e.id === id);
        if (entry) openEntry(entry);
      } catch (error) { notice(error instanceof Error ? error.message : "That could not be created."); }
    };
    const importPdf = async () => {
      try {
        // pdf.js loads with the first PDF, never with the palette.
        const { importPdfFile } = await import("../../spaces/workspace/notes/pdf-import");
        const id = await importPdfFile(library, null, studying == null ? null : String(studying));
        const entry = id ? library.getSnapshot().entries.find((e) => e.id === id) : null;
        if (entry) openEntry(entry);
      } catch (error) { notice(error instanceof Error ? error.message : "That PDF could not be added."); }
    };
    const out: Command[] = [];

    // Notes, PDFs and boards: the newest are suggested before anything is typed.
    const entries = snapshot.entries.filter((e) => !e.trashed).sort((a, b) => b.updated - a.updated);
    if (hasWorkspace) entries.forEach((entry, index) => out.push({ id: `doc:${entry.id}`, title: entry.title, detail: `${KIND[entry.kind].label} · ${ago(entry.updated)}`, icon: KIND[entry.kind].icon, group: "Notes", keywords: [KIND[entry.kind].label, (entry.text || entry.preview || "").slice(0, 400)], suggested: index < 3, run: () => openEntry(entry) }));

    if (hasWorkspace) {
      out.push(
        { id: "new:note", title: "New note", detail: "In your note style", icon: "notes", group: "Create", keywords: ["create", "page", "handwriting", "typing"], suggested: true, run: () => void create("note") },
        { id: "new:note-endless", title: "New endless note", detail: "One page that grows as you write", icon: "notes", group: "Create", keywords: ["create", "infinite", "scroll", "continuous"], run: () => void create("note", "endless") },
        { id: "new:board", title: "New whiteboard", icon: "whiteboard", group: "Create", keywords: ["create", "board", "draw", "sketch"], run: () => void create("board") },
        { id: "new:pdf", title: "Import a PDF", icon: "pdf", group: "Create", keywords: ["add", "open", "paper", "file"], run: () => void importPdf() },
      );
    }

    // Places.
    for (const id of spaces) out.push({ id: `space:${id}`, title: SPACE_LABELS[id], detail: "Space", icon: id === "home" ? "home" : id === "workspace" ? "workspace" : "world", group: "Go to", keywords: ["space", "switch"], run: () => store.select(id) });
    for (const destination of HOME_DESTINATIONS) out.push({ id: `home:${destination}`, title: HOME_LABELS[destination], detail: "Home", icon: HOME_ICONS[destination], group: "Go to", keywords: ["home", "page"], run: () => { navigation.select(destination); store.select("home"); } });
    out.push({ id: "focus-environment", title: "Focus environment", detail: "Full-screen timer and backgrounds", icon: "focus", group: "Go to", keywords: ["focus", "zen", "background", "immersive"], run: () => focusEnvironment.open() });
    if (account) out.push({ id: "account", title: "Account", detail: "Profile, devices and privacy", icon: "lock", group: "Go to", keywords: ["profile", "settings", "sign", "password", "privacy"], run: () => account.open() });

    // The study session.
    const status = session.status();
    if (status === "idle" || status === "finished") out.push({ id: "session:start", title: "Start a study session", icon: "play", group: "Session", keywords: ["begin", "timer", "study", "focus"], suggested: true, run: () => { if (!session.start()) notice("A session is already running."); } });
    if (status === "running") out.push({ id: "session:pause", title: "Pause the session", icon: "pause", group: "Session", keywords: ["timer", "break", "stop"], suggested: true, run: () => session.pause() });
    if (status === "paused") out.push({ id: "session:resume", title: "Resume the session", icon: "play", group: "Session", keywords: ["timer", "continue"], suggested: true, run: () => session.resume() });

    if (hasWorkspace) {
      // Tools, then the windows already open.
      for (const tool of LAUNCHER_TOOLS) out.push({ id: `tool:${tool}`, title: TOOLS[tool].label, detail: "Tool", icon: TOOL_ICONS[tool], group: "Tools", keywords: ["open", "tool", ...(TOOL_WORDS[tool] ?? [])], run: () => { toWorkspace(); model.summon(tool); } });
      for (const window of workspace.windows) out.push({ id: `window:${window.id}`, title: windowTitle(workspace, window), detail: window.minimized ? "Minimized window" : "Open window", icon: TOOL_ICONS[window.tool], group: "Windows", keywords: ["window", "switch", TOOLS[window.tool].label], run: () => { toWorkspace(); if (window.minimized) model.restore(window.id); model.focus(window.id); model.reveal(window.id); } });
      // Arrangements.
      const visible = workspace.windows.some((w) => !w.minimized);
      for (const layout of ["fill", "split", "focus", "assistant", "free"] as WorkspaceLayout[]) {
        if (layout === workspace.layout || (layout === "fill" && !visible)) continue;
        out.push({ id: `layout:${layout}`, title: layout === "fill" ? "Full screen" : layout === "free" ? "Free canvas" : `${LAYOUT_LABELS[layout]} layout`, detail: "Workspace", icon: layout === "fill" ? "fit" : layout === "split" ? "split" : layout === "free" ? "expand" : "layers", group: "Layouts", keywords: ["layout", "arrange", layout === "fill" ? "fullscreen maximise maximize" : ""], run: () => { toWorkspace(); model.setLayout(layout); } });
      }
      for (const saved of workspace.layouts) out.push({ id: `saved:${saved.id}`, title: saved.name, detail: "Saved layout", icon: "bookmark", group: "Layouts", keywords: ["layout", "saved", "restore"], run: () => { toWorkspace(); model.applySavedLayout(saved.id); } });
      if (visible) out.push({ id: "fit", title: "Show every window", detail: "Workspace", icon: "fit", group: "Workspace", keywords: ["fit", "zoom", "overview"], run: () => { toWorkspace(); model.fit(); } });
      if (workspace.windows.length) out.push({ id: "clear", title: "Close all windows", detail: "Clear the Workspace; documents are kept", icon: "trash", group: "Workspace", keywords: ["clear", "wipe", "reset", "close", "empty"], run: () => setClearing(true) });
    }
    return out;
  }, [store, navigation, model, workspace, session, sessionState, account, library, snapshot.entries, notice]);

  const shown = useMemo(() => rankCommands(commands, query), [commands, query]);
  useEffect(() => { setActive(0); }, [query]);
  const close = () => commandPalette.close();
  const run = (command: Command | undefined) => {
    if (!command) return;
    // The palette steps away first, so whatever the command opens takes the focus.
    if (command.id !== "clear") close();
    command.run();
  };
  const step = (by: number) => {
    if (!shown.length) return;
    const next = (active + by + shown.length) % shown.length;
    setActive(next);
    const row = rows.current.get(next), view = viewport.current;
    if (row && (row.y < view.y || row.y + row.height > view.y + view.height)) list.current?.scrollTo({ y: Math.max(0, row.y < view.y ? row.y - 8 : row.y + row.height - view.height + 8), animated: false });
  };

  let lastGroup: string | null = null;
  return (
    <>
      <Spotlight open={open} onClose={close} label="Search Sylf">
        <View testID="command-palette">
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, height: 60, borderBottomWidth: 1, borderBottomColor: color.line }}>
            <Icon name="search" size={22} color={color.inkSoft} />
            <TextInput ref={input} value={query} onChangeText={setQuery} placeholder="Search notes, tools, places and actions" placeholderTextColor={color.inkFaint} accessibilityLabel="Search Sylf"
              autoCorrect={false} autoCapitalize="none" returnKeyType="go" blurOnSubmit={false} onSubmitEditing={() => run(shown[active])}
              onKeyPress={(event) => { const key = event.nativeEvent.key; if (key === "ArrowDown" || key === "ArrowUp") { (event as unknown as { preventDefault?: () => void }).preventDefault?.(); step(key === "ArrowDown" ? 1 : -1); } }}
              style={[{ flex: 1, fontSize: 19, color: color.ink, paddingVertical: 0 }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]} />
            {query ? <Press label="Clear the search" onPress={() => { setQuery(""); input.current?.focus(); }} feedback="none" bodyStyle={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: color.sunken }}><Icon name="close" size={14} color={color.inkSoft} /></Press> : null}
          </View>
          <ScrollView ref={list} keyboardShouldPersistTaps="handled" style={{ maxHeight: 440 }} contentContainerStyle={{ padding: space.sm }}
            onLayout={(e) => { viewport.current.height = e.nativeEvent.layout.height; }} onScroll={(e) => { viewport.current.y = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}>
            {shown.length ? shown.map((command, index) => {
              const header = command.group !== lastGroup ? command.group : null;
              lastGroup = command.group;
              const selected = index === active;
              return (
                <View key={command.id} onLayout={(e) => rows.current.set(index, { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height })}>
                  {header ? <Text variant="micro" tone="faint" style={{ paddingHorizontal: space.sm, paddingTop: index ? space.md : space.xs, paddingBottom: space.xs, textTransform: "uppercase", letterSpacing: 0.8 }}>{header}</Text> : null}
                  <Press label={command.detail ? `${command.title}, ${command.detail}` : command.title} selected={selected} feedback="none" testID={`palette-${command.id}`}
                    onHover={(hovering) => { if (hovering) setActive(index); }} onPress={() => run(command)}
                    bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.sm, paddingVertical: 7, borderRadius: shape.radius.md, backgroundColor: selected ? color.accent.wash : "transparent" }}>
                    <View style={{ width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: selected ? color.accent.fill : color.sunken }}>
                      <Icon name={command.icon} size={17} color={selected ? color.accent.on : color.inkSoft} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="label" numberOfLines={1}>{command.title}</Text>
                      {command.detail ? <Text variant="caption" tone="soft" numberOfLines={1}>{command.detail}</Text> : null}
                    </View>
                    {selected && Platform.OS === "web" ? <Text variant="caption" tone="faint">↵</Text> : null}
                  </Press>
                </View>
              );
            }) : (
              <View style={{ alignItems: "center", paddingVertical: space.xl, gap: space.xs }}>
                <Text variant="label" tone="soft">Nothing matches</Text>
                <Text variant="caption" tone="faint">Try a note's title, a tool or a place.</Text>
              </View>
            )}
          </ScrollView>
          {Platform.OS === "web" ? (
            <View style={{ flexDirection: "row", gap: space.lg, paddingHorizontal: space.lg, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: color.line }}>
              <Text variant="micro" tone="faint">↑↓ move</Text>
              <Text variant="micro" tone="faint">↵ open</Text>
              <Text variant="micro" tone="faint">esc close</Text>
              <View style={{ flex: 1 }} />
              <Text variant="micro" tone="faint">{mac ? "⌘K" : "Ctrl K"} anywhere</Text>
            </View>
          ) : null}
        </View>
      </Spotlight>
      <Dialog open={clearing} onClose={() => setClearing(false)} title="Close all windows?" message="Your notes, PDFs and boards are kept, and saved layouts stay."
        actions={[{ label: "Cancel", onPress: () => setClearing(false) }, { label: "Close all", variant: "critical", onPress: () => { setClearing(false); close(); model.clear(); notice("Workspace cleared"); } }]} />
    </>
  );
}
