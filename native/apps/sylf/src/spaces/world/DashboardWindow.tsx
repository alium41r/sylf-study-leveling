// A window onto Sylf World. It shows the World's own baked plates for the hour, layered the way the lobby layers them: the sky, a cloud, the sea of cloud and the
// gate standing in it. This is art, like the lobby's: authored plates that never follow the theme, drawn as still images (no gradient, no blur, nothing that
// moves). It lives in World's folder because World's art may only be imported from there, and Home loads it with import() when it first draws it. The card's text
// never goes over it, so contrast is never in question.
import { Image, View } from "react-native";
import { useTheme } from "@sylf/design-system";
import type { WorldSky } from "@sylf/spaces";
import { PLATE_SIZES, SKY_PLATES } from "./art/plates.generated";

const GATE_RATIO = PLATE_SIZES.gate.width / PLATE_SIZES.gate.height;
const SEA_RATIO = PLATE_SIZES.sea.width / PLATE_SIZES.sea.height;
const CLOUD_RATIO = PLATE_SIZES.cloudB.width / PLATE_SIZES.cloudB.height;

const fill = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, width: "100%", height: "100%" } as const;

export function DashboardWindow({ sky, width, height, bleed, gate = true, testID }: { sky: WorldSky; width?: number | `${number}%`; height?: number | `${number}%`; /** Edge to edge: the parent clips it, and it draws no frame. */ bleed?: boolean; gate?: boolean; testID?: string }) {
  const { color, shape } = useTheme();
  const plates = SKY_PLATES[sky];
  return (
    <View testID={testID} aria-hidden accessible={false} pointerEvents="none" style={[{ width: width ?? "100%", height: height ?? "100%", overflow: "hidden", backgroundColor: color.sunken }, bleed ? null : { borderRadius: shape.radius.md, borderWidth: 1, borderColor: color.line }]}>
      <Image source={plates.sky} resizeMode="cover" fadeDuration={0} style={fill} />
      <Image source={plates.cloudB} resizeMode="stretch" fadeDuration={0} style={{ position: "absolute", top: "10%", left: "6%", width: "36%", aspectRatio: CLOUD_RATIO, opacity: 0.92 }} />
      <Image source={plates.sea} resizeMode="stretch" fadeDuration={0} style={{ position: "absolute", bottom: 0, left: "-32%", width: "164%", aspectRatio: SEA_RATIO }} />
      {gate ? <Image source={plates.gate} resizeMode="contain" fadeDuration={0} style={{ position: "absolute", bottom: "-5%", alignSelf: "center", height: "110%", aspectRatio: GATE_RATIO }} /> : null}
    </View>
  );
}
