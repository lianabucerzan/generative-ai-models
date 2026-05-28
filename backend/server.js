// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AgentFactory } from "./agents/AgentFactory.js";
import { createFigmaService } from "./services/FigmaService.js";

dotenv.config({ override: true });

const app = express();
const agentFactory = new AgentFactory();
const figmaService = createFigmaService();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const FIGMA_URL_RE = /https:\/\/(?:www\.)?figma\.com\/\S+node-id=[\w%:-]+/;

app.get("/agents", (req, res) => {
  res.json({ models: agentFactory.getModels() });
});

app.post("/generate", async (req, res) => {
  try {
    const { prompt, model } = req.body;

    if (!model) {
      return res.status(400).json({ error: "model is required" });
    }
    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const provider = agentFactory.getProviderForModel(model);
    if (!provider) {
      return res.status(400).json({
        error: `Unknown model '${model}'. Available: ${agentFactory.getModels().map((m) => m.id).join(", ")}`,
      });
    }

    const agent = agentFactory.getAgent(provider);
    if (!agent) {
      return res.status(500).json({
        error: `Agent for provider '${provider}' is not initialized`,
      });
    }

    const figmaUrlMatch = prompt?.match(FIGMA_URL_RE);
    const figmaUrl = figmaUrlMatch?.[0] ?? null;
    const cleanPrompt = figmaUrl
      ? prompt.replace(figmaUrl, "").trim() ||
        "Replicate this design as an HTML component with Tailwind CSS"
      : prompt;

    const figmaData =
      figmaUrl && figmaService ? await figmaService.extract(figmaUrl) : null;

    const { output, metrics } = await agent.generate(cleanPrompt, model, figmaData);

    res.json({ output, metrics });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Generation failed" });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
  console.log(
    "Models:",
    agentFactory.getModels().map((m) => m.displayName).join(", ")
  );
  console.log("Figma integration:", figmaService ? "enabled" : "disabled (no FIGMA_API_KEY)");
});
