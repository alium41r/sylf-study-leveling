import { useEffect, useState } from "react";

export function useSystemContrast() {
  const [more, setMore] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-contrast: more)").matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(prefers-contrast: more)");
    const onChange = () => setMore(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return more;
}

export function applyRootBackground(color: string) { if (typeof document !== "undefined") document.body.style.backgroundColor = color; }
