// Web and desktop: faces load on demand, so a session only pays for the personality it is wearing.
import * as Font from "expo-font";

const SOURCES: Record<string, number> = {
  "AlegreyaSans-Medium": require("../../assets/fonts/AlegreyaSans-Medium.ttf"),
  "AlegreyaSans-Regular": require("../../assets/fonts/AlegreyaSans-Regular.ttf"),
  "Cinzel-Regular": require("../../assets/fonts/Cinzel-Regular.ttf"),
  "Cinzel-SemiBold": require("../../assets/fonts/Cinzel-SemiBold.ttf"),
  "Fraunces-Regular": require("../../assets/fonts/Fraunces-Regular.ttf"),
  "Fraunces-SemiBold": require("../../assets/fonts/Fraunces-SemiBold.ttf"),
  "IBMPlexMono-Light": require("../../assets/fonts/IBMPlexMono-Light.ttf"),
  "IBMPlexMono-Regular": require("../../assets/fonts/IBMPlexMono-Regular.ttf"),
  "IBMPlexSans-Regular": require("../../assets/fonts/IBMPlexSans-Regular.ttf"),
  "IBMPlexSans-SemiBold": require("../../assets/fonts/IBMPlexSans-SemiBold.ttf"),
  "InstrumentSans-Medium": require("../../assets/fonts/InstrumentSans-Medium.ttf"),
  "InstrumentSans-Regular": require("../../assets/fonts/InstrumentSans-Regular.ttf"),
  "InstrumentSans-SemiBold": require("../../assets/fonts/InstrumentSans-SemiBold.ttf"),
  "Jersey10-Regular": require("../../assets/fonts/Jersey10-Regular.ttf"),
  "Literata-Italic": require("../../assets/fonts/Literata-Italic.ttf"),
  "Literata-Regular": require("../../assets/fonts/Literata-Regular.ttf"),
  "Literata-SemiBold": require("../../assets/fonts/Literata-SemiBold.ttf"),
  "Newsreader-Italic": require("../../assets/fonts/Newsreader-Italic.ttf"),
  "Newsreader-Regular": require("../../assets/fonts/Newsreader-Regular.ttf"),
  "Nunito-Bold": require("../../assets/fonts/Nunito-Bold.ttf"),
  "Nunito-Regular": require("../../assets/fonts/Nunito-Regular.ttf"),
  "Nunito-SemiBold": require("../../assets/fonts/Nunito-SemiBold.ttf"),
  "PixelifySans-Regular": require("../../assets/fonts/PixelifySans-Regular.ttf"),
  "PixelifySans-SemiBold": require("../../assets/fonts/PixelifySans-SemiBold.ttf"),
  "SpaceGrotesk-Medium": require("../../assets/fonts/SpaceGrotesk-Medium.ttf"),
  "SpaceGrotesk-Regular": require("../../assets/fonts/SpaceGrotesk-Regular.ttf"),
  "SpaceGrotesk-SemiBold": require("../../assets/fonts/SpaceGrotesk-SemiBold.ttf"),
  "SplineSansMono-Light": require("../../assets/fonts/SplineSansMono-Light.ttf"),
  "SplineSansMono-Medium": require("../../assets/fonts/SplineSansMono-Medium.ttf"),
  "SplineSansMono-Regular": require("../../assets/fonts/SplineSansMono-Regular.ttf"),
};

const loaded = new Set<string>();

export const fontsReady = (): boolean => false;

export async function loadFonts(faces: string[]): Promise<void> {
  const missing = faces.filter((face) => !loaded.has(face) && SOURCES[face]);
  if (!missing.length) return;
  await Font.loadAsync(Object.fromEntries(missing.map((face) => [face, SOURCES[face]])));
  missing.forEach((face) => loaded.add(face));
}
