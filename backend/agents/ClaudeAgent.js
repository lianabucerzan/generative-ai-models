// backend/agents/ClaudeAgent.js
import { execFileSync, spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import { BaseAgent } from "./BaseAgent.js";
import { estimateCost } from "../pricing.js";
import { createMcpFigmaService } from "../services/McpFigmaService.js";

// Project root: backend/agents/ -> backend/ -> project root
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let Anthropic = null;

try {
  const anthropicModule = await import("@anthropic-ai/sdk");
  Anthropic = anthropicModule.default;
} catch {
  // SDK is optional — falls back to claude CLI or mock
}

function claudeCLIAvailable() {
  try {
    execFileSync("which", ["claude"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

let _figmaService = null;

async function getFigmaService() {
  if (!_figmaService) {
    _figmaService = await createMcpFigmaService().catch(() => null);
  }
  return _figmaService;
}

export class ClaudeAgent extends BaseAgent {
  constructor() {
    super("claude", "Anthropic Claude");
    this.client = null;
    this.useCLI = false;

    if (process.env.ANTHROPIC_API_KEY && Anthropic) {
      try {
        this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        console.log("Claude Agent: API key found, using SDK");
      } catch (error) {
        console.warn("Claude Agent: failed to initialize client", error.message);
      }
    }

    if (!this.client) {
      this.useCLI = claudeCLIAvailable();
      if (this.useCLI) {
        console.log("Claude Agent: no API key, using claude CLI");
      } else {
        console.log("Claude Agent: no API key and no CLI, using mock generation");
      }
    }

    getFigmaService().then((svc) => console.log("Figma:", svc ? "MCP ready" : "disabled (no FIGMA_API_KEY or MCP unavailable)"));
  }

  async generate(prompt, modelId, image = null) {
    if (this.client) {
      return this._generateWithAPI(prompt, modelId, image);
    }
    if (this.useCLI) {
      if (image) {
        throw new Error("Image input requires an API key — add ANTHROPIC_API_KEY to backend/.env");
      }
      return this._generateWithCLI(prompt, modelId);
    }
    const start = Date.now();
    return {
      output: this._generateWithMock(prompt),
      metrics: { modelId, inputTokens: null, outputTokens: null, latencyMs: Date.now() - start, estimatedCostUsd: null },
    };
  }

  async _generateWithAPI(prompt, modelId, image = null) {
    const start = Date.now();

    const tools = [
      {
        name: "get_figma_design",
        description:
          "Fetch design data from a Figma node — colors, fonts, dimensions, and a PNG screenshot. " +
          "Call this when the user provides a Figma URL in their prompt.",
        input_schema: {
          type: "object",
          properties: {
            figma_url: {
              type: "string",
              description: "The full Figma URL including the node-id query parameter.",
            },
          },
          required: ["figma_url"],
        },
      },
    ];

    const userContent = image
      ? [
          { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.data } },
          { type: "text", text: prompt || "Recreate this UI as plain HTML with Tailwind CSS classes." },
        ]
      : prompt;

    const messages = [{ role: "user", content: userContent }];

    try {
      const messagePayload = {
        model: modelId,
        max_tokens: 4096,
        system: this.systemPrompt,
        tools,
        messages,
      };

      const msg1 = await this.client.messages.create(messagePayload);
      let finalMessage = msg1;

      if (msg1.stop_reason === "tool_use") {
        const toolUse = msg1.content.find((b) => b.type === "tool_use");
        const figmaSvc = await getFigmaService();
        const figmaText = figmaSvc
          ? await figmaSvc.extract(toolUse.input.figma_url)
          : null;

        const toolResultContent = figmaText
          ? [{ type: "text", text: `Figma design data:\n${figmaText}\n\nGenerate an HTML component that faithfully replicates this design.` }]
          : [{ type: "text", text: "Figma data unavailable — generate from prompt only." }];

        finalMessage = await this.client.messages.create({
          model: modelId,
          max_tokens: 4096,
          system: this.systemPrompt,
          tools,
          messages: [
            ...messages,
            { role: "assistant", content: msg1.content },
            {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: toolUse.id,
                  content: toolResultContent,
                },
              ],
            },
          ],
        });
      }

      const latencyMs = Date.now() - start;
      const inputTokens = finalMessage.usage.input_tokens;
      const outputTokens = finalMessage.usage.output_tokens;
      const textBlock = finalMessage.content.find((b) => b.type === "text");
      return {
        output: textBlock?.text ?? "",
        metrics: {
          modelId,
          inputTokens,
          outputTokens,
          latencyMs,
          estimatedCostUsd: estimateCost(modelId, inputTokens, outputTokens),
        },
      };
    } catch (error) {
      console.warn("Claude Agent: API call failed, falling back to CLI or mock");
      console.error("Claude Agent error details:", error?.status, error?.message, error?.error);
      if (this.useCLI) {
        return this._generateWithCLI(prompt, modelId);
      }
      const latencyMs = Date.now() - start;
      return {
        output: this._generateWithMock(prompt),
        metrics: { modelId, inputTokens: null, outputTokens: null, latencyMs, estimatedCostUsd: null },
      };
    }
  }

  _buildFigmaPrompt(prompt, figmaText) {
    if (!figmaText) return prompt;
    return `Figma design data:\n${figmaText}\n\nUser request: ${prompt}\n\nGenerate an HTML component that faithfully replicates this Figma design using the exact colors, typography, border-radius, shadows, and spacing shown above.`;
  }

  async _generateWithCLI(prompt, modelId) {
    const start = Date.now();
    const env = { ...process.env };
    delete env.CLAUDECODE;

    // Extract Figma URL from prompt and fetch tokens if available
    const figmaUrlMatch = prompt.match(/https:\/\/(?:www\.)?figma\.com\/\S+node-id=[\w%:-]+/);
    const figmaUrl = figmaUrlMatch?.[0] ?? null;
    const cleanPrompt = figmaUrl
      ? prompt.replace(figmaUrl, "").trim() || "Replicate this design as an HTML component with Tailwind CSS"
      : prompt;

    const figmaSvc = figmaUrl ? await getFigmaService() : null;
    const figmaText = figmaSvc
      ? await figmaSvc.extract(figmaUrl).catch(() => null)
      : null;

    const enhancedPrompt = this._buildFigmaPrompt(cleanPrompt, figmaText);

    return new Promise((resolve) => {
      const cliSystemPrompt = this.systemPrompt + " No questions, no explanations.";
      const cliPrompt = `${enhancedPrompt}. Output ONLY the SFC code, no questions or explanations.`;

      const proc = spawn(
        "claude",
        [
          "-p", cliPrompt,
          "--system-prompt", cliSystemPrompt,
          "--model", modelId,
          "--no-session-persistence",
          "--output-format", "json",
        ],
        { env, cwd: PROJECT_ROOT, stdio: ["ignore", "pipe", "pipe"] }
      );

      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => (stdout += d));
      proc.stderr.on("data", (d) => (stderr += d));

      proc.on("close", (code) => {
        const latencyMs = Date.now() - start;
        if (code !== 0) {
          console.warn("Claude CLI exited with code", code, stderr.slice(0, 200));
          resolve({
            output: this._generateWithMock(prompt),
            metrics: { modelId, inputTokens: null, outputTokens: null, latencyMs, estimatedCostUsd: null },
          });
        } else {
          try {
            const parsed = JSON.parse(stdout.trim());
            const output = parsed.result.trim().replace(/^```(?:html|vue|)?\n?/, "").replace(/\n?```$/, "");
            const inputTokens = parsed.usage?.input_tokens ?? null;
            const outputTokens = parsed.usage?.output_tokens ?? null;
            const estimatedCostUsd = parsed.total_cost_usd != null
              ? Math.round(parsed.total_cost_usd * 10000) / 10000
              : null;
            resolve({
              output,
              metrics: { modelId, inputTokens, outputTokens, latencyMs: parsed.duration_ms ?? latencyMs, estimatedCostUsd },
            });
          } catch {
            const output = stdout.trim().replace(/^```(?:html|vue|)?\n?/, "").replace(/\n?```$/, "");
            resolve({
              output,
              metrics: { modelId, inputTokens: null, outputTokens: null, latencyMs, estimatedCostUsd: null },
            });
          }
        }
      });

      proc.on("error", (err) => {
        console.warn("Claude CLI error:", err.message);
        const latencyMs = Date.now() - start;
        resolve({
          output: this._generateWithMock(prompt),
          metrics: { modelId, inputTokens: null, outputTokens: null, latencyMs, estimatedCostUsd: null },
        });
      });
    });
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
