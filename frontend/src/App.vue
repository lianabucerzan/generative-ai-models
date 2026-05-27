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

const isNullish = (val) => val === null || val === undefined || (typeof val === "number" && isNaN(val));
const fmt = (val) => (!isNullish(val) ? val : "—");
const fmtCost = (val) => (!isNullish(val) ? `~ $${val}` : "—");
const fmtMs = (val) => (!isNullish(val) ? `${val.toLocaleString()} ms` : "—");

function buildPreviewDoc(sfc) {
  const templateContent = sfc.match(/<template[^>]*>([\s\S]*)<\/template>/)?.[1] ?? '<p style="color:red">Could not extract template block.</p>';
  const styleContent = sfc.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>${styleContent}</style>
</head>
<body style="margin:0">
  <template id="tpl">${templateContent}</template>
  <div id="app"></div>
  <script>
    const { createApp } = Vue;
    createApp({ template: document.getElementById('tpl').innerHTML }).mount('#app');
  <\/script>
</body>
</html>`;
}

const previewDoc = computed(() => (output.value ? buildPreviewDoc(output.value) : ''));
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
          <iframe
            v-if="output"
            :srcdoc="previewDoc"
            sandbox="allow-scripts allow-same-origin"
            class="w-full rounded-xl border-0 min-h-[500px] bg-white shadow-lg"
          />
          <div
            v-else
            class="bg-black text-green-400 rounded-xl p-6 shadow-lg font-mono text-sm flex items-center justify-center min-h-[500px]"
          >
            <span class="text-gray-600">{{ loading ? "Generating component..." : "Preview will appear here" }}</span>
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
