// Native system signals that themes must respect.
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import * as SystemUI from "expo-system-ui";

export function useSystemContrast() {
  const [more, setMore] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isHighTextContrastEnabled?.().then((value) => { if (live) setMore(value); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("highTextContrastChanged", setMore);
    return () => { live = false; sub.remove(); };
  }, []);
  return more;
}

export function applyRootBackground(color: string) { void SystemUI.setBackgroundColorAsync(color).catch(() => undefined); }
