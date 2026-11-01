// Keyboard shortcuts exist where there is a global key event to listen to. See workspace-keys.web.ts. On Android, a hardware
// keyboard still reaches every control through focus. Global shortcuts wait for a native key module (master plan §3.3).
export interface WorkspaceKeyActions {
  openTool(index: number): void;
  closeFocused(): void;
  minimizeFocused(): void;
  cycle(direction: 1 | -1): void;
  layout(name: "free" | "focus" | "split" | "assistant"): void;
  fit(): void;
  reset(): void;
  frameFocused(): void;
  zoomIn(): void;
  zoomOut(): void;
  pan(dx: number, dy: number): void;
  quickSwitch(): void;
  leaveFocus(): boolean;
  hand(held: boolean): void;
}

export const useWorkspaceKeys: (actions: WorkspaceKeyActions) => void = () => undefined;
