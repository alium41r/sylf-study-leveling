// Keys for the shell. Android and iOS deliver hardware keys to a focused text field only, so these need a native module, which is
// written down in the Spaces guide. The web build, which is the desktop app, has them in shell-keys.web.ts.
export interface DockKeyActions { toggle(): void; pauseOrResume(): void }
/** Shown in tooltips, so a key can be found. Nothing here has keys, so there is nothing to show. */
export const SPACES_SHORTCUT: string | undefined = undefined;
export const DOCK_SHORTCUT: string | undefined = undefined;
export const useSpaceKeys: (onDigit: (digit: string) => void) => void = () => undefined;
export const useDockKeys: (actions: DockKeyActions) => void = () => undefined;
