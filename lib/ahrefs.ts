import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function callAhrefs(
  toolName: string,
  args: Record<string, unknown>
) {
  const client = new Client({ name: "seo-tool", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL("https://api.ahrefs.com/mcp/mcp"),
    {
      requestInit: {
        headers: {
          Authorization: `Bearer ${process.env.AHREFS_API_KEY}`,
        },
      },
    }
  );
  await client.connect(transport);
  const result = await client.callTool({ name: toolName, arguments: args });
  await client.close();
  return result;
}
