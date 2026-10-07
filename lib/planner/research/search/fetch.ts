import "server-only";
export * from "./fetch-runtime";
import { fetchSource as runtimeFetch } from "./fetch-runtime";
import { extractPdfText } from "@/lib/planner/import/pdf";
/** Preserve the web extraction seam; workers use the ordinary Node owner. */
export const fetchSource: typeof runtimeFetch = (url, options = {}) => runtimeFetch(url, { pdfExtractor: extractPdfText, ...options });
