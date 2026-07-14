import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyToken } from "../../../../lib/auth"; // Put this at the very top of the file!


// Prisma v7.8.0 Driver Adapter Instantiation
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db"
});
const prisma = new PrismaClient({ adapter });

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
});

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Put this inside the DELETE function:
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing VIP Pass" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const userPayload = await verifyToken(token);

    if (!userPayload) {
      return NextResponse.json({ error: "Invalid VIP Pass" }, { status: 401 });
    }

    // --- HERE IS THE NEW RULE! ---
    // We check the role we just added to the token!
    if (userPayload.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: You are not an Admin!" }, { status: 403 });
    }

    const { id } = await params;
    const noteId = parseInt(id);
    if (isNaN(noteId)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    await prisma.note.delete({
      where: { id: noteId },
    });

    return NextResponse.json({ message: "Note deleted" }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Delete failed. Record may not exist." },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const noteId = parseInt(id);
    if (isNaN(noteId)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    const body = await req.json();
    const validation = updateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      );
    }

    const updatedNote = await prisma.note.update({
      where: { id: noteId },
      data: validation.data,
    });

    return NextResponse.json(updatedNote, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Update failed. Record may not exist." },
      { status: 500 }
    );
  }
}
