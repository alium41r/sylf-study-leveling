import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// 1. Initialize the MCP Server
const server = new Server(
  {
    name: "internship-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// --- RESOURCES (Passive Data) ---

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "notes://memo",
        name: "Secret Memo",
        mimeType: "text/plain",
        description: "A secret internal memo",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
  if (request.params.uri === "notes://memo") {
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "text/plain",
          text: "The secret code is 42.",
        },
      ],
    };
  }
  throw new Error(`Resource not found: ${request.params.uri}`);
});

// --- TOOLS (Active Execution) ---

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "calculate_sum",
        description: "Adds two numbers together",
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number", description: "First number" },
            b: { type: "number", description: "Second number" },
          },
          required: ["a", "b"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  if (request.params.name === "calculate_sum") {
    const { a, b } = request.params.arguments as any;
    const result = a + b;
    return {
      content: [
        {
          type: "text",
          text: `The sum of ${a} and ${b} is ${result}`,
        },
      ],
    };
  }
  throw new Error(`Tool not found: ${request.params.name}`);
});

// --- TRANSPORT (How it communicates) ---

async function run() {
  // We use Stdio (Standard In/Out) instead of HTTP
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Notice we use console.error for logging! 
  // If we used console.log, it would corrupt the JSON messages being sent over Stdio.
  console.error("🟢 MCP Server is running on stdio");
}

run().catch(console.error);
