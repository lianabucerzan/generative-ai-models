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
    const gradients = [];
    const strokes = [];
    const effects = [];

    const toHex = (r, g, b) =>
      "#" + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");

    const toRgba = (c) =>
      `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${Math.round((c.a ?? 1) * 100) / 100})`;

    const extractFromNode = (n) => {
      // fills: solid colors + full gradients
      (n.fills ?? []).filter(f => f.visible !== false).forEach((f) => {
        if (f.type === "SOLID" && f.color) {
          const hex = toHex(f.color.r, f.color.g, f.color.b);
          if (!colors.includes(hex)) colors.push(hex);
        } else if (f.type?.startsWith("GRADIENT") && f.gradientStops) {
          const stops = f.gradientStops.map(s => ({
            color: toHex(s.color.r, s.color.g, s.color.b),
            opacity: Math.round((s.color.a ?? 1) * 100) / 100,
            position: Math.round(s.position * 100),
          }));
          gradients.push({ type: f.type, stops });
          // also add first stop as solid color fallback
          const hex = stops[0]?.color;
          if (hex && !colors.includes(hex)) colors.push(hex);
        }
      });

      // strokes (border)
      (n.strokes ?? []).filter(s => s.visible !== false && s.type === "SOLID").forEach((s) => {
        strokes.push({
          color: toRgba({ ...s.color, a: s.opacity ?? s.color?.a ?? 1 }),
          weight: n.strokeWeight ?? 1,
          align: n.strokeAlign ?? "INSIDE",
        });
      });

      // effects (drop shadow / inner shadow / blur)
      (n.effects ?? []).filter(e => e.visible !== false).forEach((e) => {
        if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
          effects.push({
            type: e.type,
            color: toRgba(e.color),
            offsetX: e.offset?.x ?? 0,
            offsetY: e.offset?.y ?? 0,
            radius: e.radius ?? 0,
            spread: e.spread ?? 0,
          });
        }
      });

      // typography
      if (n.style?.fontFamily) {
        const { fontFamily, fontSize, fontWeight } = n.style;
        if (!fonts.some((f) => f.fontFamily === fontFamily && f.fontSize === fontSize)) {
          fonts.push({ fontFamily, fontSize, fontWeight });
        }
      }

      (n.children ?? []).forEach(extractFromNode);
    };
    extractFromNode(node);

    // If node is a component instance, also fetch the master component to get inherited styles
    if (node.type === "INSTANCE" && node.componentId) {
      try {
        const masterRes = await fetch(
          `${this.baseUrl}/files/${fileKey}/nodes?ids=${encodeURIComponent(node.componentId)}`,
          { headers: { "X-Figma-Token": this.apiKey } }
        );
        const masterData = await masterRes.json();
        const masterNode = masterData.nodes?.[node.componentId]?.document;
        if (masterNode) extractFromNode(masterNode);
      } catch {
        // master component fetch is best-effort
      }
    }

    const dimensions = node.absoluteBoundingBox
      ? { width: node.absoluteBoundingBox.width, height: node.absoluteBoundingBox.height }
      : {};

    const cornerRadius = node.cornerRadius ?? node.rectangleCornerRadii?.[0] ?? null;

    const padding = (node.paddingTop != null || node.paddingLeft != null)
      ? {
          top: node.paddingTop ?? 0,
          right: node.paddingRight ?? 0,
          bottom: node.paddingBottom ?? 0,
          left: node.paddingLeft ?? 0,
        }
      : null;

    return { colors, fonts, dimensions, gradients, strokes, effects, cornerRadius, padding };
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
