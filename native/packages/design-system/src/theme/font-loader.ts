// Native: fonts are embedded at build time by the expo-font config plugin, so they exist before the first frame.
export const fontsReady = (): boolean => true;
export const loadFonts: (faces: string[]) => Promise<void> = () => Promise.resolve();
