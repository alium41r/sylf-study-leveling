// The Theme Studio: every personality axis in one place, previewed live. It is a reusable composition, not a route, so
// the eventual settings surface can mount it as is. Changes apply immediately and are always one Undo away.
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Button, IconButton } from "../components/Button";
import { Select, TextField } from "../components/Field";
import { Dialog, ContextArea, useNotice, type MenuItem } from "../components/Overlays";
import { Chip, Segmented, Toggle } from "../components/Selection";
import { Slider } from "../components/Slider";
import { Callout, Meter, Progress, Readout } from "../components/Feedback";
import { Divider, Row, Stack } from "../primitives/Layout";
import { Marker } from "../primitives/Marker";
import { Plane } from "../primitives/Plane";
import { Press } from "../primitives/Press";
import { Text } from "../primitives/Text";
import { SylfMark } from "../icons";
import { DENSITIES, ICON_STYLES, INTENSITIES, MARKERS, MATERIALS, MOTION_CHARACTERS, RAMPS, SHAPES, type ThemeAxes } from "../theme/axes";
import { ThemeScope, useAppearance, useAppearanceStore, useTheme, useWindowClass } from "../theme/context";
import { fontsForRole, type FontRole } from "../theme/fonts";
import { normalizeAxes, resolveAxes, themeName, TEXT_SCALE_RANGE } from "../theme/preference";
import { ACCENT_SWATCHES, DAY_GROUND_SWATCHES, NIGHT_GROUND_SWATCHES, PRESET_ORDER, THEME_PRESETS, type PresetId } from "../theme/presets";
import { ColorPicker } from "./ColorPicker";

type Section = "color" | "type" | "surface" | "feel" | "access";

const SECTIONS: { value: Section; label: string }[] = [
  { value: "color", label: "Color" },
  { value: "type", label: "Type" },
  { value: "surface", label: "Surface" },
  { value: "feel", label: "Feel" },
  { value: "access", label: "Access" },
];

function useLiveAxes() {
  const { preference, preview } = useAppearance();
  return useMemo(() => normalizeAxes(preview ?? {}, resolveAxes(preference)), [preference, preview]);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { space } = useTheme();
  return <View style={{ gap: space.sm }}><Text variant="caption" tone="soft">{label}</Text>{children}</View>;
}

function Options<K extends string>({ table, value, onChange }: { table: Record<K, { label: string }>; value: K; onChange: (value: K) => void }) {
  const { space } = useTheme();
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs + 2 }}>{(Object.keys(table) as K[]).map((key) => <Chip key={key} label={table[key].label} selected={key === value} onPress={() => onChange(key)} />)}</View>;
}

/** A tile that is the theme: it renders real components inside a ThemeScope, in the current mode. */
function ThemeTile({ axes, name, tagline, selected, onPress, width }: { axes: ThemeAxes; name: string; tagline: string; selected: boolean; onPress: () => void; width: number }) {
  return (
    <ThemeScope axes={axes}>
      <TileBody name={name} tagline={tagline} selected={selected} onPress={onPress} width={width} />
    </ThemeScope>
  );
}

function TileBody({ name, tagline, selected, onPress, width }: { name: string; tagline: string; selected: boolean; onPress: () => void; width: number }) {
  const theme = useTheme();
  const { color, space, shape, surface } = theme;
  return (
    <Press role="radio" checked={selected} label={`${name}. ${tagline}`} onPress={onPress} feedback="none" radius={shape.radius.lg} style={{ width }}>
      <View style={[surface("raised", "lg"), { backgroundColor: color.ground, padding: space.md, gap: space.sm, minHeight: 128, borderColor: selected ? color.accent.ink : color.line, borderWidth: selected ? 2 : Math.max(1, surface("raised").borderWidth), overflow: "hidden" }]}>
        <Row gap="sm" justify="space-between">
          <SylfMark size={18} />
          {selected ? <Marker /> : null}
        </Row>
        <View style={{ flex: 1, justifyContent: "flex-end", gap: 2 }}>
          <Text variant="heading" numberOfLines={1} style={{ fontFamily: theme.fonts.voice.faces.regular, fontSize: 19, lineHeight: 24, letterSpacing: 0 }}>{name}</Text>
          <Text variant="caption" tone="soft" numberOfLines={2}>{tagline}</Text>
        </View>
        <Row gap="xs">
          <View style={{ width: 22, height: 8, borderRadius: Math.min(shape.radius.xs, 4), backgroundColor: color.accent.fill }} />
          <View style={{ width: 14, height: 8, borderRadius: Math.min(shape.radius.xs, 4), backgroundColor: color.plane, borderWidth: 1, borderColor: color.line }} />
          <View style={{ width: 8, height: 8, borderRadius: Math.min(shape.radius.xs, 4), backgroundColor: color.ink }} />
        </Row>
      </View>
    </Press>
  );
}

function Gallery() {
  const store = useAppearanceStore();
  const { preference } = useAppearance();
  const notice = useNotice();
  const { space } = useTheme();
  const { width: windowWidth, size } = useWindowClass();
  const [hostWidth, setHostWidth] = useState(0);
  const columns = size === "compact" ? 2 : hostWidth > 620 ? 3 : 2;
  const tileWidth = hostWidth > 0 ? Math.floor((hostWidth - space.sm * (columns - 1)) / columns) : Math.min(windowWidth / 2 - 24, 180);
  const savedMenu = (id: string, name: string): MenuItem[] => [
    { key: "use", label: "Use theme", icon: "check", onSelect: () => store.selectTheme(id) },
    { key: "delete", label: "Delete", icon: "trash", destructive: true, onSelect: () => { store.deleteSaved(id); notice(`${name} deleted`, { action: { label: "Undo", onPress: () => store.undo() } }); } },
  ];
  return (
    <View role="radiogroup" aria-label="Themes" onLayout={(e) => setHostWidth(e.nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {PRESET_ORDER.map((id: PresetId) => {
        const preset = THEME_PRESETS[id];
        return <ThemeTile key={id} axes={preset.axes} name={preset.name} tagline={preset.tagline} width={tileWidth} selected={preference.themeId === id} onPress={() => store.selectTheme(id)} />;
      })}
      {preference.saved.map((theme) => (
        <ContextArea key={theme.id} label={`${theme.name} options`} items={savedMenu(theme.id, theme.name)}>
          <ThemeTile axes={theme.axes} name={theme.name} tagline={`Based on ${THEME_PRESETS[theme.baseId].name}`} width={tileWidth} selected={preference.themeId === theme.id} onPress={() => store.selectTheme(theme.id)} />
        </ContextArea>
      ))}
    </View>
  );
}

function ColorSection({ axes }: { axes: ThemeAxes }) {
  const store = useAppearanceStore();
  const { preference } = useAppearance();
  const theme = useTheme();
  const { report } = theme.palette;
  const groundOwn = (hex: string) => ({ name: "Theme default", hex });
  const preset = THEME_PRESETS[(preference.saved.find((t) => t.id === preference.themeId)?.baseId ?? preference.themeId) as PresetId];
  return (
    <Stack gap="xl">
      <ColorPicker label="Accent" note="Your signature color" value={axes.accentHex} swatches={ACCENT_SWATCHES} recents={preference.recents.accents} onPreview={(accentHex) => store.preview({ accentHex })} onCommit={(accentHex) => { store.cancelPreview(); store.tweak({ accentHex }); }} />
      <ColorPicker label="Day ground" note="Used in light mode" value={axes.groundDay} swatches={[groundOwn(preset.axes.groundDay), ...DAY_GROUND_SWATCHES]} recents={preference.recents.grounds} onPreview={(groundDay) => store.preview({ groundDay })} onCommit={(groundDay) => { store.cancelPreview(); store.tweak({ groundDay }); }} />
      <ColorPicker label="Night ground" note="Used in dark mode" value={axes.groundNight} swatches={[groundOwn(preset.axes.groundNight), ...NIGHT_GROUND_SWATCHES]} recents={preference.recents.grounds} onPreview={(groundNight) => store.preview({ groundNight })} onCommit={(groundNight) => { store.cancelPreview(); store.tweak({ groundNight }); }} />
      <Field label="Accent presence">
        <Segmented fit label="Accent presence" value={axes.presence} onChange={(presence) => store.tweak({ presence })} options={[{ value: "quiet", label: "Quiet" }, { value: "balanced", label: "Balanced" }, { value: "vivid", label: "Vivid" }]} />
        <Text variant="caption" tone="soft">{axes.presence === "quiet" ? "Accent marks what's active. Main actions stay in ink." : axes.presence === "balanced" ? "Accent carries main actions and selections." : "Accent also tints surfaces and ink."}</Text>
      </Field>
      {report.accentAdjusted ? <Callout tone="caution" title="Accent adjusted for visibility" message="This accent would disappear into the ground, so Sylf shifted its lightness just enough to stay visible." /> : null}
      {report.surfacesCompressed ? <Callout title="Surfaces flattened" message="This ground leaves little contrast to spare, so raised surfaces use outlines instead of tone." /> : null}
      <Row gap="xl" wrap>
        <Readout value={report.ratios.ink.toFixed(1)} label="Text contrast" unit=":1" />
        <Readout value={report.ratios.accentInk.toFixed(1)} label="Accent text" unit=":1" />
        <Readout value={report.ratios.onFill.toFixed(1)} label="Label on fill" unit=":1" />
      </Row>
    </Stack>
  );
}

function fontOptions(role: FontRole) {
  return fontsForRole(role).map((family) => ({ value: family.id, label: family.label, detail: family.character, fontFamily: family.faces.regular }));
}

function TypeSection({ axes }: { axes: ThemeAxes }) {
  const store = useAppearanceStore();
  return (
    <Stack gap="lg">
      <Select label="Voice: titles and quotations" value={axes.fontVoice} options={fontOptions("voice")} onChange={(fontVoice) => store.tweak({ fontVoice })} />
      <Select label="Interface: labels and controls" value={axes.fontInterface} options={fontOptions("interface")} onChange={(fontInterface) => store.tweak({ fontInterface })} />
      <Select label="Instrument: numbers and timers" value={axes.fontInstrument} options={fontOptions("instrument")} onChange={(fontInstrument) => store.tweak({ fontInstrument })} />
      <Text variant="caption" tone="soft">Instrument faces all have equal-width digits, so a running timer never shifts. Interface faces all stay legible at small sizes.</Text>
      <Field label="Type scale"><Options table={RAMPS} value={axes.ramp} onChange={(ramp) => store.tweak({ ramp })} /></Field>
    </Stack>
  );
}

function SurfaceSection({ axes }: { axes: ThemeAxes }) {
  const store = useAppearanceStore();
  return (
    <Stack gap="lg">
      <Field label="Corners"><Options table={SHAPES} value={axes.shape} onChange={(shape) => store.tweak({ shape })} /></Field>
      <Field label="Material"><Options table={MATERIALS} value={axes.material} onChange={(material) => store.tweak({ material })} /></Field>
      <Field label="Selection mark"><Options table={MARKERS} value={axes.marker} onChange={(marker) => store.tweak({ marker })} /></Field>
      <Field label="Icon drawing"><Options table={ICON_STYLES} value={axes.icons} onChange={(icons) => store.tweak({ icons })} /></Field>
    </Stack>
  );
}

function FeelSection({ axes }: { axes: ThemeAxes }) {
  const store = useAppearanceStore();
  const { motion } = useTheme();
  return (
    <Stack gap="lg">
      <Field label="Density"><Segmented fit label="Density" value={axes.density} onChange={(density) => store.tweak({ density })} options={(Object.keys(DENSITIES) as (keyof typeof DENSITIES)[]).map((value) => ({ value, label: DENSITIES[value].label }))} /></Field>
      <Field label="Motion character"><Options table={MOTION_CHARACTERS} value={axes.motion} onChange={(value) => store.tweak({ motion: value })} /></Field>
      <Field label="Animation intensity"><Segmented fit label="Animation intensity" value={axes.intensity} onChange={(intensity) => store.tweak({ intensity })} options={(Object.keys(INTENSITIES) as (keyof typeof INTENSITIES)[]).map((value) => ({ value, label: INTENSITIES[value].label }))} /></Field>
      {motion.reduced && axes.intensity !== "still" ? <Callout title="Reduced motion is on" message="Your system or accessibility setting takes priority. Sylf uses gentle fades, whatever the theme asks for." /> : null}
    </Stack>
  );
}

function AccessSection() {
  const store = useAppearanceStore();
  const { preference } = useAppearance();
  const { access } = preference;
  return (
    <Stack gap="lg">
      <Text variant="small" tone="soft">These stay with you when you change themes.</Text>
      <Slider label="Text size" min={TEXT_SCALE_RANGE.min} max={TEXT_SCALE_RANGE.max} step={0.05} ticks value={access.textScale} format={(v) => `${Math.round(v * 100)}%`} onChange={() => undefined} onCommit={(textScale) => store.setAccess({ textScale })} />
      <Row gap="md" justify="space-between"><Stack flex={1}><Text variant="small">More contrast</Text><Text variant="caption" tone="soft">Stronger text and outlines.</Text></Stack><Toggle label="More contrast" value={access.contrast === "more"} onChange={(on) => store.setAccess({ contrast: on ? "more" : "system" })} /></Row>
      <Row gap="md" justify="space-between"><Stack flex={1}><Text variant="small">Reduce motion</Text><Text variant="caption" tone="soft">Replaces movement with short fades.</Text></Stack><Toggle label="Reduce motion" value={access.motion === "reduced"} onChange={(on) => store.setAccess({ motion: on ? "reduced" : "system" })} /></Row>
    </Stack>
  );
}

/** Real components in the theme being edited, so what you see is exactly what you get. */
function LiveStage({ axes }: { axes: ThemeAxes }) {
  const store = useAppearanceStore();
  const { preference } = useAppearance();
  const [segment, setSegment] = useState("deep");
  const [on, setOn] = useState(true);
  const [level, setLevel] = useState(0.62);
  return (
    <ThemeScope axes={axes}>
      <StageBody name={themeName(preference)} segment={segment} setSegment={setSegment} on={on} setOn={setOn} level={level} setLevel={setLevel} onReset={() => store.revert()} />
    </ThemeScope>
  );
}

function StageBody({ name, segment, setSegment, on, setOn, level, setLevel }: { name: string; segment: string; setSegment: (value: string) => void; on: boolean; setOn: (value: boolean) => void; level: number; setLevel: (value: number) => void; onReset: () => void }) {
  const { color, space, shape } = useTheme();
  return (
    <View aria-label="Live preview" style={{ backgroundColor: color.ground, padding: space.xl, gap: space.lg, borderRadius: shape.radius.xl, borderWidth: 1, borderColor: color.line, overflow: "hidden" }}>
      <Row justify="space-between"><Row gap="sm"><SylfMark size={20} /><Text variant="caption" tone="soft">{name}</Text></Row><Marker breathing /></Row>
      <Stack gap="xs">
        <Text variant="display">Complex numbers</Text>
        <Text variant="quote" tone="soft">“Every proof starts with one line.”</Text>
      </Stack>
      <Segmented label="Session length" value={segment} onChange={setSegment} options={[{ value: "sprint", label: "Sprint" }, { value: "deep", label: "Deep work" }, { value: "review", label: "Review" }]} />
      <Plane level="raised" pad="lg" behind={color.ground}>
        <Row justify="space-between" align="flex-end" gap="lg" wrap>
          <Readout value="24:08" label="Remaining" size="large" />
          <Stack gap="sm" style={{ flexGrow: 1, flexBasis: 160 }}>
            <Meter value={3} max={5} label="Sessions" />
            <Progress value={level} label="Chapter" showValue />
          </Stack>
        </Row>
      </Plane>
      <Slider label="Ambient level" value={level} onChange={setLevel} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
      <Row gap="sm" wrap>
        <Button title="Begin" variant="emphasis" icon="play" />
        <Button title="Later" />
        <Chip label="Past paper" selected />
        <Chip label="Notes" />
        <View style={{ flex: 1 }} />
        <Toggle label="Ambient audio" value={on} onChange={setOn} />
      </Row>
    </View>
  );
}

export function ThemeStudio({ initialSection = "color" }: { initialSection?: Section }) {
  const store = useAppearanceStore();
  const { preference, canUndo, canRedo } = useAppearance();
  const theme = useTheme();
  const notice = useNotice();
  const { space } = theme;
  const axes = useLiveAxes();
  const { size } = useWindowClass();
  const [section, setSection] = useState<Section>(initialSection);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const dirty = Object.keys(preference.overrides).length > 0;
  const onSaved = preference.saved.some((t) => t.id === preference.themeId);
  const twoPane = size === "expanded";
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [section]);

  const save = () => {
    const saved = store.saveAs(name);
    setNaming(false);
    setName("");
    if (saved) notice(`Saved ${saved.name}`, { tone: "positive" });
    else notice("Couldn't save: remove a theme first", { tone: "caution" });
  };

  const bar = (
    <Row gap="xs" wrap justify="flex-end">
      <IconButton icon="undo" label="Undo" size="small" disabled={!canUndo} onPress={() => store.undo()} />
      <IconButton icon="redo" label="Redo" size="small" disabled={!canRedo} onPress={() => store.redo()} />
      {dirty ? <Button size="small" variant="ghost" title="Revert" icon="reset" onPress={() => store.revert()} /> : null}
      {dirty && onSaved ? <Button size="small" title="Update" onPress={() => { store.updateSaved(); notice("Theme updated", { tone: "positive" }); }} /> : null}
      <Button size="small" variant="solid" title="Save as" icon="bookmark" onPress={() => { setName(dirty || !onSaved ? `My ${themeName(preference)}` : ""); setNaming(true); }} />
    </Row>
  );

  const controls = (
    <Stack gap="lg">
      <Row justify="space-between" gap="md" wrap>
        <Segmented label="Mode" value={preference.mode} onChange={(mode) => store.setMode(mode)} options={[{ value: "system", label: "System", icon: "auto" }, { value: "light", label: "Day", icon: "sun" }, { value: "dark", label: "Night", icon: "moon" }]} />
        {bar}
      </Row>
      <Gallery />
      <Divider />
      <Segmented label="Customize" value={section} onChange={setSection} options={SECTIONS} />
      {section === "color" ? <ColorSection axes={axes} /> : null}
      {section === "type" ? <TypeSection axes={axes} /> : null}
      {section === "surface" ? <SurfaceSection axes={axes} /> : null}
      {section === "feel" ? <FeelSection axes={axes} /> : null}
      {section === "access" ? <AccessSection /> : null}
    </Stack>
  );

  return (
    <View style={{ flex: 1, flexDirection: twoPane ? "row" : "column", gap: space.xl, minHeight: 0 }}>
      <View style={{ flex: twoPane ? 1 : undefined, minWidth: 0, minHeight: 0 }}>
        <ScrollView ref={scroll} style={{ flexGrow: 1 }} contentContainerStyle={{ gap: space.xl, paddingBottom: space.air }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {twoPane ? null : <LiveStage axes={axes} />}
          {controls}
        </ScrollView>
      </View>
      {twoPane ? <View style={{ width: "46%", maxWidth: 560 }}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xl }}><LiveStage axes={axes} /></ScrollView></View> : null}
      <Dialog open={naming} onClose={() => setNaming(false)} title="Save theme" message="Keep this combination under its own name." actions={[{ label: "Cancel", onPress: () => setNaming(false) }, { label: "Save", variant: "emphasis", onPress: save }]}>
        <TextField label="Theme name" value={name} onChangeText={setName} maxLength={40} autoFocus onSubmitEditing={save} returnKeyType="done" />
      </Dialog>
    </View>
  );
}

