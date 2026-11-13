import { useState } from "react";
import { View } from "react-native";
import { Button, Segmented, Text, useNotice, useTheme } from "@sylf/design-system";
import { ink, type DocumentDescriptor, type InkPaper } from "@sylf/shared";
import { InkScene, flowOf, type NotesLibrary, type OpenDocument } from "@sylf/notes";
import { pickImage } from "./pick-image";
import { PaperColors, PaperFlow, PaperStudio, PaperTemplates } from "./PaperStudio";
import { spacingsFor, type Spacing } from "./note-style";

type Page = DocumentDescriptor["pages"][number];
export default function PageSettings({ open, onClose, onAddPage, library, document, page, scenes }: { open: boolean; onClose(): void; onAddPage(): void; library: NotesLibrary; document: OpenDocument; page: Page | null; scenes: Map<string, InkScene> }) {
  const { space } = useTheme();
  const notice = useNotice();
  const [scope, setScope] = useState<"page" | "all">("page");
  const descriptor = document.descriptor();
  const editablePages = descriptor.pages.filter((target) => !target.originalAssetId);
  const targets = scope === "all" ? editablePages : page && !page.originalAssetId ? [page] : [];
  const sample = page && !page.originalAssetId ? page : targets[0];
  const defaultPaper = (descriptor.extensions.noteStyle as { paper?: InkPaper } | undefined)?.paper;
  const current = page?.originalAssetId && defaultPaper ? defaultPaper : sample
    ? scenes.get(sample.pageId)?.paper() ?? (sample.extensions.noteStyle as { paper?: InkPaper } | undefined)?.paper ?? ink.DEFAULT_PAPER
    : ink.DEFAULT_PAPER;
  const choices = spacingsFor(current.template);
  const spacing = (Object.entries(choices) as [Spacing, number][]).reduce((best, [name, value]) => (
    Math.abs(value - current.spacing) < Math.abs(choices[best] - current.spacing) ? name : best
  ), "medium" as Spacing);

  const apply = (patch: Partial<InkPaper>) => {
    for (const target of targets) {
      const existing = scenes.get(target.pageId), scene = existing ?? new InkScene(document.stream(target.streamId));
      try { scene.setPaper({ ...scene.paper(), ...patch }); } finally { if (!existing) scene.close(); }
    }
    if (scope === "all" && targets.length) document.setDefaultPaper({ ...current, ...patch });
  };
  const picture = async () => {
    try {
      const picked = await pickImage();
      if (!picked) return;
      const stored = await library.storeAsset(picked.bytes, picked.mediaType, picked.name);
      for (const target of targets) document.setBackground(target.pageId, stored);
    } catch (error) { notice(error instanceof Error ? error.message : "That picture could not be used."); }
  };
  const controls = targets.length ? (
    <View style={{ gap: space.sm }}>
      <Text variant="subheading">Background image</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        <Button title="Choose picture" icon="image" size="small" onPress={() => void picture()} />
        {targets.some((target) => typeof target.extensions.backgroundAssetId === "string") ? (
          <Button title="Remove picture" icon="close" size="small" variant="ghost" onPress={() => targets.forEach((target) => document.setBackground(target.pageId, null))} />
        ) : null}
      </View>
    </View>
  ) : null;
  const pdfHint = <Text variant="small" tone="soft">This page uses the imported PDF. Choose a paper page to edit its style.</Text>;

  return (
    <PaperStudio open={open} onClose={onClose} title="Page settings"
      header={<Segmented label="Apply to" value={scope} onChange={setScope} options={[{ value: "page", label: "This page" }, { value: "all", label: "Every page" }]} fit />}
      page={
        <>
          <PaperFlow value={flowOf(descriptor)} onChange={(flow) => document.setFlow(flow)} />
          {targets.length ? <PaperColors paper={current} onChoose={apply} /> : pdfHint}
          {controls}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            <Button title="Add a page" icon="pagePlus" size="small" onPress={onAddPage} />
            {page && descriptor.pages.length > 1 ? <Button title="Delete this page" icon="trash" size="small" variant="critical" onPress={() => { document.removePage(page.pageId); onClose(); }} /> : null}
          </View>
        </>
      }
      templates={targets.length ? <PaperTemplates paper={current} spacing={spacing} onChoose={(template, value) => apply({ template, spacing: spacingsFor(template)[value] })} /> : pdfHint} />
  );
}
