// Managing many windows at once: choose tools to open together, choose open windows to close, minimize or put in full screen,
// or clear the canvas. Documents live in their own stores, so closing a window never loses work.
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, Checkbox, Dialog, Icon, Press, Sheet, Text, useNotice, useTheme, useWindowClass } from "@sylf/design-system";
import { MAX_WINDOWS, TOOLS, LAUNCHER_TOOLS, windowTitle, type ToolId, type WorkspaceModel, type WorkspaceState } from "@sylf/spaces";
import { TOOL_ICONS } from "./icons";

export function WindowsSheet({ open, onClose, state, model }: { open: boolean; onClose(): void; state: WorkspaceState; model: WorkspaceModel }) {
  const { space, color, shape } = useTheme();
  const compact = useWindowClass().size === "compact";
  const notice = useNotice();
  const [tools, setTools] = useState<ToolId[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);
  useEffect(() => { if (open) { setTools([]); setChosen([]); } }, [open]);
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const room = MAX_WINDOWS - state.windows.length;

  const openChosen = () => {
    const opened = tools.slice(0, room).filter((tool) => model.open(tool)).length;
    if (opened < tools.length) notice("The Workspace is full. Some tools did not open.");
    onClose();
  };
  const act = (action: "close" | "minimize" | "fill") => {
    if (action === "close") chosen.forEach((id) => model.close(id));
    else if (action === "minimize") chosen.forEach((id) => model.minimize(id));
    else {
      // Full screen with just these: the rest step aside, minimized, and come back with "Back to my layout".
      state.windows.forEach((w) => { if (chosen.includes(w.id)) { if (w.minimized) model.restore(w.id); } else if (!w.minimized) model.minimize(w.id); });
      model.setLayout("fill");
    }
    onClose();
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Windows" width={440}
        footer={tools.length || chosen.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {tools.length ? <Button title={`Open ${tools.length}`} icon="plus" variant="emphasis" size="small" onPress={openChosen} /> : null}
            {chosen.length ? (
              <>
                <Button title="Full screen" icon="fit" size="small" onPress={() => act("fill")} />
                <Button title="Minimize" icon="minus" size="small" onPress={() => act("minimize")} />
                <Button title={`Close ${chosen.length}`} icon="close" variant="critical" size="small" onPress={() => act("close")} />
              </>
            ) : null}
          </View>
        ) : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.lg }} testID="workspace-windows-list">
          <View style={{ gap: space.xs }}>
            <Text variant="label" tone="soft">Open together</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {LAUNCHER_TOOLS.map((tool) => {
                const selected = tools.includes(tool);
                return (
                  <Press key={tool} label={`${TOOLS[tool].label}${selected ? ", chosen" : ""}`} selected={selected} onPress={() => setTools(toggle(tools, tool))}
                    style={{ width: compact ? "31%" : "23%" }} bodyStyle={{ alignItems: "center", gap: space.xs, paddingVertical: space.sm, borderRadius: shape.radius.md, borderWidth: 1, borderColor: selected ? color.accent.fill : color.line, backgroundColor: selected ? color.accent.wash : "transparent" }}>
                    <Icon name={TOOL_ICONS[tool]} color={selected ? color.accent.ink : color.inkSoft} />
                    <Text variant="caption" tone={selected ? "ink" : "soft"} align="center">{TOOLS[tool].label}</Text>
                  </Press>
                );
              })}
            </View>
          </View>
          <View style={{ gap: space.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text variant="label" tone="soft">On the canvas</Text>
              {state.windows.length ? <Press label={chosen.length === state.windows.length ? "Choose none" : "Choose all"} onPress={() => setChosen(chosen.length === state.windows.length ? [] : state.windows.map((w) => w.id))} bodyStyle={{ paddingHorizontal: space.sm, paddingVertical: 4 }}><Text variant="caption" tone="accent">{chosen.length === state.windows.length ? "None" : "All"}</Text></Press> : null}
            </View>
            {state.windows.length ? state.windows.map((window) => (
              <View key={window.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Icon name={TOOL_ICONS[window.tool]} size={18} color={color.inkSoft} />
                <View style={{ flex: 1 }}><Checkbox value={chosen.includes(window.id)} onChange={() => setChosen(toggle(chosen, window.id))} label={`${windowTitle(state, window)}${window.minimized ? " (minimized)" : ""}`} /></View>
              </View>
            )) : <Text variant="small" tone="faint">No windows open.</Text>}
          </View>
          {state.windows.length ? <Button title="Clear workspace" icon="trash" variant="critical" onPress={() => setClearing(true)} /> : null}
        </ScrollView>
      </Sheet>
      <Dialog open={clearing} onClose={() => setClearing(false)} title="Clear the Workspace?" message="Every window closes. Your notes, PDFs and boards are kept, and saved layouts stay."
        actions={[{ label: "Cancel", onPress: () => setClearing(false) }, { label: "Clear", variant: "critical", onPress: () => { setClearing(false); model.clear(); onClose(); notice("Workspace cleared"); } }]} />
    </>
  );
}
