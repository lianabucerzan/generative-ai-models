# Live Component Preview — Design Spec

**Date:** 2026-05-27  
**Status:** Approved

## Summary

Replace the terminal-style raw code output panel in the frontend with a sandboxed `<iframe>` that renders the generated Vue component live in the browser. The metrics bar below is unchanged.

---

## Goals

- Generated component renders visually as a real UI component, not as raw HTML text
- Preview is fully sandboxed — no style bleed between the main app and the component
- Tailwind CSS classes in the generated component work correctly in the preview
- Before generation: dark placeholder panel ("Preview will appear here")
- After generation: iframe fills the output panel with the rendered component
- Metrics bar below the output panel is unchanged

---

## Approach

**Iframe + Vue CDN + `srcdoc`**

The frontend extracts the `<template>` block content and `<style>` block from the generated SFC string, constructs a complete standalone HTML document, and sets it as the `srcdoc` attribute of an `<iframe>`. The document loads Vue 3 (full browser build with compiler) and Tailwind CSS via CDN, then mounts a Vue app using the extracted template.

No backend changes required.

---

## Frontend Changes (`frontend/src/App.vue` only)

### `buildPreviewDoc(sfc)` helper

Extracts template and style content from the SFC string and returns a complete HTML document string:

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
```

The HTML `<template id="tpl">` element is inert (not rendered by the browser), avoiding any escaping issues with the Vue template content. Vue's runtime compiler reads its `innerHTML` and compiles it.

### `previewDoc` computed

```js
const previewDoc = computed(() => output.value ? buildPreviewDoc(output.value) : '');
```

### Template changes

Replace the terminal `<div>` with:

```html
<!-- Output panel -->
<div class="lg:col-span-2 flex flex-col gap-3">
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

  <!-- Metrics bar — unchanged -->
  <div v-if="metrics" class="bg-black rounded-xl px-5 py-3 ...">
    ...
  </div>
</div>
```

### `sandbox="allow-scripts"`

Allows the Vue runtime and Tailwind script to execute inside the iframe. Omitting `allow-same-origin` means the iframe runs as a unique origin — it cannot access the parent page's DOM, cookies, or storage. External CDN scripts loaded via `<script src>` execute normally under `allow-scripts`.

---

## Data Flow

```
output.value set (SFC string)
  → previewDoc computed triggers
  → buildPreviewDoc() extracts <template> and <style> blocks
  → returns full HTML document string
  → :srcdoc binding updates iframe
  → iframe loads Vue + Tailwind from CDN
  → Vue mounts component from <template id="tpl"> innerHTML
  → component renders live in preview
```

---

## Limitations (MVP)

- `<script setup>` logic in generated components is not executed — the preview is template-only. Current generated components are template-focused so this has no visible impact.
- If the CDN scripts are unavailable (offline), the preview shows a blank white iframe.
- No explicit error state for malformed SFC output — Vue will silently render nothing or log to the iframe's console.

---

## Out of Scope

- Code view toggle (viewing raw SFC source)
- Error overlay in the preview iframe
- Resize/fullscreen controls
- Offline CDN fallback
