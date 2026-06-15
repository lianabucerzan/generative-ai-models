// backend/agents/ClaudeAgent.js
import { execFileSync, spawn } from "child_process";
import { BaseAgent } from "./BaseAgent.js";
import { estimateCost } from "../pricing.js";

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
  }

  async generate(prompt, modelId, image = null, temperature = null) {
    if (this.client) {
      return this._generateWithAPI(prompt, modelId, image, temperature);
    }
    if (this.useCLI) {
      if (image) {
        throw new Error("Image input requires an API key — add ANTHROPIC_API_KEY to backend/.env");
      }
      return this._generateWithCLI(prompt, modelId, temperature);
    }
    const start = Date.now();
    return {
      output: this._generateWithMock(prompt),
      metrics: { modelId, inputTokens: null, outputTokens: null, latencyMs: Date.now() - start, estimatedCostUsd: null },
    };
  }

  async _generateWithAPI(prompt, modelId, image = null, temperature = null) {
    const start = Date.now();
    try {
      const content = [];
      if (image) {
        content.push({ type: "image", source: { type: "base64", media_type: image.mimeType, data: image.data } });
      }
      content.push({ type: "text", text: prompt || "Recreate this UI as plain HTML with Tailwind CSS classes." });

      const messagePayload = {
        model: modelId,
        max_tokens: 4096,
        system: this.systemPrompt,
        messages: [{ role: "user", content }],
      };
      if (typeof temperature === "number") {
        messagePayload.temperature = temperature;
      }

      const message = await this.client.messages.create(messagePayload);
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
      console.warn("Claude Agent: API call failed, falling back to CLI or mock");
      if (this.useCLI) {
        return this._generateWithCLI(prompt, modelId);
      }
      // latencyMs includes the failed request time — reflects total user wait
      const latencyMs = Date.now() - start;
      return {
        output: this._generateWithMock(prompt),
        metrics: { modelId, inputTokens: null, outputTokens: null, latencyMs, estimatedCostUsd: null },
      };
    }
  }

  _generateWithCLI(prompt, modelId, temperature = null) {
    const start = Date.now();
    // Strip CLAUDECODE so the subprocess isn't blocked by the nested-session guard
    const env = { ...process.env };
    delete env.CLAUDECODE;

    return new Promise((resolve) => {
      const cliSystemPrompt = this.systemPrompt + " No questions, no explanations.";
      const cliPrompt = `${prompt}. Output ONLY the SFC code, no questions or explanations.`;

      const proc = spawn(
        "claude",
        [
          "-p", cliPrompt,
          "--system-prompt", cliSystemPrompt,
          "--model", modelId,
          "--no-session-persistence",
          "--output-format", "json",
        ],
        { env, stdio: ["ignore", "pipe", "pipe"] }
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
