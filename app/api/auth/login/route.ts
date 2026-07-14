import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { SignJWT } from "jose";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const loginSchema = z.object({
    email: z.string().email("Invalid email"),
    password: z.string().min(1, "Password is required"),
});

// A secret key used to sign our VIP passes. 
// (In a real app, you hide this in your .env file so hackers can't see it!)
const secretKey = new TextEncoder().encode(process.env.JWT_SECRET || "super-secret-key-12345");

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const validation = loginSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: "Invalid data" }, { status: 400 });
        }

        const { email, password } = validation.data;

        // 1. Find the user by their email
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            // If user doesn't exist, say "Unauthorized" (Status 401)
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        // 2. Check if the passwords match
        // bcrypt compares the raw password they just typed with the hashed gibberish saved in the database
        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) {
            return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
        }

        // 3. Success! Let's build their VIP pass (the JWT token)
        const token = await new SignJWT({
            userId: user.id, // We embed their User ID inside the token
            email: user.email,
            role: user.role
        })
            .setProtectedHeader({ alg: 'HS256' }) // The encryption style
            .setExpirationTime('2h') // The VIP pass expires in 2 hours
            .sign(secretKey); // Sign it with our secret key so nobody can forge a fake one

        // 4. Give the user their token!
        return NextResponse.json({
            message: "Login successful!",
            token: token
        }, { status: 200 });

    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
