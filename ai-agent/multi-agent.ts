import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from "dotenv";
import * as readline from "readline/promises";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

dotenv.config();
const ai = new GoogleGenAI({});

// ==========================================
// 0. TRACING LAYER (Agent Debugging)
// ==========================================
class AgentTracer {
    static logToolCall(agentId: string, toolName: string, args: any) {
        const timestamp = new Date().toISOString();
        console.log(`\n  [TRACE 🔍] ${timestamp} | Agent: [${agentId.toUpperCase()}] | Action: ${toolName} | Payload: ${JSON.stringify(args)}`);
    }
}

// ==========================================
// 1. WORKER TOOLS
// ==========================================
const calculateTool = {
    functionDeclarations: [{
        name: "calculateSum",
        description: "Adds two numbers together.",
        parameters: {
            type: Type.OBJECT,
            properties: { a: { type: Type.NUMBER }, b: { type: Type.NUMBER } },
            required: ["a", "b"]
        }
    }]
};

const searchTool = {
    functionDeclarations: [{
        name: "searchWeb",
        description: "Searches the internet for current events.",
        parameters: {
            type: Type.OBJECT,
            properties: { query: { type: Type.STRING } },
            required: ["query"]
        }
    }]
};

// ==========================================
// 2. WORKER AGENTS (The Sub-Agents)
// ==========================================
async function runMathWorker(task: string): Promise<string> {
    console.log(`\n  [Worker: Math] Received task: "${task}"`);
    const chat = ai.chats.create({
        model: "gemini-2.5-flash",
        config: { tools: [calculateTool] },
    });
    
    await sleep(2000); // Wait 2s to avoid free-tier rate limits
    let response = await chat.sendMessage({ message: task });
    
    if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        
        // TRACING INTERCEPTOR
        AgentTracer.logToolCall("math_worker", call.name as string, call.args);
        
        const result = (call.args!.a as number) + (call.args!.b as number);
        
        response = await chat.sendMessage({
            message: [{ functionResponse: { name: call.name, response: { result } } }]
        });
    }
    console.log(`  [Worker: Math] Finished. Returning results.`);
    return response.text || "";
}

async function runResearchWorker(task: string): Promise<string> {
    console.log(`\n  [Worker: Research] Received task: "${task}"`);
    const chat = ai.chats.create({
        model: "gemini-2.5-flash",
        config: { tools: [searchTool] },
    });
    
    await sleep(2000);
    let response = await chat.sendMessage({ message: task });
    
    if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        
        // TRACING INTERCEPTOR
        AgentTracer.logToolCall("research_worker", call.name as string, call.args);
        
        // Mock search result for demonstration
        const result = "The 2024 Superbowl winner is the Kansas City Chiefs.";
        
        response = await chat.sendMessage({
            message: [{ functionResponse: { name: call.name, response: { result } } }]
        });
    }
    console.log(`  [Worker: Research] Finished. Returning results.`);
    return response.text || "";
}

// ==========================================
// 3. SUPERVISOR AGENT (The Boss)
// ==========================================
const delegateTool = {
    functionDeclarations: [{
        name: "delegateTask",
        description: "Delegates a specific task to a specialized worker agent.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                worker: { 
                    type: Type.STRING, 
                    description: "Must be exactly 'math' or 'research'." 
                },
                taskDescription: { 
                    type: Type.STRING, 
                    description: "Clear, detailed instructions for the worker to execute." 
                }
            },
            required: ["worker", "taskDescription"]
        }
    }]
};

async function main() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log("👔 Supervisor Agent Initialized. Ask me anything.");
    
    const userQuery = await rl.question("\n👤 You: ");
    rl.close();

    console.log("\n👔 [Supervisor] Analyzing query and determining routing...");
    
    const supervisorChat = ai.chats.create({
        model: "gemini-2.5-flash",
        config: { 
            tools: [delegateTool],
            // A System Instruction acts as a strict guardrail for the agent's behavior
            systemInstruction: "You are a Supervisor AI. Do not answer questions directly yourself. You must use the delegateTask tool to assign work to either the 'math' worker or the 'research' worker. Once they return the result, summarize it for the user."
        },
    });

    let response = await supervisorChat.sendMessage({ message: userQuery });

    // Hand-off Loop
    while (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        const workerName = call.args!.worker as string;
        const taskDescription = call.args!.taskDescription as string;

        // TRACING INTERCEPTOR
        AgentTracer.logToolCall("supervisor", call.name as string, call.args);
        
        let workerResult = "";
        if (workerName === "math") {
            workerResult = await runMathWorker(taskDescription);
        } else if (workerName === "research") {
            workerResult = await runResearchWorker(taskDescription);
        } else {
            workerResult = "Error: Unknown worker.";
        }

        console.log(`\n👔 [Supervisor] Received results from [${workerName.toUpperCase()}]. Synthesizing final answer...`);
        
        // Feed the worker's output back into the Supervisor's memory
        await sleep(2000);
        response = await supervisorChat.sendMessage({
            message: [{ functionResponse: { name: call.name, response: { result: workerResult } } }]
        });
    }

    console.log("\n🤖 Final Answer:", response.text);
}

main().catch(console.error);
