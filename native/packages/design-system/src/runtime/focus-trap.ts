// Native modal focus is handled through aria-modal and the accessibility tree; see focus-trap.web.ts for desktop.
import type { RefObject } from "react";
import type { ViewHandle } from "../primitives/Layout";

export const useFocusTrap: (ref: RefObject<ViewHandle | null>, active: boolean) => void = () => undefined;
