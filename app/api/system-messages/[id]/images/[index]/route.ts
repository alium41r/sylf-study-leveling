import { getSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { readChatImage, storedImages } from "@/lib/ai/sylvie/image-storage";

/** Browser delivery stays cookie-authenticated; no storage path or signed URL is exposed. */
export async function GET(request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  const session = await getSession(request);
  if (!session) return new Response(null, { status: 401 });
  const { id, index } = await context.params;
  if (!/^\d+$/.test(id) || !/^[0-3]$/.test(index)) return new Response(null, { status: 404 });
  try {
    const message = await prisma.systemMessage.findFirst({ where: { id: Number(id), userId: session.userId, type: "USER" } });
    const image = storedImages(message?.attachmentUrl)[Number(index)];
    if (!image || !message?.sessionId) return new Response(null, { status: 404 });
    const file = await readChatImage(image, session.userId, message.sessionId);
    return new Response(new Uint8Array(file.buffer), { headers: { "Content-Type": file.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
  } catch { return new Response(null, { status: 404 }); }
}
