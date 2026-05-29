import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { spawn } from "child_process";

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`figma-developer-mcp port ${port} not ready after ${timeoutMs}ms`);
}

async function connectClient(url) {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({ name: "llm-arena", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

export class McpFigmaService {
  constructor(client) {
    this.client = client;
  }

  parseUrl(url) {
    const match = url.match(
      /figma\.com\/(?:design|file)\/([^/?]+)[^?]*\?.*node-id=([\w%:-]+)/
    );
    if (!match) return null;
    const fileKey = match[1];
    const nodeId = decodeURIComponent(match[2]).replace(/^(\d+)-(\d+)$/, "$1:$2");
    return { fileKey, nodeId };
  }

  // Returns structured design text string ready to send to Claude, or null on failure
  async extract(url) {
    const parsed = this.parseUrl(url);
    if (!parsed) return null;
    try {
      const result = await this.client.callTool({
        name: "get_figma_data",
        arguments: { fileKey: parsed.fileKey, nodeId: parsed.nodeId, depth: 2 },
      });
      return result.content[0]?.text ?? null;
    } catch (err) {
      console.warn("McpFigmaService.extract failed:", err.message);
      return null;
    }
  }
}

export async function createMcpFigmaService() {
  if (!process.env.FIGMA_API_KEY) return null;

  // Try connecting to an already-running instance (e.g. Claude Code's MCP server)
  try {
    const client = await connectClient("http://127.0.0.1:3333/mcp");
    console.log("Figma: connected to existing MCP server on port 3333");
    return new McpFigmaService(client);
  } catch {}

  // Spawn our own instance
  try {
    spawn("npx", ["-y", "figma-developer-mcp"], {
      env: { ...process.env },
      stdio: "ignore",
      detached: false,
    });
    await waitForPort(3333, 5000);
    const client = await connectClient("http://127.0.0.1:3333/mcp");
    console.log("Figma: MCP server started and connected on port 3333");
    return new McpFigmaService(client);
  } catch (err) {
    console.warn("Figma: MCP connection failed:", err.message);
    return null;
  }
}
