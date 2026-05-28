# Figma MCP + Tool Use Integration Design

**Date:** 2026-05-28
**Branch:** `feature/figma-integration`
**Status:** Approved
**Replaces:** `2026-05-28-figma-integration-design.md`

## Overview

Replace the manual pre-extraction approach (server.js detects URL → calls FigmaService → passes figmaData to agent) with two native integration paths:

- **CLI mode** (no API key): Claude CLI reads Figma directly via MCP tools configured in `.claude/settings.json`
- **API key mode** (Anthropic SDK): Claude calls a `get_figma_design` tool via Tool Use; we execute the Figma REST API and return image + tokens as the tool result

In both cases, Claude decides when and what to fetch — zero URL detection logic in server.js or agent routing code.

## Architecture

### Data Flow

```
User prompt (with or without Figma URL)
    ↓
server.js POST /generate
    → agent.generate(prompt, modelId)   ← no figmaData, no URL extraction
        ↓
    CLI mode:                           API key mode:
    claude CLI spawn                    client.messages.create()
    (cwd: project root)                 (with get_figma_design tool)
    MCP: figma-developer-mcp            ↓
    Claude calls get_node() if URL      if stop_reason === "tool_use":
    present → generates HTML              figmaService.extract(url)
                                          → second messages.create()
                                            with tool_result (image+tokens)
                                        else: first response is final output
```

### Graceful Degradation

| Condition | CLI mode | API key mode |
|-----------|----------|--------------|
| No Figma URL in prompt | Claude generates from text | Claude generates from text |
| Figma URL present, no FIGMA_API_KEY | MCP server fails to start → Claude generates from text only | Tool returns error → Claude generates from text only |
| Figma URL present, FIGMA_API_KEY set | Claude uses MCP tools → full design context | Claude calls tool → full design context |

## Components

### `.claude/settings.json` (new, project root)

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-developer-mcp"]
    }
  }
}
```

No `env` block — `figma-developer-mcp` reads `FIGMA_API_KEY` from the inherited environment. The spawn in `_generateWithCLI` already passes `{ ...process.env }` (minus `CLAUDECODE`), so the MCP server subprocess receives the key automatically from `backend/.env` loaded via dotenv.

### `backend/agents/BaseAgent.js` (modified)

Updated system prompt to instruct Claude to use Figma MCP/tool when a URL is present:

```
You generate UI components as plain HTML with Tailwind CSS classes.
Return only the HTML snippet — no Vue, no scripts, no markdown fences, no backticks.
Include realistic hardcoded demo data so the component looks complete visually.
If a Figma URL is present in the prompt, use the available Figma tool to read
the design before generating — use the exact colors, fonts, and dimensions from Figma.
```

### `backend/agents/ClaudeAgent.js` (modified)

**Removed:**
- `figmaData` parameter from `generate()`, `_generateWithAPI()`, `_generateWithCLI()`
- `_buildFigmaPrompt()` helper
- `figmaData`-related branching throughout

**CLI mode — `_generateWithCLI(prompt, modelId)`:**
- Spawn gains `cwd: PROJECT_ROOT` so Claude CLI finds `.claude/settings.json`
- `PROJECT_ROOT` resolved via `path.resolve(fileURLToPath(import.meta.url), "../../..")` — from `backend/agents/ClaudeAgent.js` → `backend/agents/` → `backend/` → project root
- Prompt passed as-is — Claude reads Figma via MCP tools if URL present

**API key mode — `_generateWithAPI(prompt, modelId)`:**

Implements a tool use loop:

```js
// Step 1: send with tool definition
const tools = [{
  name: "get_figma_design",
  description: "Fetch colors, fonts, dimensions and a PNG screenshot from a Figma node URL.",
  input_schema: {
    type: "object",
    properties: {
      figma_url: { type: "string", description: "Full Figma URL including node-id parameter" }
    },
    required: ["figma_url"]
  }
}];

const msg1 = await client.messages.create({ model, max_tokens: 2000, system, tools, messages });

// Step 2: if tool called, execute and return result
if (msg1.stop_reason === "tool_use") {
  const toolUse = msg1.content.find(b => b.type === "tool_use");
  const figmaData = await figmaService.extract(toolUse.input.figma_url);
  const toolResult = figmaData
    ? [
        { type: "image", source: { type: "base64", media_type: "image/png", data: figmaData.imageBase64 } },
        { type: "text", text: `Colors: ${figmaData.tokens.colors.join(", ")}\nFonts: ${figmaData.tokens.fonts.map(f => `${f.fontFamily} ${f.fontSize}px weight=${f.fontWeight}`).join(", ")}\nDimensions: ${figmaData.tokens.dimensions.width}×${figmaData.tokens.dimensions.height}px` }
      ]
    : [{ type: "text", text: "Figma data unavailable — generate from prompt only." }];

  const msg2 = await client.messages.create({
    model, max_tokens: 2000, system, tools,
    messages: [
      ...messages,
      { role: "assistant", content: msg1.content },
      { role: "user", content: [{ type: "tool_result", tool_use_id: toolUse.id, content: toolResult }] }
    ]
  });
  // use msg2 as output
} else {
  // use msg1 as output directly
}
```

`figmaService` instance created in `ClaudeAgent` constructor (moved from `server.js`):
```js
this.figmaService = createFigmaService(); // null if no FIGMA_API_KEY
```

### `backend/server.js` (simplified)

Remove:
- `import { createFigmaService }` 
- `const figmaService = createFigmaService()`
- `FIGMA_URL_RE` regex constant
- URL extraction block (`figmaUrlMatch`, `cleanPrompt`, `figmaData`)
- Figma integration startup log

Result: `agent.generate(prompt, model)` — back to 2 arguments.

### `backend/services/FigmaService.js` (unchanged)

Stays as-is. Used exclusively by `ClaudeAgent._generateWithAPI` tool handler. `createFigmaService()` called from `ClaudeAgent` constructor.

### `backend/services/FigmaService.test.js` (unchanged)

All 10 tests remain valid — `FigmaService` logic is unchanged.

## What Gets Deleted

Nothing is deleted from `FigmaService`. The only removal is code that was doing URL detection and pre-extraction in `server.js` and the `figmaData` threading through `ClaudeAgent`.

## Token Cost Impact (API key mode)

Tool use adds one extra API round-trip when a Figma URL is present:

| Extra cost per generation with Figma URL | Haiku | Sonnet | Opus |
|---|---|---|---|
| Tool definition tokens (~80 input) | ~$0.0001 | ~$0.0002 | ~$0.001 |
| Tool result (image + tokens) | same as before | same as before | same as before |

When no Figma URL: zero overhead — tool is defined but never called.
