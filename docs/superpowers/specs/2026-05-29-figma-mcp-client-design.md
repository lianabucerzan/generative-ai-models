# Figma MCP Client Integration Design

**Date:** 2026-05-29
**Branch:** `feature/figma-integration`
**Status:** Approved

## Overview

Replace the direct Figma REST API calls in `FigmaService` with a native MCP client (`@modelcontextprotocol/sdk`) that connects to `figma-developer-mcp` as a persistent subprocess. `McpFigmaService` exposes the same `extract()` interface as `FigmaService`, making it a drop-in replacement. `ClaudeAgent` uses MCP first, falls back to REST API if MCP is unavailable.

## Architecture

```
Server startup
  → createMcpFigmaService()
      → spawn figma-developer-mcp via StdioClientTransport
      → connect MCP client (persistent)
      → returns McpFigmaService | null
  → if null: createFigmaService() (REST API fallback)
  → ClaudeAgent.figmaService = McpFigmaService | FigmaService | null

Per request (CLI mode):
  URL in prompt
    → ClaudeAgent._generateWithCLI
    → figmaService.extract(url)   ← same interface, MCP or REST
    → tokens → _buildFigmaPrompt → CLI

Per request (API key mode):
  URL in prompt
    → Claude calls get_figma_design tool
    → ClaudeAgent tool handler: figmaService.extract(url)
    → { imageBase64, tokens } → tool_result → Claude
```

### Graceful Degradation

| Condition | Result |
|-----------|--------|
| No `FIGMA_API_KEY` | `createMcpFigmaService()` returns null → `createFigmaService()` returns null → no Figma |
| `figma-developer-mcp` fails to start | returns null → falls back to `FigmaService` (REST) |
| MCP `callTool()` throws at runtime | `extract()` returns null → generate without Figma context |
| No Figma URL in prompt | `figmaService` not called — generation proceeds normally |

## Components

### `backend/services/McpFigmaService.js` (new)

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
```

**`parseUrl(url)`** — identical to `FigmaService.parseUrl()`. Reused, not duplicated.

**Transport:** `figma-developer-mcp` v0.9.0 runs as an **HTTP server on port 3333** (not stdio).
Uses `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk/client/streamableHttp.js`.

**Available tools (verified):**
- `get_figma_data(fileKey, nodeId, depth)` — returns raw Figma node JSON
- `download_figma_images(fileKey, nodes, pngScale, localPath)` — saves to disk, not used

**`extract(url)`:**
1. `parseUrl(url)` → `{ fileKey, nodeId }` or null
2. `client.callTool({ name: "get_figma_data", arguments: { fileKey, nodeId, depth: 2 } })`
3. MCP returns full node JSON including master component data for INSTANCE nodes
4. **CLI mode:** parse JSON with `extractTokensFromNode()` → inject as text in prompt
5. **API key mode:** send raw JSON string as `tool_result` → Claude interprets it directly

**`createMcpFigmaService()` (async factory):**
```js
export async function createMcpFigmaService() {
  if (!process.env.FIGMA_API_KEY) return null;
  try {
    const proc = spawn("npx", ["-y", "figma-developer-mcp"], { env: { ...process.env }, stdio: "ignore", detached: false });
    await waitForPort(3333, 5000); // poll until server ready
    const transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3333/mcp"));
    const client = new Client({ name: "llm-arena", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    console.log("Figma: MCP client connected");
    return new McpFigmaService(client, proc);
  } catch (err) {
    console.warn("Figma: MCP connection failed:", err.message);
    return null;
  }
}
```

### `backend/agents/ClaudeAgent.js` (modified)

Constructor becomes async-compatible via top-level init:

```js
// module-level, before class definition
const figmaService = (await createMcpFigmaService()) ?? createFigmaService();
```

Then in constructor:
```js
this.figmaService = figmaService;
```

Startup logs:
- `"Figma: MCP client connected"` — from McpFigmaService factory
- `"Figma: MCP connection failed, falling back to REST API"` — if MCP fails
- `"Figma integration: disabled (no FIGMA_API_KEY)"` — if no key

### `backend/package.json` (modified)

Add dependency:
```json
"@modelcontextprotocol/sdk": "^1.0.0"
```

### `backend/services/FigmaService.js` (unchanged)

Remains as REST API fallback. `createFigmaService()` still used if MCP unavailable.

## Token Extraction from MCP Response

`figma-developer-mcp` returns raw Figma node JSON (same structure as REST API `/files/{key}/nodes`). The token extraction logic (traverse fills, strokes, effects, cornerRadius, padding) is **extracted into a shared helper `backend/services/figmaTokens.js`** — a pure function `extractTokensFromNode(node)` imported by both `FigmaService` and `McpFigmaService`. No duplication.

`McpFigmaService.extract()` calls `FigmaService.exportPng()` for the PNG screenshot — McpFigmaService receives a `FigmaService` instance in its constructor for this purpose. MCP does not export images.

## Startup Log Summary

```
Claude Agent: no API key, using claude CLI
Figma: MCP client connected        ← MCP available
# or
Figma: MCP connection failed...    ← falls back to REST
# or
Figma integration: disabled        ← no FIGMA_API_KEY
Server running on port 3000
```
