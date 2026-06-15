<script setup>
import { ref, computed, onMounted } from "vue";
import axios from "axios";

const prompt = ref("");
const models = ref([]);
const results = ref({});
const error = ref("");
const imageData = ref(null);
const imageMimeType = ref(null);
const imagePreview = ref(null);
const fileInputRef = ref(null);

const loadImageFile = (file) => {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const [header, data] = dataUrl.split(",");
    imageMimeType.value = header.match(/data:([^;]+)/)[1];
    imageData.value = data;
    imagePreview.value = dataUrl;
  };
  reader.readAsDataURL(file);
};

const handlePaste = (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      loadImageFile(item.getAsFile());
      break;
    }
  }
};

const handleDrop = (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) loadImageFile(file);
};

const handleFileInput = (e) => {
  loadImageFile(e.target.files?.[0]);
};

const clearImage = () => {
  imageData.value = null;
  imageMimeType.value = null;
  imagePreview.value = null;
  if (fileInputRef.value) fileInputRef.value.value = "";
};

onMounted(async () => {
  try {
    const response = await axios.get("http://localhost:3000/agents");
    models.value = response.data.models;
  } catch {
    models.value = [
      { id: "claude-opus-4-8",           displayName: "Claude Opus 4.8",   provider: "claude" },
      { id: "claude-sonnet-4-6",         displayName: "Claude Sonnet 4.6", provider: "claude" },
      { id: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5",  provider: "claude" },
    ];
  }
});

const anyLoading = computed(() => Object.values(results.value).some((r) => r.loading));
const hasContent = computed(() => prompt.value || imageData.value || Object.keys(results.value).length > 0);

const clearAll = () => {
  prompt.value = "";
  error.value = "";
  results.value = {};
  clearImage();
};

const generateComponent = async () => {
  if (!prompt.value.trim() && !imageData.value) {
    error.value = "Please enter a prompt or paste an image";
    return;
  }
  error.value = "";

  // Set all models to loading
  const initial = {};
  models.value.forEach((m) => {
    initial[m.id] = { output: null, metrics: null, loading: true, error: null };
  });
  results.value = initial;

  // Fire all requests in parallel — each updates its slot as it resolves
  models.value.forEach(async (model) => {
    try {
      const payload = { prompt: prompt.value, model: model.id };
      if (imageData.value) {
        payload.image = { data: imageData.value, mimeType: imageMimeType.value };
      }
      const res = await axios.post("http://localhost:3000/generate", payload);
      results.value[model.id] = {
        output: res.data.output,
        metrics: res.data.metrics,
        loading: false,
        error: null,
      };
    } catch (err) {
      results.value[model.id] = {
        output: null,
        metrics: null,
        loading: false,
        error: err.response?.data?.error || "Generation failed",
      };
    }
  });
};

const buildPreviewDoc = (html) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"><\/script>
</head>
<body class="p-4">${html}</body>
</html>`;

const isNullish = (val) => val === null || val === undefined || (typeof val === "number" && isNaN(val));
const fmt = (val) => (!isNullish(val) ? val : "—");
const fmtCost = (val) => (!isNullish(val) ? `~ $${val}` : "—");
const fmtMs = (val) => (!isNullish(val) ? `${val.toLocaleString()} ms` : "—");
</script>

<template>
  <div class="min-h-screen bg-gray-100 p-8">
    <div class="max-w-7xl mx-auto">

      <!-- Header + prompt bar -->
      <div class="mb-8">
        <h1 class="text-4xl font-bold text-gray-900 mb-5">Generative UI</h1>

        <div class="flex gap-3 items-start">
          <div class="flex-1 flex flex-col gap-2">
            <!-- Image preview -->
            <div
              v-if="imagePreview"
              class="relative inline-flex"
            >
              <img :src="imagePreview" class="max-h-40 rounded-xl border border-gray-200 object-contain" />
              <button
                @click="clearImage"
                class="absolute -top-2 -right-2 w-6 h-6 bg-white border border-gray-300 rounded-full text-gray-500 hover:text-red-500 shadow text-xs font-bold flex items-center justify-center"
              >✕</button>
            </div>

            <!-- Textarea -->
            <textarea
              v-model="prompt"
              @paste="handlePaste"
              :placeholder="imagePreview ? 'Add instructions (optional)' : 'Describe a UI component — or paste a Figma frame URL anywhere in your prompt'"
              class="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white shadow-sm resize-none h-16 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            <!-- Drop zone (hidden file input) -->
            <div
              class="border-2 border-dashed border-gray-200 rounded-xl px-4 py-2 text-xs text-gray-400 text-center cursor-pointer hover:border-blue-300 hover:text-blue-400 transition"
              @dragover.prevent
              @drop.prevent="handleDrop"
              @click="fileInputRef.click()"
            >
              Drop an image here or click to upload
            </div>
            <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileInput" />
          </div>

          <div class="flex flex-col gap-2 self-end">
            <button
              @click="generateComponent"
              :disabled="anyLoading"
              class="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold rounded-xl transition"
            >
              {{ anyLoading ? "Generating…" : "Generate" }}
            </button>
            <button
              v-if="hasContent"
              @click="clearAll"
              :disabled="anyLoading"
              class="px-8 py-2 bg-white hover:bg-gray-50 disabled:opacity-40 border border-gray-300 text-gray-600 font-medium rounded-xl transition text-sm"
            >
              Clear
            </button>
          </div>
        </div>

        <p v-if="error" class="mt-2 text-sm text-red-600">{{ error }}</p>
      </div>

      <!-- 2×2 model grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          v-for="model in models"
          :key="model.id"
          class="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col"
        >
          <!-- Card header -->
          <div class="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <span class="font-semibold text-gray-900 text-sm">{{ model.displayName }}</span>
            <span v-if="results[model.id]?.loading" class="text-xs text-blue-500 animate-pulse">Generating…</span>
            <span v-else-if="results[model.id]?.output" class="text-xs text-green-500">Ready</span>
            <span v-else-if="results[model.id]?.error" class="text-xs text-red-400">Error</span>
          </div>

          <!-- Preview -->
          <div class="flex-1 min-h-64 p-5">
            <!-- Loading -->
            <div v-if="results[model.id]?.loading" class="h-64 flex items-center justify-center text-gray-300">
              <svg class="animate-spin h-8 w-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <!-- Output -->
            <iframe
              v-else-if="results[model.id]?.output"
              :srcdoc="buildPreviewDoc(results[model.id].output)"
              sandbox="allow-scripts allow-same-origin"
              class="w-full h-64 border-0"
            />
            <!-- Error -->
            <div v-else-if="results[model.id]?.error" class="h-64 flex items-center justify-center text-sm text-red-400">
              {{ results[model.id].error }}
            </div>
            <!-- Empty -->
            <div v-else class="h-64 flex items-center justify-center text-gray-300 text-sm">
              Preview will appear here
            </div>
          </div>

          <!-- Metrics bar -->
          <div
            v-if="results[model.id]?.metrics"
            class="bg-slate-900 px-4 py-2 font-mono text-xs flex items-center gap-4 flex-wrap"
          >
            <div class="flex items-center gap-1.5">
              <span class="text-slate-500 uppercase tracking-widest text-[9px]">Tokens</span>
              <span class="text-cyan-400">↑ {{ fmt(results[model.id].metrics.inputTokens) }}</span>
              <span class="text-violet-400">↓ {{ fmt(results[model.id].metrics.outputTokens) }}</span>
            </div>
            <div class="w-px h-3 bg-slate-700"></div>
            <div class="flex items-center gap-1.5">
              <span class="text-slate-500 uppercase tracking-widest text-[9px]">Latency</span>
              <span class="text-orange-400">{{ fmtMs(results[model.id].metrics.latencyMs) }}</span>
            </div>
            <div class="w-px h-3 bg-slate-700"></div>
            <div class="flex items-center gap-1.5">
              <span class="text-slate-500 uppercase tracking-widest text-[9px]">Cost</span>
              <span class="text-green-400">{{ fmtCost(results[model.id].metrics.estimatedCostUsd) }}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
textarea {
  transition: all 0.2s ease;
}
textarea:focus {
  transform: scale(1.01);
}
</style>
