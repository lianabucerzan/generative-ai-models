# LLM UI Arena — Design Spec

**Date:** 2026-05-27
**Status:** Approved

## Overview

A demo app that lets the user type a prompt describing a Vue 3 component, run it against one or more Claude models simultaneously, and compare the results across response time, token usage, cost, generated code, and a live rendered preview.

---

## Architecture

### Backend (`backend/server.js`)

- Replace `openai` dependency with `@anthropic-ai/sdk`.
- Single endpoint: `POST /generate`
  - Request body: `{ prompt: string, model: string }`
  - Model values: `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`, `claude-opus-4-7`
  - System prompt: `"You generate Vue 3 Single File Components using Tailwind CSS. Return only code."`
  - Timing measured server-side around the Anthropic call.
  - Success response: `{ output: string, inputTokens: number, outputTokens: number, durationMs: number }`
  - Error response: `{ error: "Generation failed" }` with HTTP 500

### Frontend (`frontend/src/`)

New files to create:
- `composables/useGenerate.ts`
- `components/PromptInput.vue`
- `components/ModelCard.vue`
- `components/CodeView.vue`
- `components/PreviewPane.vue`

`App.vue` is updated to a layout shell: `PromptInput` on top, a flex row of `ModelCard`s below.

No Vue Router needed. No state management library needed.

---

## UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  LLM UI Arena                                           │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐  │
│  │  Describe the component you want...               │  │
│  └───────────────────────────────────────────────────┘  │
│  ☑ Haiku   ☑ Sonnet   ☑ Opus   [Run Selected] [Compare All] │
├──────────────┬──────────────┬──────────────────────────┤
│  Haiku 4.5   │  Sonnet 4.6  │  Opus 4.7               │
│  ● Loading…  │  ✓ 1.2s      │  ✓ 3.8s                 │
│  Time: –     │  Time: 1.2s  │  Time: 3.8s             │
│  In: –       │  In: 142tok  │  In: 142tok             │
│  Out: –      │  Out: 312tok │  Out: 489tok            │
│  Cost: –     │  Cost: $0.00 │  Cost: $0.01            │
│  [Code][Preview]  [Code][Preview]  [Code][Preview]     │
│  ┌────────┐  │  ┌────────┐  │  ┌────────┐             │
│  │        │  │  │ Monaco │  │  │ Monaco │             │
│  │        │  │  │  or    │  │  │  or    │             │
│  │        │  │  │ iframe │  │  │ iframe │             │
│  └────────┘  │  └────────┘  │  └────────┘             │
└──────────────┴──────────────┴──────────────────────────┘
```

---

## Data Flow

1. User types a prompt and clicks **Compare All** (or selects specific models and clicks **Run Selected**).
2. Frontend fires up to 3 simultaneous `POST /generate` requests, one per selected model. A client-side timer starts for each.
3. Each response arrives independently. Its `ModelCard` updates immediately without waiting for the others.
4. On response arrival: timer stops, cost is computed on the frontend, Monaco Editor and `PreviewPane` are populated.
5. Cards still in-flight show a spinner. Finished cards show a green checkmark and elapsed time.

The "race" effect — cards resolving at different times — is the core demo value.

---

## Component Details

### `useGenerate.ts`

Composable instantiated once per `ModelCard`. Reactive state:

| Field | Type | Description |
|---|---|---|
| `status` | `'idle' \| 'loading' \| 'done' \| 'error'` | Current state |
| `output` | `string` | Raw generated SFC code |
| `durationMs` | `number` | Server-reported generation time |
| `inputTokens` | `number` | Tokens in |
| `outputTokens` | `number` | Tokens out |
| `cost` | `number` | Computed cost in USD |

Exposes a `run(prompt: string)` method. Cost computed using these constants:

| Model | Input ($/M) | Output ($/M) |
|---|---|---|
| Haiku 4.5 | $0.80 | $4.00 |
| Sonnet 4.6 | $3.00 | $15.00 |
| Opus 4.7 | $15.00 | $75.00 |

### `PromptInput.vue`

- Textarea for the prompt
- Three checkboxes (one per model), all checked by default
- **Run Selected** button — runs only checked models
- **Compare All** button — forces all three to run regardless of checkboxes

### `ModelCard.vue`

- Displays model name and status indicator (spinner / checkmark / error icon)
- Metrics row: time, input tokens, output tokens, cost
- Tab toggle: **Code** | **Preview**
- Hosts `CodeView` or `PreviewPane` based on active tab
- Uses `useGenerate` composable internally

### `CodeView.vue`

- Thin wrapper around Monaco Editor
- Read-only mode, language: `html`
- Receives generated code string as prop

### `PreviewPane.vue`

- Receives raw SFC string as prop
- Uses `vue3-sfc-loader` to compile at runtime
- Renders inside a sandboxed `<iframe srcdoc>` with Tailwind CSS injected via CDN
- Recompiles when the code prop changes
- Shows a user-friendly error message if compilation fails

---

## Dependencies to Add

### Backend
- Remove: `openai`
- Add: `@anthropic-ai/sdk`
- `.env`: replace `OPENAI_API_KEY` with `ANTHROPIC_API_KEY`

### Frontend
- Add: `vue3-sfc-loader` (`npm install vue3-sfc-loader`)

---

## Error Handling

- Per-card: network errors or HTTP 500 set `status = 'error'` and show an error message in the card
- `PreviewPane` catches `vue3-sfc-loader` compilation errors and shows them inline
- Backend logs errors to console and returns `{ error: "Generation failed" }` with HTTP 500

---

## Out of Scope

- Authentication
- Result persistence / history
- Streaming responses
- Models outside the Claude family
