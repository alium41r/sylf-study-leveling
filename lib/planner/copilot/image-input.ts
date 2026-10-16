import "server-only";
import { readBody } from "../server/http";
import { ChatImageError, formImages, inlineImageParts, prepareChatImages, readImageForm } from "@/lib/ai/sylvie/images-server";

/** Same request schema and interpreter; images are bounded reference data, never new commands. */
export async function readPlannerChatTurn(request: Request) {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) return { body: await readBody(request), images: undefined };
  const form = await readImageForm(request), text = form.get("request");
  if (typeof text !== "string" || text.length > 16000) throw new ChatImageError("This planner request is too large.");
  let body;
  try { body = JSON.parse(text); } catch { throw new ChatImageError("Invalid planner request."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ChatImageError("Invalid planner request.");
  const images = inlineImageParts(await prepareChatImages(formImages(form), request.signal));
  return { body: images.length ? { ...body, proposalOnly: true } : body, images };
}
