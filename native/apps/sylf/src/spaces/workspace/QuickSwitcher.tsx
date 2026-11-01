// Type to open a tool or go to a window (master plan §3.3). It searches what Workspace already knows and nothing else, so it needs
// no index and no backend. Enter takes the first match.
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Dialog, ListRow, TextField, useNotice, useTheme } from "@sylf/design-system";
import { TOOLS, TOOL_IDS, windowTitle, type WorkspaceModel, type WorkspaceState } from "@sylf/spaces";
import { TOOL_ICONS } from "./icons";

export function QuickSwitcher({ open, onClose, state, model }: { open: boolean; onClose: () => void; state: WorkspaceState; model: WorkspaceModel }) {
  const { space } = useTheme();
  const notice = useNotice();
  const [query, setQuery] = useState("");
  const choices = useMemo(() => {
    const windows = state.windows.map((window) => ({ key: window.id, title: windowTitle(state, window), detail: window.minimized ? "Minimized" : "Open window", icon: TOOL_ICONS[window.tool], run: () => model.restore(window.id) }));
    const tools = TOOL_IDS.filter((tool) => TOOLS[tool].multiple || !state.windows.some((window) => window.tool === tool)).map((tool) => ({ key: tool, title: `New ${TOOLS[tool].label}`, detail: "Tool", icon: TOOL_ICONS[tool], run: () => { if (!model.open(tool)) notice("The Workspace is full. Close a window first."); } }));
    return [...windows, ...tools];
  }, [state, model, notice]);
  const needle = query.trim().toLowerCase();
  const shown = needle ? choices.filter((choice) => choice.title.toLowerCase().includes(needle)) : choices;
  const close = () => { onClose(); setQuery(""); };
  const choose = (run: () => void) => { close(); run(); };
  return (
    <Dialog open={open} onClose={close} title="Open or switch" actions={[{ label: "Close", onPress: close }]}>
      <View testID="quick-switcher" style={{ gap: space.sm, minWidth: 320 }}>
        <TextField label="Search tools and windows" hideLabel placeholder="Type a tool or window" autoFocus value={query} onChangeText={setQuery} onSubmitEditing={() => { if (shown[0]) choose(shown[0].run); }} />
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }}>
          {shown.map((choice) => <ListRow key={choice.key} title={choice.title} detail={choice.detail} icon={choice.icon} onPress={() => choose(choice.run)} />)}
        </ScrollView>
      </View>
    </Dialog>
  );
}
