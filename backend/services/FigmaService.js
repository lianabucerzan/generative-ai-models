export class FigmaService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.figma.com/v1";
  }

  parseUrl(url) {
    const match = url.match(
      /figma\.com\/(?:design|file)\/([^/?]+)[^?]*\?.*node-id=([\w%:-]+)/
    );
    if (!match) return null;
    const fileKey = match[1];
    // Figma URL encodes node IDs as "10-20" or "10%3A20"; API expects "10:20"
    const nodeId = decodeURIComponent(match[2]).replace(/^(\d+)-(\d+)$/, "$1:$2");
    return { fileKey, nodeId };
  }

  async exportPng(_fileKey, _nodeId) {
    throw new Error("not implemented");
  }

  async extractTokens(_fileKey, _nodeId) {
    throw new Error("not implemented");
  }

  async extract(url) {
    throw new Error("not implemented");
  }
}

export function createFigmaService() {
  const apiKey = process.env.FIGMA_API_KEY;
  if (!apiKey) return null;
  return new FigmaService(apiKey);
}
