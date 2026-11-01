// Overlays stack. Back and Escape must close only the topmost one, on every platform.
import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

const stack: { current: () => void }[] = [];
let installed = false;

function closeTop() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.current();
  return true;
}

function install() {
  if (installed) return;
  installed = true;
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.addEventListener("keydown", (event) => { if (event.key === "Escape" && closeTop()) { event.preventDefault(); event.stopPropagation(); } }, true);
  } else {
    BackHandler.addEventListener("hardwareBackPress", closeTop);
  }
}

export function useDismiss(active: boolean, onDismiss: () => void) {
  const handler = useRef(onDismiss);
  useEffect(() => { handler.current = onDismiss; });
  useEffect(() => {
    if (!active) return;
    install();
    stack.push(handler);
    return () => { stack.splice(stack.indexOf(handler), 1); };
  }, [active]);
}
