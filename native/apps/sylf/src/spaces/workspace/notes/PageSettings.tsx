// A page's look, changeable at any time: its layout (lined, grid, dots and the planners), how close the lines sit, the paper's
// colour, or a picture. For this page or the whole note. Paper lives in each page's ink stream as the web's paper record, so the
// web reader draws the same page.
import { useState } from "react";
import { View } from "react-native";
import { Button, Icon, Press, Segmented, Sheet, Text, useNotice, useTheme } from "@sylf/design-system";
import { ink, type DocumentDescriptor, type InkPaper } from "@sylf/shared";
import { InkScene, PAPER_TEMPLATES, flowOf, type NotesLibrary, type OpenDocument, type PaperTemplate } from "@sylf/notes";
import { pickImage } from "./pick-image";
import { PAPERS, spacingsFor, type Spacing } from "./note-style";

type Page = DocumentDescriptor["pages"][number];
export default function PageSettings({ open, onClose, library, document, page, scenes }: { open: boolean; onClose(): void; library: NotesLibrary; document: OpenDocument; page: Page | null; scenes: Map<string, InkScene> }) {
  const { space, color } = useTheme();
  const notice = useNotice();
  const [scope, setScope] = useState<"page" | "all">("page");
  const sceneFor = (target: Page) => scenes.get(target.pageId) ?? null;
  const current = page ? (sceneFor(page)?.paper() ?? ((page.extensions.noteStyle as { paper?: InkPaper } | undefined)?.paper ?? ink.DEFAULT_PAPER)) : ink.DEFAULT_PAPER;
  const spacing = (Object.entries(spacingsFor(current.template)) as [Spacing, number][]).reduce((best, [name, value]) => (Math.abs(value - current.spacing) < Math.abs(spacingsFor(current.template)[best] - current.spacing) ? name : best), "medium" as Spacing);

  const apply = (patch: Partial<InkPaper>) => {
    const targets = scope === "all" ? document.descriptor().pages : page ? [page] : [];
    const next = { ...current, ...patch };
    for (const target of targets) {
      if (target.originalAssetId) continue;
      const open = sceneFor(target), scene = open ?? new InkScene(document.stream(target.streamId));
      try { scene.setPaper({ ...scene.paper(), ...patch }); } finally { if (!open) scene.close(); }
    }
    if (scope === "all") document.setDefaultPaper(next);
  };
  const choose = (template: PaperTemplate) => apply({ template, spacing: spacingsFor(template)[spacing] });

  const setPicture = async () => {
    if (!page) return;
    try {
      const image = await pickImage();
      if (!image) return;
      const stored = await library.storeAsset(image.bytes, image.mediaType, image.name);
      for (const target of scope === "all" ? document.descriptor().pages.filter((p) => !p.originalAssetId) : [page]) document.setBackground(target.pageId, stored);
    } catch (error) { notice(error instanceof Error ? error.message : "That picture could not be used."); }
  };
  const hasPicture = !!page && typeof page.extensions.backgroundAssetId === "string";

  return (
    <Sheet open={open} onClose={onClose} title="Page" width={420}>
      <View style={{ gap: space.lg }}>
        <Segmented label="Pages" value={flowOf(document.descriptor())} onChange={(flow) => document.setFlow(flow)} options={[{ value: "pages", label: "Separate pages" }, { value: "endless", label: "Endless" }]} />
        <Segmented label="Apply to" value={scope} onChange={setScope} options={[{ value: "page", label: "This page" }, { value: "all", label: "Every page" }]} />
        {page?.originalAssetId ? <Text variant="small" tone="soft">This is a PDF page: its look is the PDF's. Choose another page, or Every page, to change the paper.</Text> : null}
        <View style={{ gap: space.sm }}>
          <Text variant="label" tone="soft">Layout</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {PAPER_TEMPLATES.map((template) => {
              const selected = current.template === template.id && !hasPicture;
              return (
                <Press key={template.id} label={template.label} selected={selected} onPress={() => choose(template.id)} feedback="none" style={{ width: 84 }} bodyStyle={{ alignItems: "center", gap: 6 }}>
                  <PaperPreview template={template.id} paper={current} selected={selected} />
                  <Text variant="caption" tone={selected ? "ink" : "soft"}>{template.label}</Text>
                </Press>
              );
            })}
            <Press label="Picture" selected={hasPicture} onPress={() => void setPicture()} feedback="none" style={{ width: 84 }} bodyStyle={{ alignItems: "center", gap: 6 }}>
              <View style={{ width: 64, height: 84, borderRadius: 8, borderWidth: hasPicture ? 2 : 1, borderColor: hasPicture ? color.accent.fill : color.line, alignItems: "center", justifyContent: "center", backgroundColor: color.sunken }}><Icon name="image" color={color.inkSoft} /></View>
              <Text variant="caption" tone={hasPicture ? "ink" : "soft"}>Picture</Text>
            </Press>
          </View>
          {hasPicture && page ? <Button title="Remove the picture" size="small" icon="close" onPress={() => document.setBackground(page.pageId, null)} /> : null}
        </View>
        {current.template !== "blank" ? <Segmented label="Spacing" value={spacing} onChange={(value) => apply({ spacing: spacingsFor(current.template)[value] })} options={[{ value: "narrow", label: "Narrow" }, { value: "medium", label: "Medium" }, { value: "wide", label: "Wide" }]} /> : null}
        <View style={{ gap: space.sm }}>
          <Text variant="label" tone="soft">Paper</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {PAPERS.map((paper) => {
              const selected = current.color === paper.color;
              return (
                <Press key={paper.label} label={`${paper.label} paper`} selected={selected} onPress={() => apply({ color: paper.color, rule: paper.rule })} feedback="none" bodyStyle={{ alignItems: "center", gap: 4 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: paper.color, borderWidth: selected ? 3 : 1, borderColor: selected ? color.accent.fill : color.line }} />
                  <Text variant="micro" tone={selected ? "ink" : "soft"}>{paper.label}</Text>
                </Press>
              );
            })}
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Button title="Add a page" icon="pagePlus" size="small" onPress={() => { const at = page ? document.descriptor().pages.findIndex((p) => p.pageId === page.pageId) : undefined; document.addPage(at); }} />
          {page && document.descriptor().pages.length > 1 ? <Button title="Delete this page" icon="trash" size="small" variant="critical" onPress={() => { document.removePage(page.pageId); onClose(); }} /> : null}
        </View>
      </View>
    </Sheet>
  );
}

/** A small page in the chosen layout and paper, drawn with plain views. */
export function PaperPreview({ template, paper, selected }: { template: PaperTemplate; paper: InkPaper; selected: boolean }) {
  const { color } = useTheme();
  const rule = paper.rule, lines: number[] = [6, 14, 22, 30, 38, 46, 54, 62, 70];
  return (
    <View style={{ width: 64, height: 84, borderRadius: 8, overflow: "hidden", backgroundColor: paper.color, borderWidth: selected ? 2 : 1, borderColor: selected ? color.accent.fill : color.line }}>
      {template === "ruled" || template === "journal" ? lines.map((y) => <View key={y} style={{ position: "absolute", left: 0, right: 0, top: y + 6, height: 1, backgroundColor: rule }} />) : null}
      {template === "grid" ? [8, 16, 24, 32, 40, 48, 56].map((x) => <View key={`v${x}`} style={{ position: "absolute", top: 0, bottom: 0, left: x, width: 1, backgroundColor: rule }} />).concat(lines.map((y) => <View key={`h${y}`} style={{ position: "absolute", left: 0, right: 0, top: y + 4, height: 1, backgroundColor: rule }} />)) : null}
      {template === "dotted" ? lines.flatMap((y) => [8, 18, 28, 38, 48, 58].map((x) => <View key={`${x}:${y}`} style={{ position: "absolute", left: x, top: y + 4, width: 2, height: 2, borderRadius: 1, backgroundColor: rule }} />)) : null}
      {template === "cornell" ? (<><View style={{ position: "absolute", top: 0, bottom: 18, left: 18, width: 1, backgroundColor: rule }} /><View style={{ position: "absolute", left: 0, right: 0, bottom: 18, height: 1, backgroundColor: rule }} />{lines.slice(1, 7).map((y) => <View key={y} style={{ position: "absolute", left: 20, right: 0, top: y + 4, height: 1, backgroundColor: rule }} />)}</>) : null}
      {template === "music" ? [14, 40].flatMap((y) => [0, 4, 8, 12, 16].map((d) => <View key={`${y}${d}`} style={{ position: "absolute", left: 6, right: 6, top: y + d, height: 1, backgroundColor: rule }} />)) : null}
      {template === "daily" ? (<><View style={{ position: "absolute", top: 10, bottom: 8, left: 40, width: 1, backgroundColor: rule }} />{lines.slice(1).map((y) => <View key={y} style={{ position: "absolute", left: 6, width: 30, top: y + 4, height: 1, backgroundColor: rule }} />)}</>) : null}
      {template === "weekly" ? (<><View style={{ position: "absolute", top: 8, bottom: 6, left: 32, width: 1, backgroundColor: rule }} />{[8, 27, 46, 65].map((y) => <View key={y} style={{ position: "absolute", left: 4, right: 4, top: y, height: 1, backgroundColor: rule }} />)}</>) : null}
    </View>
  );
}
