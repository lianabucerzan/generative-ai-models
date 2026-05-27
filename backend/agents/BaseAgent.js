// backend/agents/BaseAgent.js
export class BaseAgent {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.systemPrompt =
      "You generate Vue 3 Single File Components using Tailwind CSS. Return only valid Vue 3 SFC code without markdown formatting or backticks.";
  }

  // Returns { output: string, metrics: { modelId, inputTokens, outputTokens, latencyMs, estimatedCostUsd } }
  // inputTokens, outputTokens, estimatedCostUsd are null when using mock generation.
  async generate(prompt, modelId) {
    throw new Error("generate() must be implemented by subclass");
  }

  prepareMessages(prompt) {
    return [
      { role: "system", content: this.systemPrompt },
      { role: "user",   content: prompt },
    ];
  }
}
