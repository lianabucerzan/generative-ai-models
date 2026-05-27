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
