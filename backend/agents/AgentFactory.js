// backend/agents/AgentFactory.js
import { ClaudeAgent } from "./ClaudeAgent.js";
import { GeminiAgent } from "./GeminiAgent.js";

export class AgentFactory {
  static MODEL_CATALOG = [
    { id: "claude-opus-4-7",           displayName: "Claude Opus 4.7",   provider: "claude" },
    { id: "claude-sonnet-4-6",         displayName: "Claude Sonnet 4.6", provider: "claude" },
    { id: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5",  provider: "claude" },
    { id: "gemini",                    displayName: "Gemini 2.5 Pro",     provider: "gemini" },
  ];

  constructor() {
    this.agents = new Map();
    this._initializeAgents();
  }

  _initializeAgents() {
    [new ClaudeAgent(), new GeminiAgent()].forEach((agent) => {
      this.agents.set(agent.name, agent);
    });
  }

  // Returns { id, displayName, provider }[] — used by GET /agents
  getModels() {
    return AgentFactory.MODEL_CATALOG;
  }

  // Returns "claude" | "gemini" | null
  getProviderForModel(modelId) {
    return AgentFactory.MODEL_CATALOG.find((m) => m.id === modelId)?.provider ?? null;
  }

  getAgent(name) {
    return this.agents.get(name) ?? null;
  }

  getAvailableAgents() {
    return Array.from(this.agents.keys());
  }

  registerAgent(agent) {
    this.agents.set(agent.name, agent);
  }
}
