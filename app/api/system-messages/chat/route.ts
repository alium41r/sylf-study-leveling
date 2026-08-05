import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { CHAT_PERSONA } from "@/lib/ai/prompts";
import { chatToolsDeclaration, groqToolsDeclaration } from "@/lib/ai/chat-tools";
import { executeChatTool } from "@/lib/ai/chat-tool-executor";
import Groq from "groq-sdk";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
const MODEL = "gemini-2.5-flash";
const MAX_TOOL_ITERATIONS = 5;

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
    const formData = await req.formData();
    const messageText = formData.get("message") as string;
    const file = formData.get("file") as File | null;
    let sessionIdStr = formData.get("sessionId") as string | null;
    const modelPreference = (formData.get("modelPreference") as string) || "auto";

    if (!messageText && !file) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    let sessionId: number | null = null;
    let isNewSession = false;
    let newSession = null;
    if (sessionIdStr) {
      sessionId = parseInt(sessionIdStr);
    } else {
      isNewSession = true;
      const title = messageText 
        ? (messageText.length > 30 ? messageText.slice(0, 30) + "..." : messageText) 
        : "Attachment Analysis";
      
      newSession = await prisma.chatSession.create({
        data: { userId, title },
      });
      sessionId = newSession.id;
    }

    // ── Handle file upload ──────────────────────────────────
    let attachmentUrl: string | null = null;
    let base64Data: string | null = null;
    let mimeType: string | null = null;

    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const uploadDir = path.join(process.cwd(), "public/uploads");
      await fs.writeFile(path.join(uploadDir, filename), buffer);
      attachmentUrl = `/uploads/${filename}`;
      base64Data = buffer.toString("base64");
      mimeType = file.type;
    }

    // ── Save user message to DB ─────────────────────────────
    const userMessageContent = messageText || "Sent an attachment.";
    const userMessage = await prisma.systemMessage.create({
      data: {
        userId,
        sessionId,
        content: userMessageContent,
        type: "USER",
        read: true,
        attachmentUrl,
      },
    });

    // ── Build conversation history for context ──────────────
    const recentMessages = await prisma.systemMessage.findMany({
      where: { userId, sessionId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    recentMessages.reverse();

    // Convert DB messages to Gemini chat history format
    const history = recentMessages
      .filter((m) => m.id !== userMessage.id) // exclude the message we just saved
      .map((m) => ({
        role: m.type === "USER" ? ("user" as const) : ("model" as const),
        parts: [{ text: m.content }],
      }));

    // ── Create Gemini chat with tools ───────────────────────
    const chat = ai.chats.create({
      model: MODEL,
      history,
      config: {
        systemInstruction: `${CHAT_PERSONA}\n\nToday's date is ${new Date().toISOString().split("T")[0]}. Use this date when creating quests or goals unless specified otherwise.`,
        tools: [chatToolsDeclaration],
      },
    });

    // ── Build the user's current message parts ──────────────
    const messageParts: any[] = [];
    if (messageText) {
      messageParts.push({ text: messageText });
    } else {
      messageParts.push({ text: "Please analyze this attachment." });
    }
    if (base64Data && mimeType) {
      messageParts.push({
        inlineData: { mimeType, data: base64Data },
      });
    }

    // ── Function-calling loops ───────────────────────────────

    // Helper to run Groq completion
    const runGroqChat = async () => {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const messages: any[] = [
        { role: "system", content: `${CHAT_PERSONA}\n\nToday's date is ${new Date().toISOString().split("T")[0]}. Use this date when creating quests or goals unless specified otherwise.` }
      ];
      recentMessages.forEach((m) => {
        if (m.id !== userMessage.id) {
          messages.push({ role: m.type === "USER" ? "user" : "assistant", content: m.content });
        }
      });
      messages.push({ role: "user", content: messageText || "Please analyze this attachment." });

      let iterations = 0;
      let responseText = "";

      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        const completion = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages,
          tools: groqToolsDeclaration,
          tool_choice: "auto",
        });

        const responseMessage = completion.choices[0].message;
        if (responseMessage.content === null) {
          responseMessage.content = "";
        }
        messages.push(responseMessage);

        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
          for (const toolCall of responseMessage.tool_calls) {
            console.log(`[Groq] Tool call: ${toolCall.function.name}(${toolCall.function.arguments})`);
            let args = {};
            let result;
            try {
              args = JSON.parse(toolCall.function.arguments || "{}");
              result = await executeChatTool(toolCall.function.name, args, userId);
            } catch (err: any) {
              console.error("[Groq] Tool parsing or execution failed:", err);
              result = { error: "Failed to parse arguments or execute tool. Check syntax.", details: err.message };
            }
            messages.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: toolCall.function.name,
              content: JSON.stringify(result),
            });
          }
        } else {
          responseText = responseMessage.content || "Action completed successfully!";
          break;
        }
      }
      return responseText || "Action completed successfully!";
    };

    let aiResponseText = "";
    let actualModelUsed = "GEMINI";

    try {
      // Force Gemini if there is an image attached, because Groq (llama-3.3) is text-only.
      if (modelPreference === "groq" && (!base64Data || !mimeType)) {
        actualModelUsed = "GROQ";
        aiResponseText = await runGroqChat();
      } else {
        // Run Gemini
        let response = await chat.sendMessage({ message: messageParts });
        let iterations = 0;

        while (
          response.functionCalls &&
          response.functionCalls.length > 0 &&
          iterations < MAX_TOOL_ITERATIONS
        ) {
          iterations++;
          const functionResponses = [];

          for (const fc of response.functionCalls) {
            console.log(`[Chat] Tool call: ${fc.name}(${JSON.stringify(fc.args)})`);
            let result;
            try {
              result = await executeChatTool(
                fc.name!,
                (fc.args as Record<string, any>) || {},
                userId
              );
            } catch (err: any) {
              console.error("[Gemini] Tool parsing or execution failed:", err);
              result = { error: "Failed to execute tool.", details: err.message };
            }
            functionResponses.push({
              name: fc.name!,
              response: result,
            });
          }

          // Send tool results back to Gemini so it can formulate a response
          response = await chat.sendMessage({
            message: functionResponses.map((fr) => ({
              functionResponse: {
                name: fr.name,
                response: fr.response,
              },
            })),
          });
        }

        aiResponseText =
          response.text ||
          (iterations > 0
            ? "Action completed successfully!"
            : "I couldn't process that request. Could you try again?");
      }
    } catch (apiError: any) {
      console.error("API Error:", apiError);
      
      // Auto-fallback logic for Gemini 429 errors
      if (
        modelPreference === "auto" &&
        apiError.message &&
        (apiError.message.includes("quota") || apiError.message.includes("429"))
      ) {
        console.log("[Auto-Fallback] Gemini limit reached. Falling back to Groq...");
        try {
          actualModelUsed = "GROQ";
          aiResponseText = await runGroqChat();
        } catch (groqError) {
          console.error("Groq Fallback Error:", groqError);
          aiResponseText = "⚠️ **SYSTEM OVERLOAD** ⚠️\n\nThe System's rate limit quota has been exceeded on all models. Please wait a minute before sending another request.";
        }
      } else {
        aiResponseText = "SYSTEM ERROR: The request could not be processed due to an internal error.";
        if (apiError.message && (apiError.message.includes("quota") || apiError.message.includes("429"))) {
          aiResponseText = "⚠️ **SYSTEM OVERLOAD** ⚠️\n\nThe System's rate limit quota has been exceeded. Please wait a minute before sending another request.";
        }
      }
    }

    // ── Save AI response to DB ──────────────────────────────
    const aiMessage = await prisma.systemMessage.create({
      data: {
        userId,
        sessionId,
        content: aiResponseText,
        type: "INFO_" + actualModelUsed,
        read: false,
      },
    });

    return NextResponse.json({ userMessage, aiMessage, sessionId, session: newSession }, { status: 200 });
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
