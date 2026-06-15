import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AgentFactory } from "./agents/AgentFactory.js";

dotenv.config({ override: true });

const app = express();
const agentFactory = new AgentFactory();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/agents", (req, res) => {
  res.json({ models: agentFactory.getModels() });
});

app.post("/generate", async (req, res) => {
  try {
    const { prompt, model, image } = req.body;

    if (!model) {
      return res.status(400).json({ error: "model is required" });
    }
    if (!prompt && !image) {
      return res.status(400).json({ error: "prompt or image is required" });
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
    const { output, metrics } = await agent.generate(prompt, model, image ?? null);

    res.json({ output, metrics });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Generation failed" });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
  console.log("Models:", agentFactory.getModels().map((m) => m.displayName).join(", "));
});
