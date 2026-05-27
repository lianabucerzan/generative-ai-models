# Live Component Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw code terminal in the output panel with a sandboxed iframe that renders the generated Vue component live in the browser.

**Architecture:** A `buildPreviewDoc(sfc)` helper extracts the `<template>` and `<style>` blocks from the generated SFC string and wraps them in a full HTML document that loads Vue 3 and Tailwind via CDN. A `previewDoc` computed feeds that document to an `<iframe srcdoc>`. Before generation a dark placeholder is shown; after generation the iframe replaces it.

**Tech Stack:** Vue 3 `<script setup>`, Tailwind CSS 4, Vite 8. Vue 3 CDN and Tailwind CDN load inside the iframe at runtime.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/App.vue` | Add `buildPreviewDoc`, `previewDoc` computed, swap terminal panel for iframe |

---

## Task 1: Add live preview to App.vue

**Files:**
- Modify: `frontend/src/App.vue`

### Step 1 — Add `buildPreviewDoc` and `previewDoc` to the script block

- [ ] Read `frontend/src/App.vue`.

- [ ] Insert the following two additions **after line 60** (after the `fmtMs` line, before `</script>`):

```js
function buildPreviewDoc(sfc) {
  const templateContent = sfc.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? sfc;
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
```

After the edit the end of the `<script setup>` block should look like:

```js
const isNullish = (val) => val === null || val === undefined || (typeof val === "number" && isNaN(val));
const fmt = (val) => (!isNullish(val) ? val : "—");
const fmtCost = (val) => (!isNullish(val) ? `~ $${val}` : "—");
const fmtMs = (val) => (!isNullish(val) ? `${val.toLocaleString()} ms` : "—");

function buildPreviewDoc(sfc) {
  const templateContent = sfc.match(/<template>([\s\S]*?)<\/template>/)?.[1] ?? sfc;
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
```

### Step 2 — Replace the terminal output panel in the template

- [ ] In the `<template>` block, find and replace the entire terminal `<div>` (lines 136–145 in the original file — the `<!-- Output Section -->` inner div with class `bg-black text-green-400 rounded-xl ...`):

**Remove this block:**
```html
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
```

**Replace with:**
```html
          <iframe
            v-if="output"
            :srcdoc="previewDoc"
            sandbox="allow-scripts"
            class="w-full rounded-xl border-0 min-h-[500px] bg-white shadow-lg"
          />
          <div
            v-else
            class="bg-black text-green-400 rounded-xl p-6 shadow-lg font-mono text-sm flex items-center justify-center min-h-[500px]"
          >
            <span class="text-gray-600">{{ loading ? "Generating component..." : "Preview will appear here" }}</span>
          </div>
```

The surrounding `<!-- Output Section -->` wrapper div (class `lg:col-span-2 flex flex-col gap-3`) and the metrics bar below it are **untouched**.

### Step 3 — Verify the frontend compiles

- [ ] Check that the Vite dev server (already running at `http://localhost:5173`) hot-reloads without errors:

```bash
curl -s --max-time 3 http://localhost:5173 | grep -c "vite" || echo "check browser console"
```

If the server isn't running, start it:
```bash
cd /Users/devhub/Generative-UI/generative-ai-models/frontend && npm run dev &
sleep 2
```

- [ ] Open `http://localhost:5173` in a browser. Confirm:
  1. The page loads with the dark placeholder: **"Preview will appear here"**
  2. The model dropdown shows all four models

### Step 4 — Test a generation end-to-end

- [ ] Ensure the backend is running (starts with `cd backend && npm run dev`). If not:
```bash
cd /Users/devhub/Generative-UI/generative-ai-models/backend && npm run dev &
sleep 2
```

- [ ] In the browser at `http://localhost:5173`:
  1. Select any model from the dropdown
  2. Type a prompt, e.g. **"Create a pricing card with a purple gradient"**
  3. Click **Generate**
  4. Confirm the dark placeholder disappears and is replaced by a **white iframe** rendering the component visually
  5. Confirm the metrics bar appears below the iframe with model ID, latency, tokens, cost
  6. Generate again with a different model — confirm the preview updates

### Step 5 — Commit

- [ ] Commit:

```bash
git add frontend/src/App.vue
git commit -m "feat: replace code terminal with live component preview iframe"
```

---

## Self-Review

**Spec coverage:**
- ✅ Terminal panel replaced by sandboxed iframe
- ✅ `buildPreviewDoc` extracts `<template>` and `<style>` blocks with regex fallbacks
- ✅ Vue 3 + Tailwind CDN loaded inside iframe
- ✅ `<template id="tpl">` pattern avoids escaping issues
- ✅ `sandbox="allow-scripts"` — no same-origin access
- ✅ `v-if="output"` / `v-else` — dark placeholder before generation, iframe after
- ✅ Placeholder text: "Preview will appear here" (idle) / "Generating component..." (loading)
- ✅ Metrics bar untouched
- ✅ `previewDoc` is a computed — reactively updates when `output` changes
- ✅ `body style="margin:0"` prevents default browser margin inside iframe

**Placeholder scan:** No TBDs. All code is complete and exact.

**Type consistency:** `buildPreviewDoc(sfc: string): string` — called by `previewDoc` computed which passes `output.value` (string). ✓
