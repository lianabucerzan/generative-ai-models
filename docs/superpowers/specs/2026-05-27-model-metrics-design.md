# Model Selection & Metrics — Design Spec

**Date:** 2026-05-27  
**Status:** Approved

## Summary

Expand the LLM UI Arena MVP so the "Select Agent" dropdown lists all current Anthropic models plus Gemini, and every generation response includes a metrics bar (tokens in/out, latency, cost estimate, model ID) displayed below the output terminal.

---

## Goals

- All current Anthropic models selectable individually (Opus 4.7, Sonnet 4.6, Haiku 4.5)
- Gemini remains alongside Anthropic models in one flat dropdown
- Every generation returns metrics: input tokens, output tokens, latency (ms), estimated cost (USD), model ID
- Metrics displayed in a slim bar directly below the output terminal
- Dropdown shows human-readable display names (e.g. "Claude Sonnet 4.6"), not raw model IDs

---

## Architecture

### Approach: Dynamic model routing (Option B)

One agent class per provider (`ClaudeAgent`, `GeminiAgent`). The model ID is passed at call time, not baked into the agent instance. A static model catalog in `AgentFactory` maps model IDs → `{ displayName, provider }`.

This keeps agent classes focused on provider-specific API logic while the factory owns the model list.

---

## Backend Changes

### Model catalog

`AgentFactory` gains a static `MODEL_CATALOG` array:

```js
[
  { id: "claude-opus-4-7",           displayName: "Claude Opus 4.7",   provider: "claude" },
  { id: "claude-sonnet-4-6",         displayName: "Claude Sonnet 4.6", provider: "claude" },
  { id: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5",  provider: "claude" },
  { id: "gemini",                    displayName: "Gemini 2.5 Pro",     provider: "gemini" }
]
```

### `GET /agents` — response shape change

Before: `{ agents: ["claude", "gemini"] }`  
After: `{ models: [{ id, displayName, provider }, ...] }`

### `POST /generate` — request shape change

Before: `{ prompt, agent: "claude" }`  
After: `{ prompt, model: "claude-sonnet-4-6" }`

Server resolves `provider` from the catalog, routes to the matching agent instance, and calls `agent.generate(prompt, modelId)`.

### `BaseAgent.generate()` — return shape change

Before: returns `string` (raw output)  
After: returns `{ output: string, metrics: { modelId, inputTokens, outputTokens, latencyMs, estimatedCostUsd } }`

All agents must implement this shape. Fields that cannot be determined (e.g. tokens on mock fallback) are `null`.

### `GET /generate` — response shape change

Before: `{ output, agent }`  
After: `{ output, metrics: { modelId, inputTokens, outputTokens, latencyMs, estimatedCostUsd } }`

### `ClaudeAgent`

- `generate(prompt, modelId)` wraps the API call in `Date.now()` for latency
- Reads `response.usage.input_tokens` and `response.usage.output_tokens`
- Looks up cost from `MODEL_PRICING` (see below)
- Falls back to mock on API failure; metrics fields are `null` on mock

### `GeminiAgent`

- Same signature: `generate(prompt, modelId)`
- Reads usage fields from the Gemini API response (`usageMetadata.promptTokenCount`, `candidatesTokenCount`)
- Falls back to mock; metrics are `null` on mock

### `pricing.js` (new file: `backend/pricing.js`)

Static map of model ID → per-token rates (USD per token):

```js
export const MODEL_PRICING = {
  "claude-opus-4-7":           { input: 15 / 1_000_000,  output: 75 / 1_000_000 },
  "claude-sonnet-4-6":         { input: 3  / 1_000_000,  output: 15 / 1_000_000 },
  "claude-haiku-4-5-20251001": { input: 0.8 / 1_000_000, output: 4  / 1_000_000 },
  "gemini":                    { input: 0,                output: 0 }  // update when known
}
```

Cost formula: `(inputTokens × inputRate) + (outputTokens × outputRate)`, rounded to 4 decimal places.

---

## Frontend Changes

### Dropdown population

`onMounted` calls `GET /agents` and maps `response.data.models` into the `<select>`. Each `<option>` uses `model.id` as `:value` and `model.displayName` as its label.

`selectedModel` (renamed from `selectedAgent`) defaults to `"claude-sonnet-4-6"`.

### Generate request

Payload changes from `{ prompt, agent }` to `{ prompt, model: selectedModel.value }`.

### Response handling

Frontend now reads both `response.data.output` and `response.data.metrics`. Metrics are stored in a `metrics` ref, reset to `null` before each request.

### Metrics bar (new UI element)

Rendered below the output terminal when `metrics` is non-null:

```
MODEL claude-sonnet-4-6  |  TOKENS ↑ 124  ↓ 890  |  LATENCY 1,243 ms  |  COST ~ $0.0031
```

- Dark background matching the terminal (`bg-black` / `#0f172a`)
- Monospace font, colour-coded fields: cyan for input tokens, purple for output, orange for latency, green for cost
- Hidden (not rendered) until first generation completes
- `null` metric fields display as `—`

### Sidebar status

"Active Agent" label changes to "Active Model" and shows `displayName` (looked up from the catalog).

---

## Data Flow

```
onMounted → GET /agents → populate dropdown

click Generate
  → POST /generate { prompt, model }
  → server: catalog lookup → agent.generate(prompt, modelId)
  → agent: timer start → API call → timer stop → { output, metrics }
  → server: return { output, metrics }
  → frontend: render output terminal + metrics bar
```

---

## Error Handling

No changes to existing error behaviour. If the API call fails, `ClaudeAgent` falls back to mock generation (already implemented). Metrics token fields are `null` on mock; latency is still measured. The frontend renders `—` for null metric fields.

---

## Out of Scope (MVP)

- Streaming responses
- Side-by-side model comparison
- Persisting generation history
- Older Claude 3.x model support
- Updating pricing table via UI
