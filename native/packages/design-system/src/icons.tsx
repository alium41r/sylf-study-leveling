// Sylf's original icon set, drawn on a 20-unit grid. Each glyph is a line drawing plus (usually) exactly one filled
// mark: the system's Marker in miniature. It takes the theme's marker shape, and lights up in the accent when active.
import { memo } from "react";
import Svg, { Path, Rect } from "react-native-svg";
import { useTheme } from "./theme/context";

interface Glyph { d: string; mark?: [number, number] }

const glyphs = {
  today: { d: "M2.5 14.5h15M5.5 14.5a4.5 4.5 0 0 1 9 0M4.5 17.5h11", mark: [10, 5] },
  focus: { d: "M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4", mark: [10, 10] },
  circle: { d: "M12.5 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM12.5 5.2a5 5 0 0 1 0 9.6", mark: [14.75, 10] },
  progress: { d: "M4 17.5v-5M10 17.5V8.5M16 17.5V6.5", mark: [16, 3] },
  notes: { d: "M4.5 2.5h7.5l3.5 3.5v11.5h-11ZM12 2.5V6h3.5M9.5 10.5h3.5M7 14h6", mark: [7.25, 10.5] },
  pdf: { d: "M4.5 17.5v-15h7.5l3.5 3.5v11.5ZM12 2.5V6h3.5M7 6.5h2M7 14.5h6", mark: [10, 10.5] },
  whiteboard: { d: "M2.5 3.5h15v10h-15ZM7.5 13.5l-2 4M12.5 13.5l2 4M6 7.5h4", mark: [13.5, 9.5] },
  planner: { d: "M8.5 5h9M8.5 10h9M8.5 15h9M3 14h2.5v2.5H3ZM3 9h2.5v2.5H3Z", mark: [4.25, 5] },
  calendar: { d: "M3 5h14v12.5H3ZM3 9h14M7 2.5V6M13 2.5V6", mark: [12.5, 13] },
  timer: { d: "M16.5 11.25a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM8 2.5h4M10 4.75v2.5", mark: [10, 11.25] },
  sylvie: { d: "M9 4c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z", mark: [15.5, 3.5] },
  calculator: { d: "M4.5 2.5h11v15h-11ZM7.5 6h5M7.5 10h.8M7.5 14h.8M11.7 14h.8", mark: [12, 10] },
  audio: { d: "M3.5 8v4M7 5v10M10.5 7.5v5M14 8.5v3M17 9.25v1.5", mark: [14, 5] },
  resources: { d: "M3 7h14v10.5H3ZM5 7V4.5h10V7M7.5 2.5h5", mark: [10, 12] },
  spaces: { d: "M3 3h6v6H3ZM11 11h6v6h-6ZM3 11h6v6H3Z", mark: [14, 6] },
  // One grid, three positions: the mark shows which Space is current (`spaces` itself is Workspace's position), so the
  // closed switcher still says where you are.
  spacesHome: { d: "M11 3h6v6h-6ZM11 11h6v6h-6ZM3 11h6v6H3Z", mark: [6, 6] },
  spacesWorld: { d: "M3 3h6v6H3ZM11 3h6v6h-6ZM3 11h6v6H3Z", mark: [14, 14] },
  home: { d: "M2.5 10L10 3.5l7.5 6.5M4.5 8.5v9h11v-9", mark: [10, 13] },
  workspace: { d: "M2.5 3.5h15v10h-15ZM7 16.5h6", mark: [13.5, 7.5] },
  world: { d: "M2.5 10.5h15M4.5 10.5l2.5 4h2l1 3 1-3h2l2.5-4", mark: [10, 5.5] },
  plus: { d: "M10 3.5v13M3.5 10h13" },
  minus: { d: "M3.5 10h13" },
  close: { d: "M4.5 4.5l11 11M15.5 4.5l-11 11" },
  check: { d: "M3.5 10.5l4.5 4.5 8.5-10" },
  chevronLeft: { d: "M12.5 4l-6 6 6 6" },
  chevronRight: { d: "M7.5 4l6 6-6 6" },
  chevronUp: { d: "M4 12.5l6-6 6 6" },
  chevronDown: { d: "M4 7.5l6 6 6-6" },
  arrowRight: { d: "M3 10h13.5M11 4.5l5.5 5.5-5.5 5.5" },
  search: { d: "M14 8.75a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0ZM12.5 12.5l5 5", mark: [8.75, 8.75] },
  sliders: { d: "M2.5 6h7M14 6h3.5M2.5 14h3M10 14h7.5", mark: [11.75, 6] },
  more: { d: "", mark: [10, 10] },
  pin: { d: "M7 2.5h6l-.8 6 2.8 3H5l2.8-3ZM10 11.5v6" },
  split: { d: "M2.5 3.5h15v13h-15ZM10 3.5v13" },
  float: { d: "M2.5 3.5h15v13h-15ZM9.5 9.5h5.5v4.5H9.5Z" },
  expand: { d: "M11.5 8.5l6-6M12.5 2.5h5v5M8.5 11.5l-6 6M7.5 17.5h-5v-5" },
  collapse: { d: "M17.5 2.5l-6 6M11.5 3.5v5h5M2.5 17.5l6-6M8.5 16.5v-5h-5" },
  grip: { d: "M7 4.5v.01M13 4.5v.01M7 10v.01M13 10v.01M7 15.5v.01M13 15.5v.01" },
  play: { d: "M5.5 3.5l11 6.5-11 6.5Z" },
  pause: { d: "M6.5 3.5v13M13.5 3.5v13" },
  stop: { d: "M4.5 4.5h11v11h-11Z" },
  sun: { d: "M13.5 10a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.5 1.5M14.2 14.2l1.5 1.5M4.3 15.7l1.5-1.5M14.2 5.8l1.5-1.5" },
  moon: { d: "M16.5 11.8A7 7 0 0 1 8.2 3.5a7 7 0 1 0 8.3 8.3Z", mark: [14.5, 4.5] },
  auto: { d: "M16.5 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM10 3.5v13", mark: [13, 10] },
  palette: { d: "M10 2.5a7.5 7.5 0 1 0 0 15c1.4 0 1.9-1 1.5-2-.5-1.3.2-2.5 1.6-2.5H15c1.5 0 2.5-1.2 2.5-2.8 0-4-3.3-7.7-7.5-7.7Z", mark: [7, 8] },
  type: { d: "M3 16.5L8 3.5l5 13M4.8 12h6.4M14.5 11.5h3v5h-3Z" },
  corner: { d: "M3 17V10a7 7 0 0 1 7-7h7", mark: [13.5, 13.5] },
  layers: { d: "M10 2.5l7.5 4-7.5 4-7.5-4ZM2.5 10.5l7.5 4 7.5-4M2.5 14l7.5 4 7.5-4" },
  motion: { d: "M2.5 6.5h9M2.5 10h6M2.5 13.5h9", mark: [15.5, 10] },
  density: { d: "M3 4.5h14M3 8.5h14M3 12.5h14M3 16.5h14" },
  pen: { d: "M12.5 3.5l4 4L7 17H3v-4ZM10.5 5.5l4 4" },
  eraser: { d: "M7 17.5h10M11.5 3.5l5.5 5.5-8.5 8.5H6L3 14.5Z" },
  lock: { d: "M4 9h12v8.5H4ZM6.5 9V6.5a3.5 3.5 0 0 1 7 0V9", mark: [10, 13.25] },
  bell: { d: "M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 2h-13ZM8.5 18h3" },
  info: { d: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM10 9.5v5", mark: [10, 6.5] },
  warning: { d: "M10 3l8 14H2ZM10 8.5v4", mark: [10, 14.75] },
  undo: { d: "M4 7.5h8.5a4.5 4.5 0 0 1 0 9H7M7.5 4L4 7.5 7.5 11" },
  redo: { d: "M16 7.5H7.5a4.5 4.5 0 0 0 0 9H13M12.5 4L16 7.5 12.5 11" },
  trash: { d: "M3 5.5h14M7.5 5.5v-3h5v3M4.5 5.5l1 12h9l1-12" },
  copy: { d: "M7 7h10.5v10.5H7ZM13 7V2.5H2.5V13H7" },
  bookmark: { d: "M5 2.5h10v15l-5-4-5 4Z" },
  reset: { d: "M3.5 10a6.5 6.5 0 1 0 2-4.7L3.5 7M3.5 3v4h4" },
  eye: { d: "M2 10s3-5.5 8-5.5 8 5.5 8 5.5-3 5.5-8 5.5S2 10 2 10Z", mark: [10, 10] },
  keyboard: { d: "M2 5h16v10.5H2ZM5.5 12.5h9M5.5 8.5h.8M9.6 8.5h.8M13.7 8.5h.8" },
  pointer: { d: "M4.5 3l10.5 7-5 1-2.5 4.5Z" },
  touch: { d: "M8 9V4a1.5 1.5 0 0 1 3 0v5l4.5 1.5a1.5 1.5 0 0 1 1 1.6L16 17.5H8.5L4.5 12a1.4 1.4 0 0 1 2-1.8L8 11.5" },
  // Notes, PDFs and Whiteboard (Phase 14).
  highlighter: { d: "M11 3.5l5.5 5.5-6 6H7v-3.5ZM7 15l-2.5 2.5M3 17.5h14" },
  lasso: { d: "M10 3c4.4 0 7.5 2 7.5 4.75S14.4 12.5 10 12.5 2.5 10.5 2.5 7.75 5.6 3 10 3ZM5.5 11.5c-1 1.5-.5 3 1 3.5s1.5 2 0 3", mark: [6.5, 18] },
  shapes: { d: "M2.5 9.5L6.5 3l4 6.5ZM11.5 11.5h6v6h-6ZM9.5 14.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" },
  bold: { d: "M5.5 3.5h5a3.25 3.25 0 0 1 0 6.5h-5ZM5.5 10h6a3.25 3.25 0 0 1 0 6.5h-6Z" },
  italic: { d: "M8.5 3.5h7M4.5 16.5h7M12 3.5l-4 13" },
  underline: { d: "M5.5 3v6a4.5 4.5 0 0 0 9 0V3M4 17.5h12" },
  strike: { d: "M14.5 5.5c-.8-1.5-2.4-2.5-4.5-2.5-2.5 0-4.5 1.4-4.5 3.5 0 4.5 9 2.5 9 7 0 2.1-2 3.5-4.5 3.5-2.2 0-3.9-1-4.7-2.6M3 10h14" },
  heading: { d: "M4 3.5v13M12 3.5v13M4 10h8M15 9l2-1.5v9" },
  bulletList: { d: "M8 5h9.5M8 10h9.5M8 15h9.5", mark: [4, 5] },
  numberList: { d: "M8 5h9.5M8 10h9.5M8 15h9.5M3 3.5l1.5-1v5M2.5 12.5c.5-1 2.5-1 2.5.5S2.5 15 2.5 16.5H5" },
  checkList: { d: "M9 5h8.5M9 14h8.5M2.5 3h4v4h-4ZM2.5 12h4v4h-4ZM3.5 5l1 1 2-2.5" },
  quote: { d: "M3 4.5v11M7 6.5h10M7 10h10M7 13.5h6" },
  code: { d: "M7 5l-4.5 5L7 15M13 5l4.5 5-4.5 5M11.5 3.5l-3 13" },
  pagePlus: { d: "M4.5 2.5h7.5l3.5 3.5v11.5h-11ZM12 2.5V6h3.5M10 9v6M7 12h6" },
  fileImport: { d: "M4.5 9V2.5h7.5l3.5 3.5v11.5H10M12 2.5V6h3.5M2.5 14h6M6 11.5l2.5 2.5L6 16.5" },
  folder: { d: "M2.5 5h5.5l1.5 2h8v9.5h-15Z", mark: [14, 13] },
  hand: { d: "M6 10V5a1.25 1.25 0 0 1 2.5 0v4M8.5 9V3.75a1.25 1.25 0 0 1 2.5 0V9M11 9V4.75a1.25 1.25 0 0 1 2.5 0V10M13.5 9.5V7a1.25 1.25 0 0 1 2.5 0v5.5a5.5 5.5 0 0 1-5.5 5.5H10a5 5 0 0 1-4.3-2.5L3.3 12a1.3 1.3 0 0 1 2.2-1.3L6 11.5" },
  image: { d: "M2.5 4h15v12h-15ZM2.5 13l4.5-4.5 3.5 3.5 2-2 5 5", mark: [13.5, 7.5] },
  modeType: { d: "M4 5.5V4h12v1.5M10 4v12M7.5 16h5" },
  fit: { d: "M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4M7 7h6v6H7Z" },
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof glyphs;
export const ICON_NAMES = Object.keys(glyphs) as IconName[];

export interface IconProps { name: IconName; size?: number; color?: string; active?: boolean; markColor?: string }

export const Icon = memo(function Icon({ name, size = 20, color, active, markColor }: IconProps) {
  const theme = useTheme();
  const stroke = color ?? theme.color.ink;
  const glyph: Glyph = glyphs[name];
  const fill = markColor ?? (active ? theme.color.accent.mote : stroke);
  const { marker, icon } = theme;
  const pixel = name === "more" ? 2.4 : Math.max(2.2, icon.stroke + 0.8);
  const mark = (x: number, y: number, key: string) => (
    <Rect key={key} x={x - pixel / 2} y={y - pixel / 2} width={pixel} height={pixel} rx={marker.radius > 1 ? pixel / 2 : 0} fill={fill} transform={marker.rotate ? `rotate(${marker.rotate} ${x} ${y})` : undefined} />
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      {glyph.d ? <Path d={glyph.d} stroke={stroke} strokeWidth={icon.stroke} strokeLinecap={icon.cap} strokeLinejoin={icon.join} /> : null}
      {name === "more" ? [mark(4, 10, "a"), mark(10, 10, "b"), mark(16, 10, "c")] : glyph.mark ? mark(glyph.mark[0], glyph.mark[1], "m") : null}
    </Svg>
  );
});

/** The Sylf mark: a sprout holding one point of light, reduced from the companion's leaf. */
export function SylfMark({ size = 24, color }: { size?: number; color?: string }) {
  const theme = useTheme();
  const ink = color ?? theme.color.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <Path d="M12 21V11.5" stroke={ink} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M12 13.5C7 13.5 3.8 10.4 3 5.5c5 .2 8.4 3 9 8Z" fill={ink} />
      <Path d="M12 10.5c.4-4.3 3.2-7.1 9-7.8-.3 5.1-3.6 8-9 7.8Z" stroke={ink} strokeWidth={1.4} strokeLinejoin="round" />
      <Rect x={15.6} y={15.6} width={3.2} height={3.2} rx={theme.marker.radius > 1 ? 1.6 : 0} fill={theme.color.accent.mote} transform={theme.marker.rotate ? `rotate(${theme.marker.rotate} 17.2 17.2)` : undefined} />
    </Svg>
  );
}
