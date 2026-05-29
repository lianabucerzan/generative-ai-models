// backend/agents/BaseAgent.js
export class BaseAgent {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.systemPrompt =
      "You generate UI components as plain HTML with Tailwind CSS classes. " +
      "Return only the HTML snippet — no Vue, no scripts, no markdown fences, no backticks. " +
      "Include realistic hardcoded demo data so the component looks complete visually. " +
      "If a Figma URL is present in the prompt, use the available Figma tool to read the design " +
      "before generating — use the exact colors, fonts, and dimensions from Figma.";
  }

  // Returns { output: string, metrics: { modelId, inputTokens, outputTokens, latencyMs, estimatedCostUsd } }
  // inputTokens, outputTokens, estimatedCostUsd are null when using mock generation.
  // image: { data: base64String, mimeType: string } | null
  async generate(prompt, modelId, image = null) {
    throw new Error("generate() must be implemented by subclass");
  }

  prepareMessages(prompt) {
    return [
      { role: "system", content: this.systemPrompt },
      { role: "user",   content: prompt },
    ];
  }
}
