import { useRef, useState } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { Activity, Avatar, Badge, Button, Callout, Checkbox, Chip, Columns, ContextArea, DateField, Dialog, Disclosure, Divider, EmptyState, IconButton, Keycap, Lift, ListRow, Marker, Menu, Meter, Placeholder, Plane, Popover, Progress, RadioGroup, Readout, Row, Segmented, Select, Sheet, Slider, Splitter, Stack, Text, TextField, Toggle, Tooltip, resolveDesign, todayKey, useAppearance, useInputFormat, useInputMode, useNotice, useTheme, useWindowClass, MOTION_CHARACTERS, resolveAxes, type ViewHandle } from "@sylf/design-system";
import { Chapter, Specimen } from "./chrome";

export function ControlsChapter() {
  const [toggle, setToggle] = useState(true);
  const [check, setCheck] = useState(true);
  const [radio, setRadio] = useState("deep");
  const [segment, setSegment] = useState("week");
  const [level, setLevel] = useState(0.4);
  const [steps, setSteps] = useState(3);
  const [chips, setChips] = useState(["Algebra"]);
  const [busy, setBusy] = useState(false);
  const toggleChip = (name: string) => setChips((list) => (list.includes(name) ? list.filter((c) => c !== name) : [...list, name]));
  return (
    <Chapter index="08" title="Controls" lede="Every control has the same states: rest, hover, press, keyboard focus, disabled and busy. They come from one primitive, so they feel alike and fail alike.">
      <Specimen label="Buttons"><Row gap="sm" wrap><Button title="Begin session" variant="emphasis" icon="play" /><Button title="Solid" variant="solid" /><Button title="Quiet" /><Button title="Ghost" variant="ghost" /><Button title="Remove" variant="critical" icon="trash" /></Row></Specimen>
      <Specimen label="States"><Row gap="sm" wrap><Button title="Small" size="small" /><Button title="Disabled" variant="emphasis" disabled /><Button title={busy ? "Working" : "Press to load"} variant="solid" busy={busy} onPress={() => { setBusy(true); setTimeout(() => setBusy(false), 1800); }} /><IconButton icon="pin" label="Pin" /><IconButton icon="bookmark" label="Saved" active /><IconButton icon="sliders" label="Disabled" disabled /></Row></Specimen>
      <Columns max={3}>
        {[
          <Specimen key="a" label="Segmented"><Segmented label="Range" value={segment} onChange={setSegment} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week", icon: "calendar" }, { value: "term", label: "Term" }]} /></Specimen>,
          <Specimen key="b" label="Toggle and checkbox"><Stack gap="md"><Row gap="md"><Toggle label="Notifications" value={toggle} onChange={setToggle} /><Text variant="small">Notifications</Text></Row><Row gap="md"><Toggle label="Disabled" value={false} onChange={() => undefined} disabled /><Text variant="small" tone="faint">Disabled</Text></Row><Checkbox label="Include past papers" value={check} onChange={setCheck} /></Stack></Specimen>,
          <Specimen key="c" label="Radio"><RadioGroup label="Session" value={radio} onChange={setRadio} options={[{ value: "sprint", label: "Sprint", detail: "25 minutes" }, { value: "deep", label: "Deep work", detail: "50 minutes" }]} /></Specimen>,
          <Specimen key="d" label="Slider"><Stack gap="md"><Slider label="Volume" value={level} onChange={setLevel} format={(v) => `${Math.round(v * 100)}%`} /><Slider label="Sessions" min={1} max={8} step={1} ticks value={steps} onChange={setSteps} /></Stack></Specimen>,
          <Specimen key="e" label="Chips"><Row gap="xs" wrap>{["Algebra", "Geometry", "Calculus"].map((name) => <Chip key={name} label={name} selected={chips.includes(name)} onPress={() => toggleChip(name)} />)}<Chip label="Tag" icon="pin" onRemove={() => undefined} /></Row></Specimen>,
          <Specimen key="f" label="Keys"><Row gap="md" wrap><Keycap keys="⌘+K" /><Keycap keys="Ctrl+1" /><Keycap keys="Esc" /></Row></Specimen>,
        ]}
      </Columns>
    </Chapter>
  );
}

export function FieldsChapter() {
  const [text, setText] = useState("");
  const [bad, setBad] = useState("not a color");
  const [area, setArea] = useState("");
  const [choice, setChoice] = useState("thu");
  const [day, setDay] = useState("");
  return (
    <Chapter index="09" title="Fields and lists" lede="Inputs are trays with a rule that grows on focus. Errors appear as text, never as color alone.">
      <Columns max={2}>
        {[
          <Stack key="a" gap="lg">
            <TextField label="Title" placeholder="Name this session" value={text} onChangeText={setText} helper="Shows in your history." />
            <TextField label="Search" hideLabel icon="search" placeholder="Search" />
            <TextField label="Accent hex" value={bad} onChangeText={setBad} error="Use a hex value such as #6E5BE6." monospace />
            <TextField label="Disabled" value="Locked by your plan" editable={false} />
            <TextField label="Notes" multiline placeholder="Multiple lines" value={area} onChangeText={setArea} />
            <Select label="Exam day" value={choice} onChange={setChoice} options={[{ value: "tue", label: "Tuesday" }, { value: "thu", label: "Thursday" }, { value: "sat", label: "Saturday" }]} />
            <DateField label="Exam date" optional value={day} onChange={setDay} min={todayKey()} helper="Opens the mini calendar." testID="showcase-date" />
          </Stack>,
          <Stack key="b" gap="xs">
            <ListRow title="Further mathematics" detail="Complex numbers" icon="notes" selected onPress={() => undefined} />
            <ListRow title="Physics" detail="Waves" icon="notes" onPress={() => undefined} value="12" />
            <ListRow title="Disabled row" icon="lock" disabled onPress={() => undefined} />
            <ListRow title="Static row" detail="Not interactive" trailing={<Badge label="New" tone="accent" />} />
            <Divider />
            <Disclosure title="What gets synced?" detail="Tap to expand" defaultOpen><Text variant="small" tone="soft">Disclosure content pushes the layout below it, and the chevron turns with the theme's motion.</Text></Disclosure>
            <Disclosure title="Advanced"><Text variant="small" tone="soft">More detail.</Text></Disclosure>
          </Stack>,
        ]}
      </Columns>
    </Chapter>
  );
}

export function OverlaysChapter() {
  const notice = useNotice();
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [popover, setPopover] = useState(false);
  const [menu, setMenu] = useState(false);
  const popAnchor = useRef<ViewHandle>(null);
  const menuAnchor = useRef<ViewHandle>(null);
  const { space, shape, color } = useTheme();
  return (
    <Chapter index="10" title="Things that float" lede="Overlays sit above everything, keep the theme they were opened from, and close top-first with Back, Escape, or a tap outside.">
      <Specimen label="Open each one"><Row gap="sm" wrap>
        <View ref={popAnchor} collapsable={false}><Button title="Popover" onPress={() => setPopover(true)} /></View>
        <View ref={menuAnchor} collapsable={false}><Button title="Menu" icon="more" onPress={() => setMenu(true)} /></View>
        <Button title="Sheet" onPress={() => setSheet(true)} />
        <Button title="Dialog" onPress={() => setDialog(true)} />
        <Button title="Notice" onPress={() => notice("Session saved", { tone: "positive", action: { label: "Undo", onPress: () => undefined } })} />
      </Row></Specimen>
      <Specimen label="Tooltip" note="Hover or focus on desktop, long press on touch."><Tooltip text="Pin to your shelf" shortcut="⌘P">{(handlers) => <IconButton icon="pin" label="Pin" {...handlers} />}</Tooltip></Specimen>
      <Specimen label="Context menu" note="Right-click, or long press on touch.">
        <ContextArea label="Example item" items={[{ key: "open", label: "Open", icon: "arrowRight", shortcut: "↵", onSelect: () => undefined }, { key: "copy", label: "Duplicate", icon: "copy", onSelect: () => undefined }, { key: "del", label: "Delete", icon: "trash", destructive: true, onSelect: () => undefined }]}>
          <View style={{ padding: space.lg, borderRadius: shape.radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: color.lineStrong, maxWidth: 320 }}><Text variant="small" tone="soft">Right-click or long press here</Text></View>
        </ContextArea>
      </Specimen>
      <Popover open={popover} anchor={popAnchor} onClose={() => setPopover(false)} label="Example popover" width={280}>
        <View style={{ padding: space.lg, gap: space.sm }}><Text variant="subheading">Points home</Text><Text variant="small" tone="soft">Where the theme allows it, the corner nearest its origin is tucked. No arrow needed.</Text></View>
      </Popover>
      <Menu open={menu} anchor={menuAnchor} onClose={() => setMenu(false)} label="Actions" items={[{ key: "a", label: "New session", icon: "plus", shortcut: "⌘N", onSelect: () => undefined }, { key: "b", label: "Pin", icon: "pin", selected: true, onSelect: () => undefined }, { key: "c", label: "Disabled", disabled: true, onSelect: () => undefined }, { key: "d", label: "Delete", icon: "trash", destructive: true, onSelect: () => undefined }]} />
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Session details" footer={<Button title="Done" variant="emphasis" fill onPress={() => setSheet(false)} />}>
        <View style={{ padding: space.lg, gap: space.md }}><Text tone="soft">A bottom sheet in compact windows, an edge panel otherwise. Drag it away, tap outside, or press Back or Escape.</Text><TextField label="Title" placeholder="Fields stay above the keyboard" /></View>
      </Sheet>
      <Dialog open={dialog} onClose={() => setDialog(false)} title="End this session?" message="Your progress so far will be saved." actions={[{ label: "Keep going", onPress: () => setDialog(false) }, { label: "End session", variant: "emphasis", onPress: () => setDialog(false) }]} />
    </Chapter>
  );
}

export function FeedbackChapter() {
  const [value, setValue] = useState(0.35);
  return (
    <Chapter index="11" title="Feedback" lede="Progress, status and waiting. Waiting breathes instead of spinning, and counts use discrete cells from the pixel lineage.">
      <Columns max={3}>
        {[
          <Specimen key="a" label="Progress"><Stack gap="md"><Progress value={value} label="Chapter" showValue /><Button title="Advance" size="small" onPress={() => setValue((v) => (v >= 1 ? 0 : Math.min(1, v + 0.2)))} /></Stack></Specimen>,
          <Specimen key="b" label="Meter"><Stack gap="sm"><Meter value={5} max={8} label="Sessions" /><Meter value={2} max={8} label="Warnings" tone="caution" /><Meter value={8} max={8} label="Done" tone="positive" /></Stack></Specimen>,
          <Specimen key="c" label="Readout"><Row gap="lg" wrap><Readout value="24:08" label="Remaining" /><Readout value="14" label="Level" /></Row></Specimen>,
          <Specimen key="d" label="Waiting"><Stack gap="sm"><Activity label="Loading" /><Placeholder width="80%" /><Placeholder width="60%" /><Placeholder width="70%" /></Stack></Specimen>,
          <Specimen key="e" label="Badges and people"><Stack gap="md"><Row gap="xs" wrap><Badge label="Neutral" /><Badge label="Accent" tone="accent" /><Badge label="Done" tone="positive" /><Badge label="Soon" tone="caution" /><Badge label="Late" tone="critical" /></Row><Row gap="md"><Avatar name="Maya Chen" presence="online" /><Avatar name="Sam Park" presence="focusing" /><Avatar name="Ari" /></Row></Stack></Specimen>,
          <Specimen key="f" label="Empty state"><Plane pad="sm"><EmptyState title="Nothing yet" message="When something arrives, it appears here." /></Plane></Specimen>,
        ]}
      </Columns>
      <Stack gap="sm"><Callout title="A note" message="Neutral information in the accent wash." /><Callout tone="positive" title="Saved" message="Everything is up to date." /><Callout tone="caution" title="Check this" message="Your exam date has passed." /><Callout tone="critical" title="Couldn't sync" message="Your work is safe on this device." /></Stack>
    </Chapter>
  );
}

function PaneLabel({ title, detail }: { title: string; detail: string }) {
  return <View style={{ flex: 1, padding: 16 }}><Text variant="subheading" numberOfLines={1}>{title}</Text><Text variant="caption" tone="faint" numberOfLines={2}>{detail}</Text></View>;
}

export function LayoutChapter() {
  const { size, width, height, landscape } = useWindowClass();
  const { color } = useTheme();
  const { fontScale, scale } = useWindowDimensions();
  const [stage, setStage] = useState({ width: 0, height: 260 });
  return (
    <Chapter index="12" title="Adaptive layout" lede="Layout follows the window, not the device. Resize the window, rotate the tablet, or enter split screen and the same system adapts.">
      <Row gap="xl" wrap><Readout value={size} label="Window class" /><Readout value={`${Math.round(width)}×${Math.round(height)}`} label="Window points" /><Readout value={landscape ? "Landscape" : "Portrait"} label="Orientation" /><Readout value={fontScale.toFixed(2)} label="System font scale" /><Readout value={scale.toFixed(2)} label="Pixel ratio" /></Row>
      <Specimen label="Columns" note="One column when compact, two when medium, three when expanded."><Columns max={3}>{["One", "Two", "Three"].map((name) => <Plane key={name} level="raised" pad="lg" behind={color.ground}><Text variant="subheading">{name}</Text></Plane>)}</Columns></Specimen>
      <Specimen label="Splitter" note="Drag with touch, pen or mouse. Arrow keys work on desktop. It snaps to thirds and halves."><Splitter first={<PaneLabel title="Source" detail="A resizable pane" />} second={<PaneLabel title="Notes" detail="Both panes keep a minimum width" />} height={180} /></Specimen>
      <Specimen label="Pick up and place" note="Lifts on contact, follows your finger, pen or mouse, and stays inside its area, even after rotation.">
        <View onLayout={(e) => setStage({ width: e.nativeEvent.layout.width, height: 260 })} style={{ height: 260, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: color.lineStrong, overflow: "hidden" }}>
          {stage.width ? <Lift container={stage} initial={{ x: 24, y: 24 }} size={{ width: 180, height: 96 }} label="Movable card"><PaneLabel title="Drag me" detail="Release near an edge" /></Lift> : null}
        </View>
      </Specimen>
    </Chapter>
  );
}

function Spring({ name, params }: { name: string; params: { damping: number; stiffness: number } }) {
  return <View style={{ minWidth: 120 }}><Text variant="caption" tone="soft">{name}</Text><Text variant="micro" tone="faint">d{params.damping} · k{params.stiffness}</Text></View>;
}

export function MotionChapter() {
  const { motion, axes, space } = useTheme();
  const [spot, setSpot] = useState(1);
  const [sheet, setSheet] = useState(false);
  const character = MOTION_CHARACTERS[axes.motion];
  return (
    <Chapter index="13" title="Motion with weight" lede="All movement comes from one system. Character sets the feel, intensity sets how much, and reduced motion always wins.">
      <Row gap="xl" wrap><Readout value={character.label} label="Character" /><Readout value={String(motion.amount)} label="Intensity" /><Readout value={motion.reduced ? "On" : "Off"} label="Reduced motion" /><Readout value={motion.steps ? `${motion.steps} fps` : "Continuous"} label="Quantization" /></Row>
      <Specimen label="Interruptible" note="Tap quickly between options. The marker retargets from wherever it is, without restarting."><Segmented label="Interruptible demo" value={String(spot)} onChange={(v) => setSpot(Number(v))} options={[0, 1, 2, 3, 4].map((i) => ({ value: String(i), label: ["Read", "Write", "Solve", "Review", "Rest"][i] }))} /></Specimen>
      <Specimen label="Springs"><Row gap="lg" wrap><Spring name="Settle" params={character.settle} /><Spring name="Lift" params={character.lift} /><Spring name="Glide" params={character.glide} /></Row></Specimen>
      <Specimen label="Arrival"><Button title="Bring in a surface" onPress={() => setSheet(true)} /></Specimen>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Arrived" width={360}><View style={{ padding: space.lg }}><Text tone="soft">This surface moved with the Glide spring, or a fade with reduced motion.</Text></View></Sheet>
    </Chapter>
  );
}

export function InputChapter() {
  const mode = useInputMode();
  const format = useInputFormat();
  const [events, setEvents] = useState<string[]>([]);
  const add = (line: string) => setEvents((list) => [line, ...list].slice(0, 6));
  return (
    <Chapter index="14" title="Every input" lede="Touch, stylus, mouse, trackpad and keyboard all reach the same primitives. Controls size for the device's main input, and focus rings appear for keyboards only.">
      <Row gap="xl" wrap><Readout value={mode} label="Last input" /><Readout value={format} label="Control sizing" /><Readout value={Platform.OS} label="Platform" /></Row>
      <Specimen label="Try it" note="Hover, press, Tab to focus, Space or Enter to activate.">
        <Row gap="sm" wrap>
          <Button title="Hover and press" variant="emphasis" onPress={() => add(`press · ${mode}`)} onHover={(h: boolean) => add(h ? "hover in" : "hover out")} onFocusChange={(f: boolean) => add(f ? "focus" : "blur")} onLongPress={() => add(`long press · ${mode}`)} />
          <Button title="Second" onPress={() => add(`press · ${mode}`)} />
          <Button title="Third" variant="ghost" onPress={() => add(`press · ${mode}`)} />
        </Row>
      </Specimen>
      <Specimen label="Event log"><Stack gap="xs">{events.length ? events.map((line, i) => <Text key={`${line}${i}`} variant="value" tone={i ? "faint" : "ink"}>{line}</Text>) : <Text variant="small" tone="faint">Interact with the controls above.</Text>}</Stack></Specimen>
    </Chapter>
  );
}

export function PerformanceProbe() {
  const { preference } = useAppearance();
  const [ms, setMs] = useState<number | null>(null);
  const run = () => {
    const axes = resolveAxes(preference);
    const start = Date.now();
    for (let i = 0; i < 100; i++) resolveDesign({ ...axes, accentHex: `#${((i * 2654435) & 0xffffff).toString(16).padStart(6, "0")}` }, { mode: i % 2 ? "dark" : "light" });
    setMs((Date.now() - start) / 100);
  };
  return <Row gap="md"><Button title="Measure theme resolve" size="small" onPress={run} /><Marker /><Text variant="value" tone="soft">{ms === null ? "not run" : `${ms.toFixed(2)} ms each`}</Text></Row>;
}
