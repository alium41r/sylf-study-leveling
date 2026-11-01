// The Design System Showcase: a review tool for the system, not an application surface.
// App links select a chapter, theme and mode (shell/links.ts), which is how verification captures every combination.
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Button, IconButton, Row, SafeArea, Segmented, SylfMark, Text, ThemeStudio, useAppearanceStore, useDismiss, useTheme, useWindowClass } from "@sylf/design-system";
import { DocumentsChapter, ColorChapter, IconsChapter, IdentityChapter, PersonalitiesChapter, ShapeChapter, TypeChapter } from "./chapters-foundation";
import { ControlsChapter, FeedbackChapter, FieldsChapter, InputChapter, LayoutChapter, MotionChapter, OverlaysChapter } from "./chapters-components";
import { SystemChapter } from "./SystemChapter";

const CHAPTERS = [
  { value: "identity", label: "Identity" }, { value: "studio", label: "Theme Studio" }, { value: "color", label: "Color" }, { value: "type", label: "Type" },
  { value: "shape", label: "Surfaces" }, { value: "icons", label: "Icons" }, { value: "personalities", label: "Themes" }, { value: "controls", label: "Controls" },
  { value: "fields", label: "Fields" }, { value: "overlays", label: "Overlays" }, { value: "feedback", label: "Feedback" }, { value: "layout", label: "Layout" },
  { value: "motion", label: "Motion" }, { value: "input", label: "Input" }, { value: "documents", label: "Documents" }, { value: "system", label: "System" },
] as const;

type ChapterId = (typeof CHAPTERS)[number]["value"];

function StudioChapter() {
  const { space } = useTheme();
  const { size } = useWindowClass();
  return (
    <View style={{ flex: 1, paddingHorizontal: size === "compact" ? space.lg : space.xxl, paddingTop: space.lg, gap: space.lg, width: "100%", maxWidth: 1320, alignSelf: "center", minHeight: 0 }}>
      <View><Text variant="title" role="heading">Theme Studio</Text><Text variant="small" tone="soft">Change anything. It applies right away, and you can always undo.</Text></View>
      <ThemeStudio />
    </View>
  );
}

const PAGES: Record<ChapterId, () => ReactNode> = {
  identity: IdentityChapter, studio: StudioChapter, color: ColorChapter, type: TypeChapter, shape: ShapeChapter, icons: IconsChapter, personalities: PersonalitiesChapter,
  controls: ControlsChapter, fields: FieldsChapter, overlays: OverlaysChapter, feedback: FeedbackChapter, layout: LayoutChapter, motion: MotionChapter, input: InputChapter, documents: DocumentsChapter, system: SystemChapter,
};

export default function Showcase({ chapter: requested, request, onExit }: { chapter: string | null; request: number; onExit: () => void }) {
  const store = useAppearanceStore();
  const { color, space, palette: { polarity } } = useTheme();
  const { size } = useWindowClass();
  const [chapter, setChapter] = useState<ChapterId>("identity");

  useEffect(() => { if (requested && requested in PAGES) setChapter(requested as ChapterId); }, [requested, request]);
  useDismiss(true, onExit);

  const Page = PAGES[chapter];
  const dark = polarity === "dark";

  return (
    <SafeArea style={{ flex: 1, backgroundColor: color.ground }}>
      <View style={{ paddingHorizontal: size === "compact" ? space.lg : space.xl, paddingTop: space.sm, gap: space.xs }}>
        <Row gap="md" justify="space-between">
          <Row gap="sm"><IconButton icon="chevronLeft" label="Back to Spaces" size="small" onPress={onExit} /><SylfMark size={24} /><Text variant="subheading">Sylf Design System</Text></Row>
          <Row gap="xs">
            <IconButton icon={dark ? "sun" : "moon"} label={dark ? "Switch to day" : "Switch to night"} size="small" onPress={() => store.setMode(dark ? "light" : "dark")} />
            <Button title="Theme Studio" size="small" icon="palette" onPress={() => setChapter("studio")} />
          </Row>
        </Row>
        <Segmented label="Chapters" value={chapter} onChange={setChapter} options={CHAPTERS.map(({ value, label }) => ({ value, label }))} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}><Page /></View>
    </SafeArea>
  );
}


