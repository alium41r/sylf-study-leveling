// Defaults for future notes. A note's own page settings use the same paper controls.
import { ScrollView, View } from "react-native";
import { Chip, Segmented, Sheet, Text, useTheme } from "@sylf/design-system";
import { BOARD_TEMPLATES, TYPED_TEMPLATES } from "@sylf/notes";
import { PaperColors, PaperFlow, PaperStudio, PaperTemplates } from "./PaperStudio";
import { noteStyle, stylePaper, useNoteStyle } from "./note-style";

export default function NoteStyleSheet({ open, onClose, notes, boards }: { open: boolean; onClose(): void; notes: boolean; boards: boolean }) {
  const { space } = useTheme();
  const style = useNoteStyle();
  const paper = stylePaper(style);
  if (!notes) return (
    <Sheet open={open} onClose={onClose} title="Whiteboard style">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.sm }}>
        <Text variant="subheading">Background</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {boards ? BOARD_TEMPLATES.map((item) => <Chip key={item.id} label={item.label} selected={style.board === item.id} onPress={() => noteStyle.set({ board: item.id })} />) : null}
        </View>
      </ScrollView>
    </Sheet>
  );
  return (
    <PaperStudio open={open} onClose={onClose} title="Default note style"
      page={
        <>
          <PaperFlow value={style.flow} onChange={(flow) => noteStyle.set({ flow })} />
          <PaperColors paper={paper} onChoose={(paper) => noteStyle.set({ paper })} />
          <View style={{ gap: space.sm }}>
            <Text variant="subheading">Opens in</Text>
            <Segmented label="Opens in" value={style.opensIn} onChange={(opensIn) => noteStyle.set({ opensIn })}
              options={[{ value: "auto", label: "Auto" }, { value: "type", label: "Type" }, { value: "write", label: "Write" }]} fit />
          </View>
        </>
      }
      templates={<PaperTemplates paper={paper} spacing={style.spacing} onChoose={(layout, spacing) => noteStyle.set({ layout, spacing })}
        accessory={<View style={{ gap: space.sm }}>
          <Text variant="subheading">Writing starter</Text>
          <View role="radiogroup" aria-label="Writing starter" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {TYPED_TEMPLATES.map((item) => <Chip key={item.id} label={item.id === "blank" ? "An empty page" : item.label} selected={style.template === item.id} onPress={() => noteStyle.set({ template: item.id })} radio />)}
          </View>
          <Text variant="caption" tone="soft">{TYPED_TEMPLATES.find((item) => item.id === style.template)?.detail}</Text>
        </View>} />} />
  );
}
