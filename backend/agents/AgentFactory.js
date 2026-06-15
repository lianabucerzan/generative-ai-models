// backend/agents/AgentFactory.js
import { ClaudeAgent } from "./ClaudeAgent.js";

export class AgentFactory {
  static MODEL_CATALOG = [
    { id: "claude-opus-4-8",           displayName: "Claude Opus 4.8",   provider: "claude" },
    { id: "claude-sonnet-4-6",         displayName: "Claude Sonnet 4.6", provider: "claude" },
    { id: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5",  provider: "claude" },
  ];

  constructor() {
    this.agents = new Map();
    this._initializeAgents();
  }

  _initializeAgents() {
    [new ClaudeAgent()].forEach((agent) => {
      this.agents.set(agent.name, agent);
    });
  }

  // Returns { id, displayName, provider }[] — used by GET /agents
  getModels() {
    return AgentFactory.MODEL_CATALOG;
  }

  // Returns "claude" | null
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
