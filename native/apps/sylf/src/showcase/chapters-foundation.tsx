import { useEffect, useMemo, useState } from "react";
import { Text as RNText, View } from "react-native";
import { Button, Callout, Columns, DocumentSurface, FONT_FAMILIES, ICON_NAMES, Icon, Marker, Meter, PRESET_ORDER, Plane, Row, Segmented, SylfMark, THEME_PRESETS, Text, ThemeScope, Toggle, TravellingMarker, contrast, useAppearance, resolveAxes, useTheme, type IconName, type TextVariant } from "@sylf/design-system";
import { Chapter, Specimen } from "./chrome";

function Principle({ title, body }: { title: string; body: string }) {
  return <View style={{ gap: 4 }}><Text variant="subheading">{title}</Text><Text variant="small" tone="soft">{body}</Text></View>;
}

function MarkerFlight() {
  const { space } = useTheme();
  const [spot, setSpot] = useState(0);
  useEffect(() => { const timer = setInterval(() => setSpot((value) => (value + 1) % 4), 1600); return () => clearInterval(timer); }, []);
  return <View style={{ height: 44, marginTop: space.sm }}><View style={{ flexDirection: "row", justifyContent: "space-between" }}>{["Read", "Write", "Solve", "Rest"].map((word, i) => <View key={word} style={{ width: 64, alignItems: "center" }}><Text variant="label" tone={i === spot ? "ink" : "faint"}>{word}</Text></View>)}</View><View style={{ position: "absolute", left: 0, right: 0, bottom: 4, height: 8 }} onLayout={undefined}><Flight spot={spot} /></View></View>;
}

function Flight({ spot }: { spot: number }) {
  const [width, setWidth] = useState(0);
  return <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>{width ? <TravellingMarker x={(spot * (width - 64)) / 3} width={64} /> : null}</View>;
}

export function IdentityChapter() {
  const { space, color } = useTheme();
  return (
    <Chapter index="01" title="Held in air" lede="Sylf is a calm instrument for studying. Surfaces rest above a quiet ground, and one small point of light shows you what is alive right now.">
      <Row gap="lg"><SylfMark size={64} /><View><Text variant="hero">Sylf</Text></View></Row>
      <Specimen label="The Marker" note="Each theme gives it a different body and flight. It always means the same thing: this one, now.">
        <View style={{ maxWidth: 420 }}><MarkerFlight /></View>
      </Specimen>
      <Columns max={3}>
        {[
          <Principle key="a" title="Accent is spent, not spread" body="Color marks what's active. Everything else stays in ink and tone, so the one thing that matters is easy to find." />,
          <Principle key="b" title="Three voices" body="Voice is for what's authored and human. Interface is for controls. Instrument is for numbers. Each stays in its role." />,
          <Principle key="c" title="Air before ink" body="Space separates first, tone second, and a hairline only as a last resort. Content gets the screen." />,
          <Principle key="d" title="Surfaces remember" body="Something that came from somewhere points home. Popovers tuck the corner nearest their origin instead of using an arrow." />,
          <Principle key="e" title="Motion has weight" body="Springs carry momentum and can be interrupted. Nothing moves without a reason, and reduced motion is honored everywhere." />,
          <Principle key="f" title="Personality, not structure" body="Themes change how Sylf feels, never where things are. Navigation stays put, and your documents stay yours." />,
        ]}
      </Columns>
      <Text variant="quote" tone="soft" style={{ maxWidth: 620, marginTop: space.md, borderLeftWidth: 0, borderColor: color.line }}>“A quiet room, a good pen, and one light on the page.”</Text>
    </Chapter>
  );
}

function Swatch({ name, value, on }: { name: string; value: string; on?: string }) {
  const { color, shape } = useTheme();
  return (
    <View style={{ width: 132, gap: 4 }}>
      <View style={{ height: 52, borderRadius: shape.radius.sm, backgroundColor: value, borderWidth: 1, borderColor: color.line, justifyContent: "flex-end", padding: 6 }}>
        {on ? <Text variant="micro" style={{ color: on }}>{contrast(on, value).toFixed(1)}:1</Text> : null}
      </View>
      <Text variant="caption" numberOfLines={1}>{name}</Text>
      <Text variant="micro" tone="faint">{value.startsWith("#") ? value.toUpperCase() : "overlay"}</Text>
    </View>
  );
}

export function ColorChapter() {
  const { color, palette, space } = useTheme();
  const groups: [string, [string, string, string?][]][] = [
    ["Grounds and surfaces", [["Sunken", color.sunken], ["Ground", color.ground, color.ink], ["Plane", color.plane, color.ink], ["Raised", color.raised, color.inkSoft], ["Float", color.float, color.inkSoft]]],
    ["Ink", [["Ink", color.ink, color.ground], ["Soft", color.inkSoft, color.ground], ["Faint", color.inkFaint, color.ground], ["Line", color.line], ["Strong line", color.lineStrong]]],
    ["Accent", [["Fill", color.accent.fill, color.accent.on], ["Ink", color.accent.ink, color.ground], ["Mark", color.accent.mote, color.ground], ["Wash", color.accent.wash, color.accent.ink], ["Focus", color.focus, color.ground]]],
    ["Signal", [["Positive", color.positive.wash, color.positive.ink], ["Caution", color.caution.wash, color.caution.ink], ["Critical", color.critical.wash, color.critical.ink]]],
  ];
  return (
    <Chapter index="03" title="Solved, not picked" lede="Every readable color is calculated against the surfaces it sits on. That's why a neon accent on a mid-gray ground stays as legible as the defaults.">
      {groups.map(([title, entries]) => <Specimen key={title} label={title}><Row gap="md" wrap align="flex-start">{entries.map(([name, value, on]) => <Swatch key={name} name={name} value={value} on={on} />)}</Row></Specimen>)}
      <Specimen label="Live contrast" note="Worst case across all five surfaces, for the theme you're viewing."><Row gap="xl" wrap>{Object.entries(palette.report.ratios).map(([key, ratio]) => <View key={key}><Text variant="readout">{ratio.toFixed(1)}</Text><Text variant="caption" tone="faint">{key}</Text></View>)}</Row></Specimen>
      <View style={{ height: space.sm }} />
    </Chapter>
  );
}

export function TypeChapter() {
  const { fonts } = useTheme();
  const rows: [TextVariant, string, string][] = [["hero", "Hero", "Sylf"], ["display", "Display", "Complex numbers"], ["title", "Title", "Chapter four: the argument"], ["quote", "Quote", "Every proof starts with one line."], ["heading", "Heading", "Past papers"], ["subheading", "Subheading", "Two sessions remain"], ["body", "Body", "Body text carries explanation at a comfortable reading size, with enough line height to rest the eye."], ["small", "Small", "Supporting information and list content."], ["label", "Label", "Begin session"], ["caption", "Caption", "Updated 2 minutes ago"], ["readoutXL", "Readout", "24:08"], ["readout", "Readout small", "1,240"], ["value", "Value", "0123456789"], ["micro", "Micro", "LV 14 · 3,420 XP"]];
  return (
    <Chapter index="04" title="Three voices" lede="Voice for what's authored, Interface for what you operate, Instrument for what you measure. Every theme fills the same three roles in its own way.">
      <Row gap="xl" wrap>{(["voice", "interface", "instrument"] as const).map((role) => <View key={role}><Text variant="caption" tone="faint">{role === "voice" ? "Voice" : role === "interface" ? "Interface" : "Instrument"}</Text><Text variant="subheading">{fonts[role].label}</Text><Text variant="small" tone="soft">{fonts[role].character}</Text></View>)}</Row>
      <View style={{ gap: 16 }}>{rows.map(([variant, name, sample]) => <View key={variant} style={{ flexDirection: "row", gap: 16, alignItems: "baseline" }}><View style={{ width: 96 }}><Text variant="micro" tone="faint">{name}</Text></View><View style={{ flex: 1, minWidth: 0 }}><Text variant={variant}>{sample}</Text></View></View>)}</View>
    </Chapter>
  );
}

export function ShapeChapter() {
  const { shape, space, marker, material, color, surface } = useTheme();
  return (
    <Chapter index="05" title="Space, shape, material" lede="Surfaces are drawn from axes: how corners turn, what a plane is made of, and how much air sits between things. Density changes the air, never the order.">
      <Specimen label="Spacing"><Row gap="md" align="flex-end" wrap>{(Object.entries(space) as [string, number][]).map(([name, value]) => <View key={name} style={{ alignItems: "center", gap: 4 }}><View style={{ width: Math.min(value, 72), height: Math.min(value, 72), backgroundColor: color.accent.wash, borderWidth: 1, borderColor: color.accent.line }} /><Text variant="micro" tone="faint">{value}</Text></View>)}</Row></Specimen>
      <Specimen label="Corners"><Row gap="md" wrap>{(["xs", "sm", "md", "lg", "xl"] as const).map((key) => <View key={key} style={{ alignItems: "center", gap: 4 }}><View style={{ width: 64, height: 64, borderRadius: shape.radius[key], borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.plane }} /><Text variant="micro" tone="faint">{key} {shape.radius[key]}</Text></View>)}</Row></Specimen>
      <Specimen label={`Elevation · ${material.label}`} note="Three levels of height. Each material expresses height differently: tone and soft shadow, hairlines, inlay, hard extrusion, plush depth, or flat paper.">
        <Row gap="xl" wrap align="flex-start">{(["plane", "raised", "float"] as const).map((level) => <Plane key={level} level={level} pad="lg" style={{ width: 200, height: 112 }}><Text variant="subheading">{level[0].toUpperCase() + level.slice(1)}</Text><Text variant="caption" tone="faint">{surface(level).boxShadow ? "Shadowed" : surface(level).borderWidth ? "Outlined" : "Tonal"}</Text></Plane>)}</Row>
      </Specimen>
      <Specimen label={`Marker · ${marker.label}`}><Row gap="lg"><Marker /><Marker scale={1.5} /><Marker breathing /><Meter value={4} max={7} label="Example" /></Row></Specimen>
    </Chapter>
  );
}

export function IconsChapter() {
  const { color, space } = useTheme();
  const [active, setActive] = useState(false);
  const names = ICON_NAMES as IconName[];
  return (
    <Chapter index="06" title="Line and light" lede="Original icons on a 20-unit grid. Most are a single line drawing with one filled mark, and that mark takes the theme's shape and lights up when active.">
      <Row gap="md"><Toggle label="Show active state" value={active} onChange={setActive} /><Text variant="small" tone="soft">Show active state</Text></Row>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {names.map((name) => <View key={name} style={{ width: 88, height: 76, alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name={name} size={22} active={active} color={color.ink} /><Text variant="micro" tone="faint" numberOfLines={1}>{name}</Text></View>)}
      </View>
    </Chapter>
  );
}

function PresetSpecimen({ id }: { id: (typeof PRESET_ORDER)[number] }) {
  const preset = THEME_PRESETS[id];
  return <ThemeScope axes={preset.axes}><PresetBody name={preset.name} tagline={preset.tagline} /></ThemeScope>;
}

function PresetBody({ name, tagline }: { name: string; tagline: string }) {
  const { color, shape, space, fonts, axes } = useTheme();
  const [seg, setSeg] = useState("a");
  return (
    <View style={{ backgroundColor: color.ground, borderRadius: shape.radius.xl, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.md, overflow: "hidden" }}>
      <Text variant="title">{name}</Text>
      <Text variant="small" tone="soft">{tagline}</Text>
      <Segmented label={`${name} sample`} value={seg} onChange={setSeg} options={[{ value: "a", label: "Read" }, { value: "b", label: "Solve" }, { value: "c", label: "Rest" }]} />
      <Plane level="raised" pad="md" behind={color.ground}><Text variant="readout">24:08</Text><Text variant="caption" tone="faint">{fonts.voice.label} · {fonts.interface.label} · {fonts.instrument.label}</Text></Plane>
      <Row gap="sm"><Button title="Begin" variant="emphasis" /><Button title="Later" /></Row>
      <Text variant="micro" tone="faint">{axes.shape} · {axes.material} · {axes.marker} · {axes.motion}</Text>
    </View>
  );
}

export function PersonalitiesChapter() {
  return (
    <Chapter index="07" title="Six personalities" lede="Each one is a different point across every axis: type, shape, material, marker, density, motion and icon drawing. Every control below is real and interactive.">
      <Columns max={3}>{PRESET_ORDER.map((id) => <PresetSpecimen key={id} id={id} />)}</Columns>
    </Chapter>
  );
}

const NOTE_LINES = ["Theorem. For z = a + bi,", "|z|² = z · z̄", "Handwriting, PDFs and formatting keep their own colors and fonts."];

export function DocumentsChapter() {
  const { preference } = useAppearance();
  const axes = useMemo(() => resolveAxes(preference), [preference]);
  return (
    <Chapter index="15" title="Your work stays yours" lede="Themes dress Sylf, not your documents. Notes, handwriting, PDFs and their formatting keep exactly what you gave them, whichever theme you use.">
      <Columns max={2}>
        {[
          <Specimen key="doc" label="Authored document" note="This surface reads nothing from the theme. Switch themes and it doesn't change.">
            <DocumentSurface paper="#fffef8" style={{ padding: 24, borderRadius: 2, minHeight: 200 }}>
              {NOTE_LINES.map((line) => <RNText key={line} style={{ color: "#1a1a2a", fontSize: 18, lineHeight: 28 }}>{line}</RNText>)}
            </DocumentSurface>
          </Specimen>,
          <Specimen key="chrome" label="Around it" note="The app around the document follows your theme.">
            <Callout title={`Using ${FONT_FAMILIES[axes.fontInterface].label}`} message="Controls, panels and navigation all change with the theme." />
          </Specimen>,
        ]}
      </Columns>
    </Chapter>
  );
}
