/** Stored alongside existing hidden message metadata; no conversation schema change. */
const OUTPUT_LIMIT_MARKER = "<!-- sylvie-incomplete:output-limit -->";
export const OUTPUT_LIMIT_NOTICE = "This answer reached its response limit and is incomplete. Ask Sylvie to continue from where it stopped.";
export const hasOutputLimit = (content: string) => content.includes(OUTPUT_LIMIT_MARKER);
export const markOutputLimit = (content: string) => `${content}\n${OUTPUT_LIMIT_MARKER}`;
export const stripOutputLimit = (content: string) => content.replace(/\s*<!-- sylvie-incomplete:output-limit -->/g, "");
