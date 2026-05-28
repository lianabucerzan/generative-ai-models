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

  async exportPng(fileKey, nodeId) {
    const res = await fetch(
      `${this.baseUrl}/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`,
      { headers: { "X-Figma-Token": this.apiKey } }
    );
    const data = await res.json();
    const imageUrl = data.images?.[nodeId];
    if (!imageUrl) return null;
    const imageRes = await fetch(imageUrl);
    const buffer = await imageRes.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  }

  async extractTokens(fileKey, nodeId) {
    const res = await fetch(
      `${this.baseUrl}/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
      { headers: { "X-Figma-Token": this.apiKey } }
    );
    const data = await res.json();
    const nodeEntry = data.nodes?.[nodeId];
    if (!nodeEntry) return { colors: [], fonts: [], dimensions: {} };

    const node = nodeEntry.document;
    const colors = [];
    const fonts = [];

    const traverse = (n) => {
      (n.fills ?? [])
        .filter((f) => f.type === "SOLID" && f.color)
        .forEach((f) => {
          const hex =
            "#" +
            [f.color.r, f.color.g, f.color.b]
              .map((v) => Math.round(v * 255).toString(16).padStart(2, "0"))
              .join("");
          if (!colors.includes(hex)) colors.push(hex);
        });

      if (n.style?.fontFamily) {
        const { fontFamily, fontSize, fontWeight } = n.style;
        if (!fonts.some((f) => f.fontFamily === fontFamily && f.fontSize === fontSize)) {
          fonts.push({ fontFamily, fontSize, fontWeight });
        }
      }

      (n.children ?? []).forEach(traverse);
    };
    traverse(node);

    const dimensions = node.absoluteBoundingBox
      ? { width: node.absoluteBoundingBox.width, height: node.absoluteBoundingBox.height }
      : {};

    return { colors, fonts, dimensions };
  }

  async extract(url) {
    const parsed = this.parseUrl(url);
    if (!parsed) return null;
    const { fileKey, nodeId } = parsed;
    try {
      const [imageBase64, tokens] = await Promise.all([
        this.exportPng(fileKey, nodeId),
        this.extractTokens(fileKey, nodeId),
      ]);
      return { imageBase64, tokens };
    } catch (err) {
      console.warn("FigmaService.extract failed:", err.message);
      return null;
    }
  }
}

export function createFigmaService() {
  const apiKey = process.env.FIGMA_API_KEY;
  if (!apiKey) return null;
  return new FigmaService(apiKey);
}
