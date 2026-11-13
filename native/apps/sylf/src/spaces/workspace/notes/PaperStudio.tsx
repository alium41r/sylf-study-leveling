import { useEffect, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Chip, Icon, Press, Segmented, Sheet, Text, Tooltip, useControlHeight, useTheme } from "@sylf/design-system";
import { PAPER_TEMPLATES, paperFor, type PageFlow, type PaperTemplate } from "@sylf/notes";
import type { InkPaper } from "@sylf/shared";
import { PaperArt, paperInk } from "./PaperArt";
import { PAPERS, spacingsFor, type Spacing } from "./note-style";

type Tab = "page" | "template";
const TABS = [{ value: "page", label: "Page", icon: "paper" }, { value: "template", label: "Template", icon: "notes" }] as const;
const CATEGORIES = ["Basic", "Academic", "Planners", "Journals"] as const;
type Category = typeof CATEGORIES[number];
const LABELS: Partial<Record<PaperTemplate, string>> = { blank: "Blank page", ruled: "Lined", dotted: "Dot", daily: "Daily planner", weekly: "Weekly planner" };
const BASIC = ["blank", "ruled", "grid", "dotted"] as const;
const CATEGORY_PAPERS: Record<Category, readonly PaperTemplate[]> = { Basic: BASIC, Academic: ["cornell", "music"], Planners: ["daily", "weekly"], Journals: ["journal"] };
const SPACING_LABELS: Record<Spacing, string> = { narrow: "Narrow", medium: "Standard", wide: "Wide" };

export function PaperStudio({ open, onClose, title, header, page, templates }: { open: boolean; onClose(): void; title: string; header?: ReactNode; page: ReactNode; templates: ReactNode }) {
  const { space, color, shape } = useTheme();
  const [tab, setTab] = useState<Tab>("page");
  useEffect(() => { if (open) setTab("page"); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={title} width={564}
      footer={<View style={{ backgroundColor: color.sunken, borderRadius: shape.radius.md, paddingHorizontal: space.xs, paddingTop: space.xs }}>
        <Segmented label="Note style sections" value={tab} onChange={setTab} options={TABS.map((item) => ({ ...item }))} fit />
      </View>}>
      {header ? <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>{header}</View> : null}
      <ScrollView key={tab} style={{ flexShrink: 1 }} contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.xl }} keyboardShouldPersistTaps="handled" testID="paper-studio">
        {tab === "page" ? page : templates}
      </ScrollView>
    </Sheet>
  );
}

export function PaperFlow({ value, onChange }: { value: PageFlow; onChange(flow: PageFlow): void }) {
  const theme = useTheme();
  const { color, shape, space } = theme;
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="subheading">Pages</Text>
      <View role="radiogroup" aria-label="Page flow" style={{ flexDirection: "row", gap: space.sm }}>
        {(["pages", "endless"] as const).map((flow) => {
          const separate = flow === "pages", selected = flow === value;
          const label = separate ? "Separate pages" : "Endless";
          return (
            <Press key={flow} label={label} role="radio" checked={selected} onPress={() => onChange(flow)}
              radius={shape.radius.md} style={{ flex: 1, minWidth: 0 }} bodyStyle={[theme.surface("raised", "md"), { flex: 1, alignItems: "center", gap: space.sm, padding: space.md, backgroundColor: selected ? color.selected : color.plane, borderWidth: 1, borderColor: selected ? color.accent.line : color.line }]}>
              <View accessible={false} style={{ width: "63%", maxWidth: 80, height: 110, gap: separate ? space.xs : 0 }}>
                {[0, 1].map((part) => (
                  <View key={part} style={{ flex: part ? 0.56 : 1, gap: space.xs, padding: space.sm, backgroundColor: color.sunken, borderWidth: 1,
                    borderColor: selected ? color.accent.line : color.lineStrong, borderRadius: shape.radius.xs,
                    ...(separate ? null : part ? { borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 } : { borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }) }}>
                    <View style={{ width: "86%", height: space.hair, backgroundColor: color.inkSoft, opacity: 0.52 }} />
                    <View style={{ width: part ? "48%" : "65%", height: space.hair, backgroundColor: color.inkSoft, opacity: 0.34 }} />
                    {!part ? <View style={{ width: "48%", height: space.hair, backgroundColor: color.inkSoft, opacity: 0.34 }} /> : null}
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs }}>
                {selected ? <Icon name="check" size={14} color={color.accent.ink} /> : null}
                <Text variant="label" align="center" style={{ flexShrink: 1 }}>{label}</Text>
              </View>
              <Text variant="caption" tone="soft" align="center">{separate ? "Individual sheets" : "One growing canvas"}</Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

export function PaperColors({ paper, onChoose }: { paper: InkPaper; onChoose(paper: { color: string; rule: string }): void }) {
  const { space, shape, color } = useTheme();
  const height = Math.max(useControlHeight(), 44);
  const [width, setWidth] = useState(0);
  const columns = Math.max(3, Math.min(6, Math.floor((width + space.xs) / (height + space.xs))));
  const swatchWidth = Math.floor((width - (columns - 1) * space.xs) / columns);
  const selected = PAPERS.find((item) => item.color === paper.color)?.label ?? "Custom";
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
        <Text variant="subheading">Paper colour</Text>
        <Text variant="caption" tone="soft">{selected}</Text>
      </View>
      <View role="radiogroup" aria-label="Paper colour" onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {width > 0 ? PAPERS.map((item) => {
          const active = paper.color === item.color;
          return (
            <Tooltip key={item.color} text={item.label}>
              {(tooltip) => <Press {...tooltip} label={`${item.label} paper`} role="radio" checked={active} onPress={() => onChoose({ color: item.color, rule: item.rule })}
                height={height} radius={shape.radius.sm} style={{ width: swatchWidth }}
                bodyStyle={{ height, alignItems: "center", justifyContent: "center", backgroundColor: item.color, borderWidth: active ? 2 : 1, borderColor: active ? color.accent.line : color.lineStrong, borderRadius: shape.radius.sm }}>
                {active ? <Icon name="check" size={18} color={paperInk(item.color)} /> : null}
              </Press>}
            </Tooltip>
          );
        }) : null}
      </View>
    </View>
  );
}

function categoryFor(template: PaperTemplate): Category {
  return CATEGORIES.find((category) => CATEGORY_PAPERS[category].includes(template)) ?? "Basic";
}

export function PaperTemplates({ paper, spacing, onChoose, accessory }: { paper: InkPaper; spacing: Spacing; onChoose(template: PaperTemplate, spacing: Spacing): void; accessory?: ReactNode }) {
  const { space, shape, color } = useTheme();
  const [category, setCategory] = useState(() => categoryFor(paper.template));
  const [width, setWidth] = useState(0);
  const compact = width > 0 && width < 245;
  const columns = compact ? 2 : 3;
  const tileWidth = Math.max(0, Math.floor((width - space.md * (columns - 1)) / columns));
  const variants = CATEGORY_PAPERS[category].flatMap((template) => {
    const name = LABELS[template] ?? PAPER_TEMPLATES.find((item) => item.id === template)?.label ?? template;
    const spacings: Spacing[] = category === "Basic" && template !== "blank" ? ["medium", "narrow", "wide"] : [template === paper.template ? spacing : "medium"];
    return spacings.map((value) => ({ template, spacing: value, label: spacings.length > 1 && value !== "medium" ? `${name} (${value})` : name }));
  });

  return (
    <View style={{ gap: space.lg }}>
      <View role="radiogroup" aria-label="Template categories" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {CATEGORIES.map((name) => <Chip key={name} label={name} selected={name === category} radio onPress={() => setCategory(name)} />)}
      </View>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} role="radiogroup" aria-label="Paper templates"
        style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: space.lg }}>
        {width > 0 ? variants.map((variant) => {
          const active = paper.template === variant.template && (variant.template === "blank" || spacing === variant.spacing);
          const sample = { ...paperFor(variant.template), color: paper.color, rule: paper.rule, spacing: spacingsFor(variant.template)[variant.spacing] };
          return (
            <Press key={`${variant.template}-${variant.spacing}`} label={variant.label} role="radio" checked={active} radius={shape.radius.md}
              testID={`paper-template-${variant.template}-${variant.spacing}`} style={{ width: tileWidth }} bodyStyle={{ gap: space.sm }}
              onPress={() => onChoose(variant.template, variant.spacing)}>
              <View style={{ alignSelf: "center", width: "100%", maxWidth: 122, aspectRatio: 480 / 660, backgroundColor: paper.color, borderRadius: shape.radius.sm, overflow: "hidden", borderWidth: active ? 2 : 1, borderColor: active ? color.accent.line : color.lineStrong }}>
                <PaperArt paper={sample} />
                {active ? <View style={{ position: "absolute", right: space.xs, bottom: space.xs, width: 22, height: 22, borderRadius: shape.radius.xs, alignItems: "center", justifyContent: "center", backgroundColor: color.accent.fill }}>
                  <Icon name="check" size={14} color={color.accent.on} />
                </View> : null}
              </View>
              <Text variant="label" align="center" numberOfLines={2} tone={active ? "accent" : "ink"}>{variant.label}</Text>
            </Press>
          );
        }) : null}
      </View>
      {category !== "Basic" && categoryFor(paper.template) === category ? (
        <View style={{ gap: space.sm }}>
          <Text variant="label" tone="soft">Line spacing</Text>
          <Segmented label="Line spacing" value={spacing} onChange={(value) => onChoose(paper.template, value)}
            options={(Object.keys(SPACING_LABELS) as Spacing[]).map((value) => ({ value, label: SPACING_LABELS[value] }))} fit />
        </View>
      ) : null}
      {accessory}
    </View>
  );
}
