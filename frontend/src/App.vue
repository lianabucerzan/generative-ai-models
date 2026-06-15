<script setup>
import { ref, computed, watch, onMounted } from "vue";
import axios from "axios";

// ── Core state ────────────────────────────────────────────────────────────────
const prompt = ref("");
const models = ref([]);
const results = ref({});
const error = ref("");

// ── Image state ───────────────────────────────────────────────────────────────
const imageData = ref(null);
const imageMimeType = ref(null);
const imagePreview = ref(null);
const fileInputRef = ref(null);

// ── UI state ──────────────────────────────────────────────────────────────────
const cardView = ref({});       // modelId -> 'preview' | 'code'
const expandedCard = ref(null); // modelId | null
const chosenModelId = ref(null);// refinement base
const showHistory = ref(false);
const history = ref([]);
const copiedCard = ref(null);   // brief "Copied!" feedback
const savedCard = ref(null);    // { id, path } — brief save confirmation

// ── Presets ───────────────────────────────────────────────────────────────────
const PRESETS = [
  "Login form",
  "Pricing table",
  "Dashboard card",
  "Navbar with dropdown",
  "Settings page",
  "User profile card",
];

// ── Image handling ────────────────────────────────────────────────────────────
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

// ── History ───────────────────────────────────────────────────────────────────
const HISTORY_KEY = "generative-ui-history";

const loadHistory = () => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) history.value = JSON.parse(stored);
  } catch {}
};

const saveToHistory = () => {
  const completedResults = {};
  for (const [id, r] of Object.entries(results.value)) {
    if (r.output) completedResults[id] = { output: r.output, metrics: r.metrics };
  }
  if (!Object.keys(completedResults).length) return;
  const entry = {
    id: Date.now(),
    prompt: prompt.value,
    imagePreview: imagePreview.value,
    timestamp: new Date().toLocaleString(),
    results: completedResults,
    chosenModelId: chosenModelId.value,
  };
  const updated = [entry, ...history.value].slice(0, 20);
  history.value = updated;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
};

const restoreHistory = (entry) => {
  results.value = Object.fromEntries(
    Object.entries(entry.results).map(([id, r]) => [id, { ...r, loading: false, error: null }])
  );
  prompt.value = entry.prompt;
  if (entry.imagePreview) imagePreview.value = entry.imagePreview;
  chosenModelId.value = entry.chosenModelId ?? null;
  showHistory.value = false;
};

const clearHistory = () => {
  history.value = [];
  localStorage.removeItem(HISTORY_KEY);
};

// ── Generation ────────────────────────────────────────────────────────────────
const anyLoading = computed(() => Object.values(results.value).some((r) => r.loading));
const hasContent = computed(() => prompt.value || imageData.value || Object.keys(results.value).length > 0);

watch(anyLoading, (newVal, oldVal) => {
  if (!newVal && oldVal) saveToHistory();
});

const clearAll = () => {
  prompt.value = "";
  error.value = "";
  results.value = {};
  chosenModelId.value = null;
  clearImage();
};

const exitRefinement = () => {
  chosenModelId.value = null;
};

const generateComponent = async () => {
  if (!prompt.value.trim() && !imageData.value) {
    error.value = "Please enter a prompt or paste an image";
    return;
  }
  error.value = "";

  // In refinement mode inject the chosen output as context
  let effectivePrompt = prompt.value;
  if (chosenModelId.value && results.value[chosenModelId.value]?.output) {
    const base = results.value[chosenModelId.value].output;
    effectivePrompt = `Here is an existing HTML component:\n\`\`\`html\n${base}\n\`\`\`\n\nApply the following change: ${prompt.value}`;
  }

  const next = { ...results.value };
  models.value.forEach((m) => {
    next[m.id] = { output: null, metrics: null, loading: true, error: null };
  });
  results.value = next;

  models.value.forEach(async (model) => {
    try {
      const payload = { prompt: effectivePrompt, model: model.id };
      if (imageData.value) {
        payload.image = { data: imageData.value, mimeType: imageMimeType.value };
      }
      const res = await axios.post("http://localhost:3000/generate", payload);
      results.value[model.id] = { output: res.data.output, metrics: res.data.metrics, prompt: prompt.value, loading: false, error: null };
    } catch (err) {
      results.value[model.id] = { output: null, metrics: null, loading: false, error: err.response?.data?.error || "Generation failed" };
    }
  });
};

// ── Card actions ──────────────────────────────────────────────────────────────
const getCardView = (modelId) => cardView.value[modelId] ?? "preview";
const setCardView = (modelId, view) => { cardView.value[modelId] = view; };

const useThis = (modelId) => {
  chosenModelId.value = modelId;
  prompt.value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const copyCode = async (modelId) => {
  const code = results.value[modelId]?.output;
  if (!code) return;
  await navigator.clipboard.writeText(code);
  copiedCard.value = modelId;
  setTimeout(() => { copiedCard.value = null; }, 1500);
};

const downloadToProject = async (modelId) => {
  const result = results.value[modelId];
  if (!result?.output) return;
  try {
    const res = await axios.post("http://localhost:3000/save-component", {
      code: result.output,
      modelId,
      prompt: result.prompt || "",
    });
    savedCard.value = { id: modelId, path: res.data.path };
    setTimeout(() => { savedCard.value = null; }, 3000);
  } catch (err) {
    alert(err.response?.data?.error || "Save failed");
  }
};

// ── Misc ──────────────────────────────────────────────────────────────────────
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

onMounted(async () => {
  loadHistory();
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
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-[#060a0f]">

    <!-- ── Sidebar ─────────────────────────────────────────────── -->
    <aside class="w-[300px] min-w-[300px] flex flex-col h-screen overflow-y-auto bg-[#0d1520] border-r border-[#1a2535]">

      <!-- Branding -->
      <div class="px-5 py-4 border-b border-[#1a2535]">
        <div class="flex items-center gap-2.5 mb-1">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm shrink-0 bg-gradient-to-br from-[#0891b2] to-[#06b6d4]">✦</div>
          <span class="text-[#f1f5f9] font-bold text-base tracking-tight">Generative UI</span>
        </div>
        <p class="text-[10px] text-[#94a3b8] uppercase tracking-widest ml-[38px]">Model Arena</p>
      </div>

      <!-- Body -->
      <div class="flex-1 flex flex-col gap-3 p-4">

        <!-- Refinement banner -->
        <div v-if="chosenModelId" class="flex items-center gap-2 px-3 py-2 bg-[#0a1a20] border border-[#164e63] rounded-lg text-xs text-[#67e8f9]">
          <span class="w-1.5 h-1.5 rounded-full bg-[#22d3ee] shrink-0"></span>
          <span>Refining <strong>{{ models.find(m => m.id === chosenModelId)?.displayName }}</strong></span>
          <button @click="exitRefinement" class="ml-auto text-[10px] font-medium text-[#0891b2] hover:text-[#22d3ee]">Exit ×</button>
        </div>

        <!-- Image preview -->
        <div v-if="imagePreview" class="relative inline-flex">
          <img :src="imagePreview" class="max-h-16 rounded-lg border border-[#1e293b] object-contain" />
          <button @click="clearImage" aria-label="Remove image" class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#0d1520] border border-[#1e293b] rounded-full text-[#64748b] hover:text-[#f87171] shadow text-xs flex items-center justify-center">✕</button>
        </div>

        <!-- Prompt -->
        <div>
          <p class="text-[10px] text-[#94a3b8] uppercase tracking-widest mb-2">Prompt</p>
          <textarea
            v-model="prompt"
            @paste="handlePaste"
            :placeholder="chosenModelId ? 'Describe the change to apply…' : imagePreview ? 'Add instructions (optional)' : 'Describe a component, or paste / drop a screenshot…'"
            aria-label="Prompt"
            class="w-full px-3 py-2.5 bg-[#0a1520] border border-[#1e293b] rounded-lg text-[#e2e8f0] text-xs placeholder-[#94a3b8] resize-none focus:outline-none focus:border-[#0891b2] transition h-18"
          />
        </div>

        <!-- Presets -->
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="preset in PRESETS"
            :key="preset"
            @click="prompt = preset"
            class="px-2.5 py-1 text-[10px] bg-[#0a1520] border border-[#1e293b] rounded-full text-[#94a3b8] hover:border-[#0891b2] hover:text-[#22d3ee] transition"
          >{{ preset }}</button>
        </div>

        <!-- Drop zone -->
        <div
          class="border border-dashed border-[#1e293b] rounded-lg px-3 py-2.5 text-[10px] text-[#94a3b8] text-center cursor-pointer hover:border-[#0891b2] hover:text-[#22d3ee] transition"
          @dragover.prevent
          @drop.prevent="handleDrop"
          @click="fileInputRef.click()"
          @keydown.enter.prevent="fileInputRef.click()"
          @keydown.space.prevent="fileInputRef.click()"
          tabindex="0"
          role="button"
          aria-label="Upload image"
        >↑ Drop an image or click to upload</div>
        <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileInput" />

        <!-- Generate -->
        <button
          @click="generateComponent"
          :disabled="anyLoading"
          class="w-full py-2.5 bg-[#0891b2] hover:bg-[#0e7490] disabled:bg-[#1e293b] disabled:text-[#94a3b8] text-white font-semibold text-sm rounded-lg transition"
        >{{ anyLoading ? 'Generating…' : chosenModelId ? 'Refine' : 'Generate' }}</button>

        <!-- Clear -->
        <button
          v-if="hasContent"
          @click="clearAll"
          :disabled="anyLoading"
          class="w-full py-2 bg-transparent border border-[#1e293b] text-[#94a3b8] hover:text-[#94a3b8] hover:border-[#1e3a4a] disabled:opacity-40 text-xs rounded-lg transition"
        >Clear</button>

        <p v-if="error" class="text-xs text-[#f87171]">{{ error }}</p>

        <!-- History -->
        <div class="mt-auto pt-3 flex flex-col gap-2">
          <button
            @click="showHistory = !showHistory"
            class="w-full flex items-center justify-between px-3 py-2 bg-[#0a1520] border border-[#1e293b] rounded-lg text-xs text-[#94a3b8] hover:text-[#94a3b8] hover:border-[#1e3a4a] transition"
          >
            <span>History</span>
            <span v-if="history.length" class="text-[9px] px-2 py-0.5 rounded-full bg-[#0f2a35] text-[#22d3ee]">{{ history.length }}</span>
          </button>

          <div v-if="showHistory && history.length" class="border border-[#1a2535] rounded-lg overflow-hidden">
            <button
              v-for="entry in history"
              :key="entry.id"
              @click="restoreHistory(entry)"
              class="w-full flex items-center gap-2.5 px-3 py-2 border-b border-[#1a2535] last:border-0 text-left hover:bg-[#0a1520] transition"
            >
              <img v-if="entry.imagePreview" :src="entry.imagePreview" class="w-7 h-7 rounded object-cover shrink-0 border border-[#1e293b]" />
              <div v-else class="w-7 h-7 rounded bg-[#0f2230] border border-[#1e293b] shrink-0 flex items-center justify-center">
                <svg class="w-3 h-3" fill="none" stroke="#94a3b8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/></svg>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[10px] text-[#64748b] truncate">{{ entry.prompt || '(image only)' }}</p>
                <p class="text-[9px] text-[#94a3b8]">{{ entry.timestamp }} · {{ Object.keys(entry.results).length }} models</p>
              </div>
            </button>
            <button @click="clearHistory" class="w-full text-[10px] text-[#f87171] py-1.5 hover:bg-[#0a1520] transition">Clear all</button>
          </div>

          <div v-else-if="showHistory && !history.length" class="border border-[#1a2535] rounded-lg text-[10px] text-[#94a3b8] text-center py-4">
            No history yet.
          </div>
        </div>

      </div>
    </aside>

    <!-- ── Main ────────────────────────────────────────────────── -->
    <main class="flex-1 overflow-y-auto p-5 bg-[#060a0f]">
      <p class="text-[10px] text-[#94a3b8] uppercase tracking-widest mb-3">Model Results</p>
      <div class="grid grid-cols-2 gap-4">
        <div
          v-for="model in models"
          :key="model.id"
          class="bg-[#0d1520] rounded-xl overflow-hidden flex flex-col transition"
          :class="chosenModelId === model.id
            ? 'border border-[#0891b2] shadow-[0_0_0_1px_#0891b2]'
            : 'border border-[#1a2535]'"
        >
          <!-- Card header -->
          <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-[#1a2535]">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-[#e2e8f0]">{{ model.displayName }}</span>
              <span
                v-if="chosenModelId === model.id"
                class="text-[9px] px-1.5 py-0.5 bg-[#0e3040] border border-[#0891b2] text-[#22d3ee] rounded font-medium"
              >base</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span v-if="results[model.id]?.loading" class="text-[10px] text-[#22d3ee] animate-pulse">Generating…</span>
              <span v-else-if="results[model.id]?.output" class="text-[10px] text-[#4ade80] bg-[#052010] px-2 py-0.5 rounded-full">● Ready</span>
              <span v-else-if="results[model.id]?.error" class="text-[10px] text-[#f87171]">Error</span>
              <template v-if="results[model.id]?.output">
                <button @click="copyCode(model.id)" class="text-[10px] px-2 py-1 rounded bg-[#0a1520] border border-[#1e293b] text-[#64748b] hover:text-[#94a3b8] transition">
                  {{ copiedCard === model.id ? 'Copied!' : 'Copy' }}
                </button>
                <button @click="downloadToProject(model.id)" class="text-[10px] px-2 py-1 rounded bg-[#0a1520] border border-[#1e293b] text-[#64748b] hover:text-[#94a3b8] transition">
                  {{ savedCard?.id === model.id ? '✓ Saved' : '↓ Save' }}
                </button>
                <button @click="useThis(model.id)" :disabled="chosenModelId === model.id" class="text-[10px] px-2 py-1 rounded bg-[#0e3040] border border-[#0891b2] text-[#22d3ee] hover:bg-[#0891b2] hover:text-white transition">
                  {{ chosenModelId === model.id ? 'Chosen' : 'Use this' }}
                </button>
                <button @click="expandedCard = model.id" aria-label="Expand to full screen" class="text-[10px] px-2 py-1 rounded bg-[#0a1520] border border-[#1e293b] text-[#64748b] hover:text-[#94a3b8] transition">⤢</button>
              </template>
            </div>
          </div>

          <!-- Save confirmation -->
          <div v-if="savedCard?.id === model.id" class="px-3.5 py-1.5 bg-[#052010] border-b border-[#164e63] text-[10px] text-[#4ade80] font-mono">
            ✓ {{ savedCard.path }}
          </div>

          <!-- Tabs -->
          <div v-if="results[model.id]?.output" class="flex bg-[#060a0f] border-b border-[#1a2535]">
            <button
              @click="setCardView(model.id, 'preview')"
              class="px-3.5 py-1.5 text-xs font-medium transition border-b-2"
              :class="getCardView(model.id) === 'preview'
                ? 'text-[#22d3ee] border-[#0891b2]'
                : 'text-[#94a3b8] border-transparent hover:text-[#64748b]'"
            >Preview</button>
            <button
              @click="setCardView(model.id, 'code')"
              class="px-3.5 py-1.5 text-xs font-medium transition border-b-2"
              :class="getCardView(model.id) === 'code'
                ? 'text-[#22d3ee] border-[#0891b2]'
                : 'text-[#94a3b8] border-transparent hover:text-[#64748b]'"
            >Code</button>
          </div>

          <!-- Content -->
          <div class="flex-1 min-h-75">
            <div v-if="results[model.id]?.loading" class="flex flex-col items-center justify-center gap-2 h-full min-h-[300px]">
              <svg class="animate-spin text-[#0891b2] w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span class="text-xs text-[#94a3b8]">Generating…</span>
            </div>
            <!-- allow-same-origin needed for Tailwind CDN in srcdoc; output is model-generated, not user-supplied -->
            <iframe
              v-else-if="results[model.id]?.output && getCardView(model.id) === 'preview'"
              :srcdoc="buildPreviewDoc(results[model.id].output)"
              sandbox="allow-scripts allow-same-origin"
              class="w-full border-0 h-full min-h-[300px]"
            />
            <div
              v-else-if="results[model.id]?.output && getCardView(model.id) === 'code'"
              class="overflow-auto bg-[#040608] p-4 h-full min-h-[300px]"
            >
              <pre class="text-xs text-[#4ade80] whitespace-pre-wrap break-words font-mono leading-relaxed">{{ results[model.id].output }}</pre>
            </div>
            <div v-else-if="results[model.id]?.error" class="flex items-center justify-center p-4 text-center text-xs text-[#f87171] h-full min-h-[300px]">
              {{ results[model.id].error }}
            </div>
            <div v-else class="flex items-center justify-center text-xs text-[#94a3b8] h-full min-h-[300px]">
              Preview will appear here
            </div>
          </div>

          <!-- Metrics bar -->
          <div v-if="results[model.id]?.metrics" class="flex items-center gap-3 flex-wrap px-3.5 py-1.5 font-mono text-[10px] bg-[#060a0f] border-t border-[#1a2535]">
            <div class="flex items-center gap-1.5">
              <span class="text-[8px] text-[#94a3b8] uppercase tracking-widest">Tokens</span>
              <span class="text-[#22d3ee]">↑ {{ fmt(results[model.id].metrics.inputTokens) }}</span>
              <span class="text-[#818cf8]">↓ {{ fmt(results[model.id].metrics.outputTokens) }}</span>
            </div>
            <div class="w-px h-3 bg-[#1a2535]"></div>
            <div class="flex items-center gap-1.5">
              <span class="text-[8px] text-[#94a3b8] uppercase tracking-widest">Latency</span>
              <span class="text-[#fb923c]">{{ fmtMs(results[model.id].metrics.latencyMs) }}</span>
            </div>
            <div class="w-px h-3 bg-[#1a2535]"></div>
            <div class="flex items-center gap-1.5">
              <span class="text-[8px] text-[#94a3b8] uppercase tracking-widest">Cost</span>
              <span class="text-[#4ade80]">{{ fmtCost(results[model.id].metrics.estimatedCostUsd) }}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- ── Full-screen modal ──────────────────────────────────── -->
  <teleport to="body">
    <div
      v-if="expandedCard"
      class="fixed inset-0 z-50 bg-black/90 flex flex-col"
      @click.self="expandedCard = null"
      role="dialog"
      aria-modal="true"
      :aria-label="models.find(m => m.id === expandedCard)?.displayName + ' — expanded view'"
      @keydown.escape="expandedCard = null"
      tabindex="-1"
    >
      <div class="flex items-center justify-between px-6 py-3 bg-[#0d1520] border-b border-[#1a2535] shrink-0">
        <div class="flex items-center gap-3">
          <span class="font-semibold text-sm text-[#e2e8f0]">{{ models.find(m => m.id === expandedCard)?.displayName }}</span>
          <div class="flex text-xs">
            <button
              @click="setCardView(expandedCard, 'preview')"
              class="px-3 py-1.5 rounded-l border border-[#1e293b] transition"
              :class="getCardView(expandedCard) === 'preview'
                ? 'bg-[#0891b2] text-white border-[#0891b2]'
                : 'bg-[#0a1520] text-[#64748b] hover:text-[#94a3b8]'"
            >Preview</button>
            <button
              @click="setCardView(expandedCard, 'code')"
              class="px-3 py-1.5 rounded-r border border-l-0 border-[#1e293b] transition"
              :class="getCardView(expandedCard) === 'code'
                ? 'bg-[#0891b2] text-white border-[#0891b2]'
                : 'bg-[#0a1520] text-[#64748b] hover:text-[#94a3b8]'"
            >Code</button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button @click="copyCode(expandedCard)" class="text-xs px-3 py-1.5 rounded bg-[#0a1520] border border-[#1e293b] text-[#64748b] hover:text-[#94a3b8] transition">
            {{ copiedCard === expandedCard ? 'Copied!' : 'Copy' }}
          </button>
          <button @click="downloadToProject(expandedCard)" class="text-xs px-3 py-1.5 rounded bg-[#0a1520] border border-[#1e293b] text-[#64748b] hover:text-[#94a3b8] transition">
            {{ savedCard?.id === expandedCard ? '✓ Saved' : '↓ Save' }}
          </button>
          <button @click="() => { useThis(expandedCard); expandedCard = null; }" class="text-xs px-3 py-1.5 rounded bg-[#0e3040] border border-[#0891b2] text-[#22d3ee] hover:bg-[#0891b2] hover:text-white transition">Use this</button>
          <button @click="expandedCard = null" class="text-xs px-3 py-1.5 rounded bg-[#0a1520] border border-[#1e293b] text-[#64748b] hover:text-[#94a3b8] transition">✕ Close</button>
        </div>
      </div>
      <div class="flex-1 overflow-hidden">
        <!-- allow-same-origin needed for Tailwind CDN in srcdoc; output is model-generated, not user-supplied -->
        <iframe
          v-if="getCardView(expandedCard) === 'preview'"
          :srcdoc="buildPreviewDoc(results[expandedCard]?.output)"
          sandbox="allow-scripts allow-same-origin"
          class="w-full h-full border-0 bg-white"
        />
        <div v-else class="h-full overflow-auto bg-[#040608] p-6">
          <pre class="text-sm text-[#4ade80] whitespace-pre-wrap break-words font-mono leading-relaxed">{{ results[expandedCard]?.output }}</pre>
        </div>
      </div>
    </div>
  </teleport>
</template>
