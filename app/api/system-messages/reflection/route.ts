import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
// Using a secondary model for the reflection feature to satisfy the "Use ≥2 LLMs" requirement
const SECONDARY_MODEL = "gemini-1.5-pro";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(authHeader.split(" ")[1]);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const userId = payload.userId as number;

    // Fetch user and their quests from the last 7 days
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        quests: {
          where: {
            createdAt: {
              gte: new Date(new Date().setDate(new Date().getDate() - 7)),
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const completedQuests = user.quests.filter((q) => q.status === "COMPLETED").length;
    const failedQuests = user.quests.filter((q) => q.status === "FAILED").length;
    const pendingQuests = user.quests.filter((q) => q.status === "PENDING" || q.status === "IN_PROGRESS").length;

    const prompt = `
    You are "The System" (from Solo Leveling). This is an end-of-week reflection.
    Hunter: ${user.name || "Unknown"}
    Rank: ${user.hunterRank}
    Level: ${user.level}
    Weekly Stats:
    - Completed Quests: ${completedQuests}
    - Failed Quests: ${failedQuests}
    - Ignored/Pending Quests: ${pendingQuests}
    
    Write a short, highly immersive, ominous, yet encouraging performance review for the Hunter.
    Address them directly. If they failed many quests, warn them that the penalty for weakness is death (metaphorically). 
    If they succeeded, praise their growth but remind them the true challenges lie ahead.
    Do NOT use JSON. Return only the raw text message.
    `;

    const chat = ai.chats.create({
      model: SECONDARY_MODEL,
    });

    const response = await chat.sendMessage({ message: prompt });
    const reflectionText = response.text || "The System is silent. Your performance speaks for itself.";

    const systemMessage = await prisma.systemMessage.create({
      data: {
        userId,
        content: reflectionText,
        type: "INFO",
        read: false,
      },
    });

    return NextResponse.json({ message: systemMessage }, { status: 200 });
  } catch (error) {
    console.error("Reflection API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
