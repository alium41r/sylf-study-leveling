import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function runClient() {
  console.log("🔌 Initializing MCP Client...");

  // 1. Configure the transport to spawn our server file
  // This tells the client how to launch the server in the background
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "mcp-server.ts"]
  });

  // 2. Create the Client instance
  const client = new Client(
    {
      name: "internship-mcp-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  // 3. Connect to the background server!
  await client.connect(transport);
  console.log("✅ Successfully connected to MCP Server!");

  // 4. Test: Ask the server what tools it has
  console.log("\n🛠️  Discovering Tools...");
  const toolsResponse = await client.listTools();
  console.log(`Found ${toolsResponse.tools.length} tool(s):`);
  console.log(toolsResponse.tools.map((t: any) => `- ${t.name}`).join("\n"));

  // 5. Test: Tell the server to execute the calculate_sum tool!
  console.log("\n🧮 Asking remote server to calculate 15 + 27...");
  const result = await client.callTool({
    name: "calculate_sum",
    arguments: { a: 15, b: 27 },
  });

  // Extract the text response
  // @ts-ignore
  console.log("🤖 Server replied:", result.content[0].text);

  // Close the connection
  process.exit(0);
}

runClient().catch(console.error);
