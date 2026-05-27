<script setup>
import { ref } from "vue";
import axios from "axios";

const prompt = ref("");
const output = ref("");
const loading = ref(false);

const generateComponent = async () => {
  loading.value = true;

  try {
    const response = await axios.post(
      "http://localhost:3000/generate",
      {
        prompt: prompt.value,
      }
    );

    output.value = response.data.output;
  } catch (error) {
    console.error(error);
  }

  loading.value = false;
};
</script>

<template>
  <div class="min-h-screen bg-gray-100 p-8">
    <h1 class="text-4xl font-bold mb-8">
      LLM UI Arena
    </h1>

    <div class="bg-white rounded-xl p-6 shadow">
      <textarea
        v-model="prompt"
        placeholder="Create a modern pricing card..."
        class="w-full h-40 border rounded-lg p-4"
      />

      <button
        @click="generateComponent"
        class="mt-4 bg-black text-white px-6 py-3 rounded-lg"
      >
        {{ loading ? "Generating..." : "Generate" }}
      </button>
    </div>

    <div class="mt-8 bg-black text-green-400 p-6 rounded-xl">
      <pre class="whitespace-pre-wrap">
        {{ output }}
      </pre>
    </div>
  </div>
</template>