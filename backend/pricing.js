// backend/pricing.js
const MODEL_PRICING = {
  "claude-opus-4-7":            { input: 15  / 1_000_000, output: 75 / 1_000_000 },
  "claude-sonnet-4-6":          { input: 3   / 1_000_000, output: 15 / 1_000_000 },
  "claude-haiku-4-5-20251001":  { input: 0.8 / 1_000_000, output: 4  / 1_000_000 },
};

export function estimateCost(modelId, inputTokens, outputTokens) {
  if (inputTokens == null || outputTokens == null) return null;
  if (inputTokens < 0 || outputTokens < 0) return null;
  const rates = MODEL_PRICING[modelId];
  if (!rates) return null;
  const cost = inputTokens * rates.input + outputTokens * rates.output;
  // ~$0.0001 resolution; sub-cent costs on very small completions may round to 0
  return Math.round(cost * 10000) / 10000;
}
