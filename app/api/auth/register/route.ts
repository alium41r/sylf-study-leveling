import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

// Database Setup
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

// Zod Schema to validate incoming data
const registerSchema = z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    name: z.string().optional(),
});

export async function POST(req: NextRequest) {
    try {
        // 1. Read the data sent by the user
        const body = await req.json();
        const validation = registerSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: "Invalid data" }, { status: 400 });
        }

        const { email, password, name } = validation.data;

        // 2. Check if a user with this email already exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: "User already exists" }, { status: 400 });
        }

        // 3. Hash the password (turn it into gibberish)
        // The "10" is the "salt round" - it means it scrambles it 10 times for extra security.
        const hashedPassword = await bcrypt.hash(password, 10);

        // 4. Save the user to the database
        const newUser = await prisma.user.create({
            data: {
                email: email,
                password: hashedPassword, // We save the gibberish, NOT the real password
                name: name,
            }
        });

        // 5. Send a success message back!
        return NextResponse.json({ message: "User registered successfully!" }, { status: 201 });

    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
