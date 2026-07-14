import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyToken } from "../../../lib/auth";


// Prisma v7.8.0 Driver Adapter Instantiation
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db"
});
const prisma = new PrismaClient({ adapter });

const noteSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
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
    // 1. Look for the "Authorization" header in the incoming request
    const authHeader = req.headers.get("authorization");

    // 2. If they didn't send a token, kick them out
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized: Missing VIP Pass" }, { status: 401 });
    }

    // 3. Extract the actual token string and verify it
    const token = authHeader.split(" ")[1]; // Grabs the part after "Bearer "
    const userPayload = await verifyToken(token);

    // 4. If the token was fake or expired, kick them out
    if (!userPayload) {
      return NextResponse.json({ error: "Unauthorized: Invalid VIP Pass" }, { status: 401 });
    }

    // 5. Success! The code below this line will only run for logged-in users!

    const body = await req.json();

    const validation = noteSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      );
    }

    const { title, content } = validation.data;

    const newNote = await prisma.note.create({
      data: {
        title,
        content,
        userId: userPayload.userId as number, // Pull the ID securely from the token!
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
