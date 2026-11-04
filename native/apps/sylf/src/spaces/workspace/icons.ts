// Which icon stands for which tool. The tool contract itself has no UI, so this mapping lives beside the screens.
import type { IconName } from "@sylf/design-system";
import type { ToolId } from "@sylf/spaces";

export const TOOL_ICONS: Record<ToolId, IconName> = { notes: "notes", pdfs: "pdf", whiteboard: "whiteboard", sylvie: "sylvie", timer: "timer", calculator: "calculator", audio: "audio", resources: "resources" };
