// A document's name in its window's title bar, renamed where it is read: a tap on the name of a focused window edits it, and Enter
// or leaving the field keeps it. The library owns the name; the window's title follows it.
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Platform, TextInput } from "react-native";
import { Press, Text, useTheme } from "@sylf/design-system";
import { useNotesLibrary } from "../../../shell/notes/library";

export function EditableTitle({ documentId, title, focused }: { documentId: string; title: string; focused: boolean }) {
  const { color, type } = useTheme();
  const library = useNotesLibrary();
  const [editing, setEditing] = useState<string | null>(null);
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  // The whole name is selected when the field opens, so typing replaces it.
  const opened = editing !== null;
  useEffect(() => {
    if (!opened) return;
    const timer = setTimeout(() => {
      const input = field.current;
      input?.focus();
      if (Platform.OS === "web") (input as unknown as HTMLInputElement | null)?.select?.();
      else input?.setSelection?.(0, title.length);
    }, 30);
    return () => clearTimeout(timer);
  }, [opened]);
  const commit = () => {
    const next = editing?.trim();
    setEditing(null);
    if (next && next !== title) void library.rename(documentId, next);
  };
  if (editing !== null) {
    return (
      <TextInput ref={field} value={editing} onChangeText={setEditing} onSubmitEditing={commit} onBlur={commit} autoFocus selectTextOnFocus returnKeyType="done" accessibilityLabel="Name" testID="window-title-input"
        style={[{ flexShrink: 1, minWidth: 120, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6, backgroundColor: color.sunken, color: color.ink, fontSize: type.small.fontSize, fontFamily: type.small.fontFamily }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]} />
    );
  }
  return (
    <Press label={`${title}, rename`} hint="Tap to rename" disabled={!focused} onPress={() => setEditing(title)} feedback="none" style={{ flexShrink: 1 }} testID="window-title">
      <Text variant="small" tone={focused ? "ink" : "soft"} numberOfLines={1}>{title}</Text>
    </Press>
  );
}
