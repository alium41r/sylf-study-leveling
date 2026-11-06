// The gear in the Notes and Whiteboard libraries: how new notes and boards start. It changes no note that exists; a note's own page
// settings do that. Every choice applies at once, so there is nothing to save.
import { View } from "react-native";
import { Chip, Press, Segmented, Sheet, Text, useTheme } from "@sylf/design-system";
import { BOARD_TEMPLATES, PAPER_TEMPLATES, TYPED_TEMPLATES, paperFor, type PaperTemplate } from "@sylf/notes";
import { PaperPreview } from "./PageSettings";
import { PAPERS, noteStyle, stylePaper, useNoteStyle } from "./note-style";

export default function NoteStyleSheet({ open, onClose, notes, boards }: { open: boolean; onClose(): void; notes: boolean; boards: boolean }) {
  const { space, color } = useTheme();
  const style = useNoteStyle();
  const paper = stylePaper(style);
  return (
    <Sheet open={open} onClose={onClose} title={notes ? "Note style" : "Whiteboard style"} width={440}>
      <View style={{ gap: space.lg }} testID="note-style">
        {notes ? (
          <>
            <Text variant="small" tone="soft">How new notes start. Each note's own page settings change it later.</Text>
            <Segmented label="Pages" value={style.flow} onChange={(flow) => noteStyle.set({ flow })} options={[{ value: "pages", label: "Separate pages" }, { value: "endless", label: "Endless" }]} />
            <View style={{ gap: space.sm }}>
              <Text variant="label" tone="soft">Layout</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {PAPER_TEMPLATES.map((t) => {
                  const selected = style.layout === t.id;
                  return (
                    <Press key={t.id} label={t.label} selected={selected} feedback="none" style={{ width: 84 }} bodyStyle={{ alignItems: "center", gap: 6 }}
                      onPress={() => noteStyle.set({ layout: t.id as PaperTemplate, paper: style.paper.color === paperFor(style.layout).color ? { color: paperFor(t.id).color, rule: paperFor(t.id).rule } : style.paper })}>
                      <PaperPreview template={t.id} paper={{ ...paper, template: t.id }} selected={selected} />
                      <Text variant="caption" tone={selected ? "ink" : "soft"}>{t.label}</Text>
                    </Press>
                  );
                })}
              </View>
            </View>
            {style.layout !== "blank" ? <Segmented label="Spacing" value={style.spacing} onChange={(spacing) => noteStyle.set({ spacing })} options={[{ value: "narrow", label: "Narrow" }, { value: "medium", label: "Medium" }, { value: "wide", label: "Wide" }]} /> : null}
            <View style={{ gap: space.sm }}>
              <Text variant="label" tone="soft">Paper</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {PAPERS.map((p) => {
                  const selected = style.paper.color === p.color;
                  return (
                    <Press key={p.label} label={`${p.label} paper`} selected={selected} onPress={() => noteStyle.set({ paper: { color: p.color, rule: p.rule } })} feedback="none" bodyStyle={{ alignItems: "center", gap: 4 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.color, borderWidth: selected ? 3 : 1, borderColor: selected ? color.accent.fill : color.line }} />
                      <Text variant="micro" tone={selected ? "ink" : "soft"}>{p.label}</Text>
                    </Press>
                  );
                })}
              </View>
            </View>
            <View style={{ gap: space.sm }}>
              <Text variant="label" tone="soft">Starts with</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                {TYPED_TEMPLATES.map((t) => <Chip key={t.id} label={t.id === "blank" ? "An empty page" : t.label} selected={style.template === t.id} onPress={() => noteStyle.set({ template: t.id })} />)}
              </View>
            </View>
            <Segmented label="Opens in" value={style.opensIn} onChange={(opensIn) => noteStyle.set({ opensIn })} options={[{ value: "auto", label: "Pen decides" }, { value: "type", label: "Type" }, { value: "write", label: "Write" }]} />
          </>
        ) : null}
        {boards ? (
          <View style={{ gap: space.sm }}>
            <Text variant="label" tone="soft">Whiteboard background</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {BOARD_TEMPLATES.map((t) => <Chip key={t.id} label={t.label} selected={style.board === t.id} onPress={() => noteStyle.set({ board: t.id })} />)}
            </View>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
