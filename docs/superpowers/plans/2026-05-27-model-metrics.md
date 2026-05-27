# Model Selection & Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat agent dropdown with a per-model selector for all current Anthropic models + Gemini, and return generation metrics (tokens, latency, cost) displayed in a bar below the output terminal.

**Architecture:** One agent class per provider (`ClaudeAgent`, `GeminiAgent`). A static `MODEL_CATALOG` in `AgentFactory` maps model IDs to display names and provider keys. The `/generate` endpoint accepts a `model` ID, looks up the provider, routes to the right agent, and returns `{ output, metrics }`. The frontend populates the dropdown from `GET /agents` and renders the metrics bar after generation.

**Tech Stack:** Node.js (ESM), Express 5, `@anthropic-ai/sdk` (optional), Vue 3 + `<script setup>`, Tailwind CSS 4, Axios, Vite 8.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/pricing.js` | Static pricing table + `estimateCost()` helper |
| Modify | `backend/agents/BaseAgent.js` | Update `generate(prompt, modelId)` signature |
| Modify | `backend/agents/AgentFactory.js` | Add `MODEL_CATALOG`, `getModels()`, `getProviderForModel()` |
| Modify | `backend/agents/ClaudeAgent.js` | Multi-model support, metrics collection |
| Modify | `backend/agents/GeminiAgent.js` | Updated signature, mock metrics return shape |
| Modify | `backend/server.js` | Updated `/agents` response + `/generate` routing |
| Modify | `frontend/src/App.vue` | Model dropdown, updated payload, metrics bar |

---

## Task 1: Create pricing.js

**Files:**
- Create: `backend/pricing.js`

- [ ] **Step 1: Create the file**

```js
// backend/pricing.js
const MODEL_PRICING = {
  "claude-opus-4-7":            { input: 15  / 1_000_000, output: 75 / 1_000_000 },
  "claude-sonnet-4-6":          { input: 3   / 1_000_000, output: 15 / 1_000_000 },
  "claude-haiku-4-5-20251001":  { input: 0.8 / 1_000_000, output: 4  / 1_000_000 },
  "gemini":                     { input: 0,                output: 0              },
};

export function estimateCost(modelId, inputTokens, outputTokens) {
  if (inputTokens == null || outputTokens == null) return null;
  const rates = MODEL_PRICING[modelId];
  if (!rates) return null;
  const cost = inputTokens * rates.input + outputTokens * rates.output;
  return Math.round(cost * 10000) / 10000;
}
```

- [ ] **Step 2: Verify the file is importable**

```bash
cd /Users/devhub/Generative-UI/generative-ai-models/backend
node -e "import('./pricing.js').then(m => console.log(m.estimateCost('claude-sonnet-4-6', 1000, 500)))"
```

Expected output: `0.0105`

- [ ] **Step 3: Commit**

```bash
git add backend/pricing.js
git commit -m "feat: add model pricing table and estimateCost helper"
```

---

## Task 2: Update BaseAgent

**Files:**
- Modify: `backend/agents/BaseAgent.js`

- [ ] **Step 1: Update `generate()` signature**

Replace the entire file content:

```js
// backend/agents/BaseAgent.js
export class BaseAgent {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.systemPrompt =
      "You generate Vue 3 Single File Components using Tailwind CSS. Return only valid Vue 3 SFC code without markdown formatting or backticks.";
  }

  // Returns { output: string, metrics: { modelId, inputTokens, outputTokens, latencyMs, estimatedCostUsd } }
  // inputTokens, outputTokens, estimatedCostUsd are null when using mock generation.
  async generate(prompt, modelId) {
    throw new Error("generate() must be implemented by subclass");
  }

  prepareMessages(prompt) {
    return [
      { role: "system", content: this.systemPrompt },
      { role: "user",   content: prompt },
    ];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/agents/BaseAgent.js
git commit -m "feat: update BaseAgent.generate() signature to accept modelId"
```

---

## Task 3: Update AgentFactory

**Files:**
- Modify: `backend/agents/AgentFactory.js`

- [ ] **Step 1: Replace the file with the model catalog and new methods**

```js
// backend/agents/AgentFactory.js
import { ClaudeAgent } from "./ClaudeAgent.js";
import { GeminiAgent } from "./GeminiAgent.js";

export class AgentFactory {
  static MODEL_CATALOG = [
    { id: "claude-opus-4-7",           displayName: "Claude Opus 4.7",   provider: "claude" },
    { id: "claude-sonnet-4-6",         displayName: "Claude Sonnet 4.6", provider: "claude" },
    { id: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5",  provider: "claude" },
    { id: "gemini",                    displayName: "Gemini 2.5 Pro",     provider: "gemini" },
  ];

  constructor() {
    this.agents = new Map();
    this._initializeAgents();
  }

  _initializeAgents() {
    [new ClaudeAgent(), new GeminiAgent()].forEach((agent) => {
      this.agents.set(agent.name, agent);
    });
  }

  // Returns { id, displayName, provider }[] — used by GET /agents
  getModels() {
    return AgentFactory.MODEL_CATALOG;
  }

  // Returns "claude" | "gemini" | null
  getProviderForModel(modelId) {
    return AgentFactory.MODEL_CATALOG.find((m) => m.id === modelId)?.provider ?? null;
  }

  getAgent(name) {
    return this.agents.get(name) ?? null;
  }

  getAvailableAgents() {
    return Array.from(this.agents.keys());
  }

  registerAgent(agent) {
    this.agents.set(agent.name, agent);
  }
}
```

- [ ] **Step 2: Verify from the backend directory**

```bash
cd /Users/devhub/Generative-UI/generative-ai-models/backend
node -e "
import('./agents/AgentFactory.js').then(({ AgentFactory }) => {
  const f = new AgentFactory();
  console.log(f.getModels().map(m => m.id));
  console.log(f.getProviderForModel('claude-sonnet-4-6'));
  console.log(f.getProviderForModel('unknown'));
});
"
```

Expected output:
```
[ 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'gemini' ]
claude
null
```

- [ ] **Step 3: Commit**

```bash
git add backend/agents/AgentFactory.js
git commit -m "feat: add MODEL_CATALOG and model routing methods to AgentFactory"
```

---

## Task 4: Update ClaudeAgent

**Files:**
- Modify: `backend/agents/ClaudeAgent.js`

- [ ] **Step 1: Replace the file**

```js
// backend/agents/ClaudeAgent.js
import { BaseAgent } from "./BaseAgent.js";
import { estimateCost } from "../pricing.js";

let Anthropic = null;

try {
  const anthropicModule = await import("@anthropic-ai/sdk");
  Anthropic = anthropicModule.default;
} catch (error) {
  // SDK is optional — falls back to mock generation
}

export class ClaudeAgent extends BaseAgent {
  constructor() {
    super("claude", "Anthropic Claude");
    this.client = null;

    if (process.env.ANTHROPIC_API_KEY && Anthropic) {
      try {
        this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        console.log("Claude Agent: client initialized");
      } catch (error) {
        console.warn("Claude Agent: failed to initialize client", error.message);
      }
    } else if (!Anthropic) {
      console.log("Claude Agent: SDK not installed. Using mock generation");
    } else {
      console.log("Claude Agent: no API key. Using mock generation");
    }
  }

  async generate(prompt, modelId) {
    if (this.client) {
      return this._generateWithAPI(prompt, modelId);
    }
    const start = Date.now();
    const output = this._generateWithMock(prompt);
    const latencyMs = Date.now() - start;
    return {
      output,
      metrics: { modelId, inputTokens: null, outputTokens: null, latencyMs, estimatedCostUsd: null },
    };
  }

  async _generateWithAPI(prompt, modelId) {
    const start = Date.now();
    try {
      const message = await this.client.messages.create({
        model: modelId,
        max_tokens: 2000,
        system: this.systemPrompt,
        messages: [{ role: "user", content: prompt }],
      });
      const latencyMs = Date.now() - start;
      const inputTokens = message.usage.input_tokens;
      const outputTokens = message.usage.output_tokens;
      return {
        output: message.content[0].text,
        metrics: {
          modelId,
          inputTokens,
          outputTokens,
          latencyMs,
          estimatedCostUsd: estimateCost(modelId, inputTokens, outputTokens),
        },
      };
    } catch (error) {
      console.warn("Claude Agent: API call failed, falling back to mock");
      const latencyMs = Date.now() - start;
      const output = this._generateWithMock(prompt);
      return {
        output,
        metrics: { modelId, inputTokens: null, outputTokens: null, latencyMs, estimatedCostUsd: null },
      };
    }
  }

  _generateWithMock(prompt) {
    const mockComponents = [
      `<template>
  <div class="flex items-center justify-center min-h-screen bg-slate-50">
    <div class="w-full max-w-lg">
      <div class="bg-white rounded-xl shadow-md p-8 border border-slate-200">
        <h3 class="text-xl font-semibold text-slate-900 mb-3">${prompt}</h3>
        <p class="text-slate-600 text-sm mb-6">This component was generated by Claude Agent</p>
        <div class="space-y-3">
          <input type="text" placeholder="Enter your input" class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-slate-500" />
          <button class="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-2 rounded-lg transition">
            Submit
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Component generated by Claude Agent
</script>

<style scoped>
/* Tailwind styles applied via classes */
</style>`,
      `<template>
  <section class="bg-white">
    <div class="max-w-4xl mx-auto px-4 py-12">
      <div class="grid md:grid-cols-2 gap-8">
        <div class="space-y-4">
          <h2 class="text-3xl font-bold text-gray-900">${prompt}</h2>
          <p class="text-gray-600 leading-relaxed">Generated by Claude Agent with elegant design patterns</p>
          <button class="inline-flex items-center px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition">
            Get Started
          </button>
        </div>
        <div class="bg-slate-100 rounded-lg h-64 flex items-center justify-center">
          <span class="text-slate-500">Preview Area</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// Component generated by Claude Agent
</script>

<style scoped>
/* Tailwind styles applied via classes */
</style>`,
    ];
    return mockComponents[Math.floor(Math.random() * mockComponents.length)];
  }
}
```

- [ ] **Step 2: Smoke-test mock path (no API key needed)**

```bash
cd /Users/devhub/Generative-UI/generative-ai-models/backend
node -e "
import('./agents/ClaudeAgent.js').then(async ({ ClaudeAgent }) => {
  const a = new ClaudeAgent();
  const result = await a.generate('test prompt', 'claude-sonnet-4-6');
  console.log(typeof result.output);
  console.log(result.metrics.modelId);
  console.log(result.metrics.inputTokens);
});
"
```

Expected output:
```
string
claude-sonnet-4-6
null
```

- [ ] **Step 3: Commit**

```bash
git add backend/agents/ClaudeAgent.js
git commit -m "feat: ClaudeAgent supports dynamic modelId and returns metrics"
```

---

## Task 5: Update GeminiAgent

**Files:**
- Modify: `backend/agents/GeminiAgent.js`

- [ ] **Step 1: Replace the file**

```js
// backend/agents/GeminiAgent.js
import { BaseAgent } from "./BaseAgent.js";

export class GeminiAgent extends BaseAgent {
  constructor() {
    super("gemini", "Google Gemini");
    this.client = null;
  }

  async generate(prompt, modelId) {
    const start = Date.now();
    const output = this._generateWithMock(prompt);
    const latencyMs = Date.now() - start;
    return {
      output,
      metrics: { modelId, inputTokens: null, outputTokens: null, latencyMs, estimatedCostUsd: null },
    };
  }

  _generateWithMock(prompt) {
    const mockComponents = [
      `<template>
  <div class="bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 min-h-screen flex items-center">
    <div class="max-w-2xl mx-auto text-white px-4">
      <h1 class="text-5xl font-bold mb-4">${prompt}</h1>
      <p class="text-xl mb-8 text-blue-100">Generated by Gemini Agent with modern design</p>
      <div class="flex gap-4">
        <button class="px-8 py-3 bg-white text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition">
          Explore
        </button>
        <button class="px-8 py-3 border-2 border-white text-white font-bold rounded-lg hover:bg-white hover:text-blue-600 transition">
          Learn More
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Component generated by Gemini Agent
</script>

<style scoped>
/* Tailwind styles applied via classes */
</style>`,
      `<template>
  <div class="min-h-screen bg-white">
    <nav class="bg-gray-50 border-b border-gray-200">
      <div class="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
        <h2 class="text-2xl font-bold text-gray-900">${prompt}</h2>
        <button class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
          Action
        </button>
      </div>
    </nav>
    <div class="max-w-6xl mx-auto px-4 py-12">
      <div class="grid md:grid-cols-3 gap-6">
        <div class="p-6 border border-gray-200 rounded-lg hover:shadow-lg transition">
          <h3 class="text-lg font-semibold mb-2">Feature One</h3>
          <p class="text-gray-600">Generated by Gemini with responsive layout</p>
        </div>
        <div class="p-6 border border-gray-200 rounded-lg hover:shadow-lg transition">
          <h3 class="text-lg font-semibold mb-2">Feature Two</h3>
          <p class="text-gray-600">Clean and modern design patterns</p>
        </div>
        <div class="p-6 border border-gray-200 rounded-lg hover:shadow-lg transition">
          <h3 class="text-lg font-semibold mb-2">Feature Three</h3>
          <p class="text-gray-600">Optimized for all screen sizes</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Component generated by Gemini Agent
</script>

<style scoped>
/* Tailwind styles applied via classes */
</style>`,
    ];
    return mockComponents[Math.floor(Math.random() * mockComponents.length)];
  }
}
```

- [ ] **Step 2: Smoke-test**

```bash
cd /Users/devhub/Generative-UI/generative-ai-models/backend
node -e "
import('./agents/GeminiAgent.js').then(async ({ GeminiAgent }) => {
  const a = new GeminiAgent();
  const result = await a.generate('test', 'gemini');
  console.log(typeof result.output);
  console.log(result.metrics.modelId);
});
"
```

Expected output:
```
string
gemini
```

- [ ] **Step 3: Commit**

```bash
git add backend/agents/GeminiAgent.js
git commit -m "feat: GeminiAgent returns { output, metrics } shape"
```

---

## Task 6: Update server.js

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1: Replace the file**

```js
// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AgentFactory } from "./agents/AgentFactory.js";

dotenv.config();

const app = express();
const agentFactory = new AgentFactory();

app.use(cors());
app.use(express.json());

app.get("/agents", (req, res) => {
  res.json({ models: agentFactory.getModels() });
});

app.post("/generate", async (req, res) => {
  try {
    const { prompt, model } = req.body;

    if (!prompt || !model) {
      return res.status(400).json({ error: "prompt and model are required" });
    }

    const provider = agentFactory.getProviderForModel(model);
    if (!provider) {
      return res.status(400).json({
        error: `Unknown model '${model}'. Available: ${agentFactory.getModels().map((m) => m.id).join(", ")}`,
      });
    }

    const agent = agentFactory.getAgent(provider);
    const { output, metrics } = await agent.generate(prompt, model);

    res.json({ output, metrics });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Generation failed", details: error.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
  console.log("Models:", agentFactory.getModels().map((m) => m.displayName).join(", "));
});
```

- [ ] **Step 2: Start the server and verify `/agents`**

```bash
cd /Users/devhub/Generative-UI/generative-ai-models/backend
node server.js &
sleep 1
curl -s http://localhost:3000/agents | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
```

Expected output:
```json
{
  "models": [
    { "id": "claude-opus-4-7",           "displayName": "Claude Opus 4.7",   "provider": "claude" },
    { "id": "claude-sonnet-4-6",         "displayName": "Claude Sonnet 4.6", "provider": "claude" },
    { "id": "claude-haiku-4-5-20251001", "displayName": "Claude Haiku 4.5",  "provider": "claude" },
    { "id": "gemini",                    "displayName": "Gemini 2.5 Pro",     "provider": "gemini" }
  ]
}
```

- [ ] **Step 3: Verify `/generate` with mock**

```bash
curl -s -X POST http://localhost:3000/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"a button","model":"claude-sonnet-4-6"}' \
  | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log('output length:',r.output.length);console.log('metrics:',JSON.stringify(r.metrics))})"
```

Expected output (exact numbers vary):
```
output length: <number>
metrics: {"modelId":"claude-sonnet-4-6","inputTokens":null,"outputTokens":null,"latencyMs":<number>,"estimatedCostUsd":null}
```

- [ ] **Step 4: Stop the background server**

```bash
kill $(lsof -ti:3000) 2>/dev/null || true
```

- [ ] **Step 5: Commit**

```bash
git add backend/server.js
git commit -m "feat: update /agents and /generate endpoints for per-model routing and metrics"
```

---

## Task 7: Update App.vue

**Files:**
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: Replace the entire file**

```vue
<script setup>
import { ref, computed, onMounted } from "vue";
import axios from "axios";

const prompt = ref("");
const output = ref("");
const loading = ref(false);
const models = ref([]);
const selectedModel = ref("claude-sonnet-4-6");
const metrics = ref(null);
const error = ref("");

onMounted(async () => {
  try {
    const response = await axios.get("http://localhost:3000/agents");
    models.value = response.data.models;
  } catch (err) {
    console.error("Failed to fetch models:", err);
    models.value = [
      { id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", provider: "claude" },
      { id: "gemini",            displayName: "Gemini 2.5 Pro",     provider: "gemini" },
    ];
  }
});

const activeModelName = computed(() => {
  return models.value.find((m) => m.id === selectedModel.value)?.displayName ?? selectedModel.value;
});

const generateComponent = async () => {
  if (!prompt.value.trim()) {
    error.value = "Please enter a prompt";
    return;
  }

  error.value = "";
  loading.value = true;
  metrics.value = null;

  try {
    const response = await axios.post("http://localhost:3000/generate", {
      prompt: prompt.value,
      model: selectedModel.value,
    });

    output.value = response.data.output;
    metrics.value = response.data.metrics;
  } catch (err) {
    console.error(err);
    error.value = err.response?.data?.error || "Failed to generate component";
    output.value = "";
  } finally {
    loading.value = false;
  }
};

const fmt = (val) => (val !== null && val !== undefined ? val : "—");
const fmtCost = (val) => (val !== null && val !== undefined ? `~ $${val}` : "—");
const fmtMs = (val) => (val !== null && val !== undefined ? `${val.toLocaleString()} ms` : "—");
</script>

<template>
  <div class="min-h-screen bg-gray-100 p-8">
    <div class="max-w-6xl mx-auto">
      <h1 class="text-4xl font-bold mb-8 text-gray-900">LLM UI Arena</h1>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Input Section -->
        <div class="lg:col-span-1">
          <div class="bg-white rounded-xl p-6 shadow-lg sticky top-8">
            <h2 class="text-xl font-bold mb-4 text-gray-900">Generate Component</h2>

            <!-- Model Selection -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Select Model
              </label>
              <select
                v-model="selectedModel"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option
                  v-for="model in models"
                  :key="model.id"
                  :value="model.id"
                >
                  {{ model.displayName }}
                </option>
              </select>
              <p class="text-xs text-gray-500 mt-1">
                Different models generate unique component styles
              </p>
            </div>

            <!-- Prompt Input -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                Prompt
              </label>
              <textarea
                v-model="prompt"
                placeholder="e.g., Create a modern pricing card with three tiers..."
                class="w-full h-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            <!-- Error Message -->
            <div v-if="error" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {{ error }}
            </div>

            <!-- Generate Button -->
            <button
              @click="generateComponent"
              :disabled="loading"
              class="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-3 px-6 rounded-lg transition transform hover:scale-105 disabled:scale-100"
            >
              {{ loading ? "Generating..." : "Generate" }}
            </button>

            <!-- Stats -->
            <div class="mt-6 pt-6 border-t border-gray-200">
              <p class="text-xs text-gray-600">
                <span class="font-semibold">Active Model:</span> {{ activeModelName }}
              </p>
              <p class="text-xs text-gray-600 mt-1">
                <span class="font-semibold">Status:</span> {{ loading ? "Generating..." : "Ready" }}
              </p>
            </div>
          </div>
        </div>

        <!-- Output Section -->
        <div class="lg:col-span-2 flex flex-col gap-3">
          <div class="bg-black text-green-400 rounded-xl p-6 shadow-lg font-mono text-sm overflow-hidden flex flex-col flex-1">
            <div class="flex items-center justify-between mb-4">
              <span class="text-gray-500">$ Generated Component</span>
              <span v-if="output" class="text-xs text-green-500">Ready</span>
            </div>
            <pre v-if="output" class="flex-1 overflow-auto whitespace-pre-wrap break-words">{{ output }}</pre>
            <div v-else class="flex-1 flex items-center justify-center text-gray-600">
              <span>{{ loading ? "Generating component..." : "Component output will appear here" }}</span>
            </div>
          </div>

          <!-- Metrics Bar -->
          <div
            v-if="metrics"
            class="bg-black rounded-xl px-5 py-3 shadow-lg font-mono text-xs flex items-center gap-5 flex-wrap"
          >
            <div class="flex items-center gap-2">
              <span class="text-slate-500 uppercase tracking-widest text-[10px]">Model</span>
              <span class="text-slate-200">{{ fmt(metrics.modelId) }}</span>
            </div>
            <div class="w-px h-4 bg-slate-700"></div>
            <div class="flex items-center gap-2">
              <span class="text-slate-500 uppercase tracking-widest text-[10px]">Tokens</span>
              <span class="text-cyan-400">↑ {{ fmt(metrics.inputTokens) }}</span>
              <span class="text-violet-400">↓ {{ fmt(metrics.outputTokens) }}</span>
            </div>
            <div class="w-px h-4 bg-slate-700"></div>
            <div class="flex items-center gap-2">
              <span class="text-slate-500 uppercase tracking-widest text-[10px]">Latency</span>
              <span class="text-orange-400">{{ fmtMs(metrics.latencyMs) }}</span>
            </div>
            <div class="w-px h-4 bg-slate-700"></div>
            <div class="flex items-center gap-2">
              <span class="text-slate-500 uppercase tracking-widest text-[10px]">Cost</span>
              <span class="text-green-400">{{ fmtCost(metrics.estimatedCostUsd) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
select, textarea, button {
  transition: all 0.2s ease;
}

textarea:focus {
  transform: scale(1.02);
}
</style>
```

- [ ] **Step 2: Start both servers and verify in the browser**

Terminal 1 — backend:
```bash
cd /Users/devhub/Generative-UI/generative-ai-models/backend && npm run dev
```

Terminal 2 — frontend:
```bash
cd /Users/devhub/Generative-UI/generative-ai-models/frontend && npm run dev
```

Open `http://localhost:5173` (or the URL Vite prints). Verify:
1. Dropdown shows: Claude Opus 4.7, Claude Sonnet 4.6, Claude Haiku 4.5, Gemini 2.5 Pro
2. Type any prompt and click Generate
3. Output appears in the terminal panel
4. Metrics bar appears below the output with model ID, tokens (or `—`), latency in ms, cost (or `—`)
5. Sidebar shows "Active Model: Claude Sonnet 4.6" (updates when dropdown changes)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.vue
git commit -m "feat: model dropdown with display names and metrics bar below output"
```

---

## Self-Review

**Spec coverage:**
- ✅ All current Anthropic models in dropdown (Opus 4.7, Sonnet 4.6, Haiku 4.5)
- ✅ Gemini kept alongside Anthropic models
- ✅ Flat dropdown with friendly display names
- ✅ Input tokens, output tokens, latency, cost estimate, model ID all returned
- ✅ Metrics bar below output terminal
- ✅ `null` metric fields display as `—`
- ✅ Sidebar "Active Agent" → "Active Model" with display name
- ✅ Mock fallback: latency measured, token/cost fields are `null`

**Placeholder scan:** No TBDs, TODOs, or vague steps. All code blocks are complete.

**Type consistency:**
- `generate(prompt, modelId)` — consistent across BaseAgent (Task 2), ClaudeAgent (Task 4), GeminiAgent (Task 5), and the server call (Task 6)
- `{ output, metrics }` return shape — consistent across ClaudeAgent, GeminiAgent, and server destructuring
- `metrics.{ modelId, inputTokens, outputTokens, latencyMs, estimatedCostUsd }` — consistent across agents and `fmt*` helpers in App.vue
- `agentFactory.getModels()` → `models[]` — consistent between Task 3 and Task 6
- `agentFactory.getProviderForModel(modelId)` — defined in Task 3, used in Task 6
- `response.data.models` in `onMounted` matches `{ models: [...] }` from `/agents` (Task 6)
