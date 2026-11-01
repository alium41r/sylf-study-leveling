// Every Command Center action has a key (master plan §3.3). None of these use the Command or Control modifier with a digit, which
// master plan §3.1 keeps for switching Spaces, and none fire while someone is typing. They are matched by physical key, because
// Option on a Mac turns letters into symbols.
import { useEffect, useRef } from "react";
import type { WorkspaceKeyActions } from "./workspace-keys";

const typing = () => {
  const element = document.activeElement as HTMLElement | null;
  return !!element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable);
};
const onControl = () => {
  const element = document.activeElement as HTMLElement | null;
  return !!element && element !== document.body && !!element.getAttribute("role");
};
const STEP = 112;

export function useWorkspaceKeys(actions: WorkspaceKeyActions) {
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const act = (event: KeyboardEvent, run: () => void) => { event.preventDefault(); run(); };
    const onKeyDown = (event: KeyboardEvent) => {
      const a = latest.current;
      if ((event.metaKey || event.ctrlKey) && event.code === "KeyK") return act(event, a.quickSwitch);
      if (event.metaKey || event.ctrlKey || typing()) return;
      if (event.altKey) {
        const digit = /^Digit(\d)$/.exec(event.code)?.[1];
        if (digit) return act(event, () => a.openTool((Number(digit) + 9) % 10));
        const run = { KeyW: a.closeFocused, KeyM: a.minimizeFocused, BracketRight: () => a.cycle(1), BracketLeft: () => a.cycle(-1), KeyF: () => a.layout("focus"), KeyS: () => a.layout("split"), KeyA: () => a.layout("assistant"), KeyD: () => a.layout("free") }[event.code];
        if (run) act(event, run);
        return;
      }
      if (event.shiftKey && event.code === "Digit1") return act(event, a.fit);
      if (event.shiftKey && event.code === "Digit2") return act(event, a.frameFocused);
      if (event.shiftKey && event.code === "Digit0") return act(event, a.reset);
      if (event.key === "+" || event.key === "=") return act(event, a.zoomIn);
      if (event.key === "-") return act(event, a.zoomOut);
      if (event.key === "Escape" && a.leaveFocus()) return void event.preventDefault();
      if (event.code === "Space" && !onControl()) { if (!event.repeat) a.hand(true); return void event.preventDefault(); }
      if (onControl()) return;
      const arrow = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }[event.key];
      if (arrow) act(event, () => a.pan(arrow[0], arrow[1]));
    };
    const onKeyUp = (event: KeyboardEvent) => { if (event.code === "Space") latest.current.hand(false); };
    const onBlur = () => latest.current.hand(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("blur", onBlur); };
  }, []);
}
