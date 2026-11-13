// Small paper previews share the same geometry as the editor. The theme draws the frame around the paper.
import { memo, useId, useMemo } from "react";
import Svg, { Circle, Defs, Path, Pattern, Rect, Text as SvgText } from "react-native-svg";
import { inkOutline, type InkPaper } from "@sylf/shared";
import { contrast, DOCUMENT_DEFAULTS } from "@sylf/design-system";

const LIGHT_INK = "#f6f4ef";
export const paperInk = (ground: string) => contrast(LIGHT_INK, ground) > contrast(DOCUMENT_DEFAULTS.ink, ground) ? LIGHT_INK : DOCUMENT_DEFAULTS.ink;

export const PaperArt = memo(function PaperArt({ paper, width = 480, height = 660, crop = height }: { paper: InkPaper; width?: number; height?: number; crop?: number }) {
  const id = `paper-${useId().replace(/[^a-z0-9]/gi, "")}`;
  const { color, rule, template, spacing } = paper;
  const geometry = useMemo(() => template === "dotted" ? null : inkOutline.paperGeometry(
    { color, rule, template, spacing }, width, height, { x: 0, y: 0, width, height: crop },
  ), [color, rule, template, spacing, width, height, crop]);
  const lines = useMemo(() => geometry?.lines.map(([x, y, x2, y2]) => `M${x} ${y}L${x2} ${y2}`).join(" "), [geometry]);
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${crop}`} preserveAspectRatio="xMinYMin meet" accessible={false}>
      <Rect width={width} height={crop} fill={color} />
      {template === "dotted" ? (
        <>
          <Defs><Pattern id={id} patternUnits="userSpaceOnUse" width={spacing} height={spacing}>
            <Circle cx={spacing / 2} cy={spacing / 2} r={2} fill={rule} />
          </Pattern></Defs>
          <Rect x={spacing / 2} y={spacing / 2} width={width} height={crop} fill={`url(#${id})`} />
        </>
      ) : null}
      {lines ? <Path d={lines} stroke={rule} strokeWidth={2} /> : null}
      {geometry?.labels.map(([label, x, y]) => (
        <SvgText key={`${x}:${y}`} x={x} y={y} fill={inkOutline.paperLabelColor(paper)} fontSize={14} fontWeight="600">{label}</SvgText>
      ))}
    </Svg>
  );
});
