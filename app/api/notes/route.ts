import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Prisma v7.8.0 Driver Adapter Instantiation
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db"
});
const prisma = new PrismaClient({ adapter });

const noteSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  userId: z.number().int().positive("Valid User ID is required"),
});

export async function GET() {
  try {
    const notes = await prisma.note.findMany({
      include: { user: true },
    });
    return NextResponse.json(notes, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Database retrieval failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const validation = noteSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { title, content, userId } = validation.data;

    const newNote = await prisma.note.create({
      data: {
        title,
        content,
        userId,
      },
    });

    return NextResponse.json(newNote, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error or foreign key violation" },
      { status: 500 }
    );
  }
}
