import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { AgentFactory } from "./agents/AgentFactory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_COMPONENTS_DIR = resolve(__dirname, "../frontend/src/ui-components");


dotenv.config({ path: resolve(__dirname, "../.env"), override: true });

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

app.post("/save-component", async (req, res) => {
  try {
    const { code, modelId, prompt } = req.body;
    if (!code) return res.status(400).json({ error: "code is required" });

    await mkdir(UI_COMPONENTS_DIR, { recursive: true });

    const baseName = prompt
      ? prompt.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("").slice(0, 40) || "Component"
      : "Component";
    const tier = modelId.replace(/^claude-/, "").replace(/-[\d.]+.*$/, ""); // opus | sonnet | haiku
    const filename = `${baseName}-${tier}.vue`;

    await writeFile(resolve(UI_COMPONENTS_DIR, filename), code, "utf-8");
    res.json({ filename, path: `src/ui-components/${filename}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Save failed" });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
  console.log("Models:", agentFactory.getModels().map((m) => m.displayName).join(", "));
});
