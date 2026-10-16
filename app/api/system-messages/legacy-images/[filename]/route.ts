import { getSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { detectImageType, MAX_UPLOAD_BYTES } from "@/lib/upload-security";
import fs from "fs/promises";
import path from "path";

/** Protect pre-private-storage uploads too, including their original public URLs. */
export async function GET(request: Request, context: { params: Promise<{ filename: string }> }) {
  const session = await getSession(request);
  if (!session) return new Response(null, { status: 401 });
  const { filename } = await context.params;
  if (!/^up_\d+_[a-f0-9]{12}\.(?:jpg|png|gif|webp)$/.test(filename)) return new Response(null, { status: 404 });
  try {
    const message = await prisma.systemMessage.findFirst({ where: { userId: session.userId, type: "USER", attachmentUrl: `/uploads/${filename}` }, select: { id: true } });
    if (!message) return new Response(null, { status: 404 });
    const buffer = await fs.readFile(path.join(process.cwd(), "public", "uploads", filename));
    const mime = buffer.length <= MAX_UPLOAD_BYTES && detectImageType(buffer);
    if (!mime) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 404 }); }
}
