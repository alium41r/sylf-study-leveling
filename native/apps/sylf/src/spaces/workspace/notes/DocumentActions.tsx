import { useRef, useState } from "react";
import { View } from "react-native";
import { IconButton, Menu, Text, Tooltip, type IconName, type MenuItem, type ViewHandle } from "@sylf/design-system";
import type { SaveState } from "@sylf/notes";

export interface DocumentActionsProps {
  saving: SaveState;
  items: MenuItem[];
  fullScreen?: { active: boolean; toggle(): void };
}

export default function DocumentActions({ saving, items, fullScreen, compact, showStatus }: DocumentActionsProps & { compact?: boolean; showStatus?: boolean }) {
  const anchor = useRef<ViewHandle>(null);
  const [open, setOpen] = useState(false);
  const status = saving === "saving" ? "Saving" : saving === "failed" ? "Not saved" : "Saved";
  const screenLabel = fullScreen?.active ? "Exit full screen" : "Full screen";
  const screenIcon: IconName = fullScreen?.active ? "collapse" : "focus";
  const showScreen = fullScreen && (!compact || fullScreen.active);
  const options: MenuItem[] = [
    ...(fullScreen && !showScreen ? [{ key: "screen", label: screenLabel, icon: screenIcon, onSelect: fullScreen.toggle }] : []),
    ...items,
    ...(!showStatus ? [{ key: "save-state", label: status, icon: saving === "failed" ? "warning" : "check", disabled: true, onSelect: () => undefined } as const] : []),
  ];

  return (
    <>
      {showStatus ? <Text variant="micro" tone={saving === "failed" ? "critical" : "soft"} aria-live="polite" numberOfLines={1}>{status}</Text> : null}
      {showScreen ? (
        <Tooltip text={screenLabel}>
          {(tooltip) => <IconButton {...tooltip} icon={screenIcon} label={screenLabel} size="small" active={fullScreen.active} testID="document-page-only" onPress={fullScreen.toggle} />}
        </Tooltip>
      ) : null}
      <View ref={anchor} collapsable={false}>
        <Tooltip text={saving === "failed" ? status : "Document options"}>
          {(tooltip) => <IconButton {...tooltip} icon={saving === "failed" && !showStatus ? "warning" : "more"} size="small" label="Document options" hint={status} expanded={open} onPress={() => setOpen(true)} />}
        </Tooltip>
      </View>
      <Menu open={open} anchor={anchor} onClose={() => setOpen(false)} items={options} label="Document options" />
    </>
  );
}
