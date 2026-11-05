// A trackpad's two fingers pan, and its pinch arrives as a wheel event with the control key set, which is also how a mouse user
// zooms. React's wheel handlers are passive, so this listens directly. A wheel over a tool that can still scroll belongs to the
// tool, and so does one that marks itself with data-owns-wheel. Anything else belongs to the canvas, so the page itself can never
// scroll or zoom.
import { useEffect, useRef, type RefObject } from "react";
import type { ViewHandle } from "@sylf/design-system";
import type { WheelHandlers } from "./canvas-input";

const LINE = 16;
const REST_MS = 160;

function toolTakes(event: WheelEvent, root: HTMLElement, zooming: boolean) {
  for (let node = event.target as HTMLElement | null; node && node !== root; node = node.parentElement) {
    // A surface that pans or zooms itself (a whiteboard, a page being zoomed) claims the wheel outright.
    const owns = node.dataset?.ownsWheel;
    if (owns === "all" || (owns === "zoom" && zooming)) return true;
    if (zooming) continue;
    const style = getComputedStyle(node);
    const canY = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
    const canX = /(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1;
    if (canY && (event.deltaY < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1)) return true;
    if (canX && (event.deltaX < 0 ? node.scrollLeft > 0 : node.scrollLeft + node.clientWidth < node.scrollWidth - 1)) return true;
  }
  return false;
}

export function useCanvasWheel(target: RefObject<ViewHandle | null>, handlers: WheelHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const root = target.current as unknown as HTMLElement | null;
    if (!root) return;
    let rest: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (event: WheelEvent) => {
      const scale = event.deltaMode === 1 ? LINE : 1;
      const zooming = event.ctrlKey || event.metaKey;
      if (toolTakes(event, root, zooming)) return;
      event.preventDefault();
      if (zooming) {
        const box = root.getBoundingClientRect();
        latest.current.zoom(Math.exp(-event.deltaY * scale * 0.01), event.clientX - box.left, event.clientY - box.top);
      } else latest.current.pan(event.deltaX * scale, event.deltaY * scale);
      clearTimeout(rest);
      rest = setTimeout(() => latest.current.end(), REST_MS);
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => { clearTimeout(rest); root.removeEventListener("wheel", onWheel); };
  }, [target]);
}
