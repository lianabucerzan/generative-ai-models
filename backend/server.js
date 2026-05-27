// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { AgentFactory } from "./agents/AgentFactory.js";

dotenv.config();

const app = express();
const agentFactory = new AgentFactory();

app.use(cors());
app.use(express.json());

app.get("/agents", (req, res) => {
  res.json({ models: agentFactory.getModels() });
});

app.post("/generate", async (req, res) => {
  try {
    const { prompt, model } = req.body;

    if (!prompt || !model) {
      return res.status(400).json({ error: "prompt and model are required" });
    }

    const provider = agentFactory.getProviderForModel(model);
    if (!provider) {
      return res.status(400).json({
        error: `Unknown model '${model}'. Available: ${agentFactory.getModels().map((m) => m.id).join(", ")}`,
      });
    }

    const agent = agentFactory.getAgent(provider);
    const { output, metrics } = await agent.generate(prompt, model);

    res.json({ output, metrics });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Generation failed", details: error.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
  console.log("Models:", agentFactory.getModels().map((m) => m.displayName).join(", "));
});
