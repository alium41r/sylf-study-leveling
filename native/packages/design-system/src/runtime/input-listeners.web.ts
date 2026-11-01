import { setInputMode, type InputMode } from "./input";

let installed = false;

export function installInputListeners() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", (event) => { if (["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) setInputMode("keyboard"); }, true);
  window.addEventListener("pointerdown", (event) => setInputMode((event.pointerType === "pen" ? "pen" : event.pointerType === "mouse" ? "mouse" : "touch") as InputMode), true);
}

export const focusImpliesKeyboard = false;
