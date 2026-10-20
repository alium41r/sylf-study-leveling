import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from "dotenv";
import * as fs from "fs"; // Node's built-in File System module
import * as readline from "readline/promises"; // For terminal input

dotenv.config();
const ai = new GoogleGenAI({});

// --- 1. TOOLS ---
const webSearchTool = {
    functionDeclarations: [{
        name: "searchWeb",
        description: "Search the web for up-to-date information.",
        parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ["query"] }
    }],
};

const readFileTool = {
    functionDeclarations: [{
        name: "readFile",
        description: "Read the contents of a local text file.",
        parameters: { type: Type.OBJECT, properties: { filePath: { type: Type.STRING } }, required: ["filePath"] }
    }],
};

// --- 2. HOOKS ---
function preActionHook(toolName: string, args: any) {
    const timestamp = new Date().toISOString();
    console.log(`\n[HOOK] ⏰ ${timestamp} | 🛠️  AI is calling: ${toolName}`);
}

// --- 3. EXECUTORS ---
async function executeSearch(query: string) {
    console.log(`[Executor] Searching Google for: "${query}"...`);
    return "The Kansas City Chiefs won the Super Bowl in 2024.";
}

function executeReadFile(filePath: string) {
    console.log(`[Executor] Reading local file: "${filePath}"...`);
    try {
        return fs.readFileSync(filePath, "utf-8");
    } catch (e) {
        return "Error reading file.";
    }
}

// --- 4. MAIN AGENT LOOP ---
async function main() {
    const chat = ai.chats.create({
        model: "gemini-3.7-flash",
        config: { tools: [webSearchTool, readFileTool] }, // Give it BOTH tools!
    });

    // Set up the terminal input reader
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log("🤖 Agent initialized! Type your question below.");
    
    // Ask the user for their question instead of hardcoding it!
    const userQuestion = await rl.question("\n👤 You: ");

    let response = await chat.sendMessage({
        message: userQuestion
    });

    // The magical ReAct loop: Keep executing tools until the AI stops asking for them!
    while (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];

        preActionHook(call.name as string, call.args);

        let result = "";
        if (call.name === "searchWeb") {
            result = await executeSearch(call.args!.query as string);
        } else if (call.name === "readFile") {
            result = executeReadFile(call.args!.filePath as string);
        }

        console.log("[Memory] Feeding results back to AI...");
        response = await chat.sendMessage({
            message: [{
                functionResponse: {
                    name: call.name,
                    response: { result: result }
                }
            }]
        });
    }

    console.log("\n🤖 Final AI Answer:", response.text);

    // Close the terminal reader so the script can exit
    rl.close();
}

main();


