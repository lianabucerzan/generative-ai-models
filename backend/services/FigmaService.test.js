import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FigmaService } from "./FigmaService.js";

const svc = new FigmaService("test-key");

describe("FigmaService.parseUrl", () => {
  it("parses hyphen-encoded node-id", () => {
    const result = svc.parseUrl(
      "https://www.figma.com/design/ABC123/My-File?node-id=10-20&t=xyz"
    );
    assert.deepEqual(result, { fileKey: "ABC123", nodeId: "10:20" });
  });

  it("parses percent-encoded node-id", () => {
    const result = svc.parseUrl(
      "https://www.figma.com/design/ABC123/My-File?node-id=10%3A20"
    );
    assert.deepEqual(result, { fileKey: "ABC123", nodeId: "10:20" });
  });

  it("parses /file/ URLs", () => {
    const result = svc.parseUrl(
      "https://www.figma.com/file/XYZ789/Name?node-id=5-99"
    );
    assert.deepEqual(result, { fileKey: "XYZ789", nodeId: "5:99" });
  });

  it("returns null for URLs without node-id", () => {
    const result = svc.parseUrl("https://www.figma.com/design/ABC123/Name");
    assert.equal(result, null);
  });

  it("returns null for non-Figma URLs", () => {
    const result = svc.parseUrl("https://example.com");
    assert.equal(result, null);
  });
});

describe("FigmaService.exportPng", () => {
  it("fetches image URL from Figma and returns base64", async () => {
    const svc = new FigmaService("fake-key");

    let fetchCalls = [];
    const originalFetch = globalThis.fetch;
    const fakeImageBuffer = Buffer.from("fakepng");
    globalThis.fetch = async (url, opts) => {
      fetchCalls.push({ url: url.toString(), opts });
      if (url.includes("api.figma.com/v1/images")) {
        return {
          json: async () => ({
            images: { "10:20": "https://cdn.figma.com/img/fake.png" },
          }),
        };
      }
      return {
        arrayBuffer: async () => fakeImageBuffer.buffer.slice(fakeImageBuffer.byteOffset, fakeImageBuffer.byteOffset + fakeImageBuffer.byteLength),
      };
    };

    const result = await svc.exportPng("ABC123", "10:20");
    assert.equal(result, fakeImageBuffer.toString("base64"));
    assert.equal(
      fetchCalls[0].url,
      "https://api.figma.com/v1/images/ABC123?ids=10%3A20&format=png&scale=2"
    );
    assert.equal(fetchCalls[0].opts.headers["X-Figma-Token"], "fake-key");

    globalThis.fetch = originalFetch;
  });

  it("returns null when image URL is missing from response", async () => {
    const svc = new FigmaService("fake-key");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ json: async () => ({ images: {} }) });
    const result = await svc.exportPng("ABC123", "10:20");
    assert.equal(result, null);
    globalThis.fetch = originalFetch;
  });
});

const MOCK_FIGMA_NODE = {
  nodes: {
    "10:20": {
      document: {
        absoluteBoundingBox: { width: 400, height: 200 },
        fills: [{ type: "SOLID", color: { r: 0.388, g: 0.4, b: 0.945, a: 1 } }],
        style: { fontFamily: "Inter", fontSize: 16, fontWeight: 600 },
        children: [
          {
            fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
            style: { fontFamily: "Inter", fontSize: 14, fontWeight: 400 },
            children: [],
          },
        ],
      },
    },
  },
};

describe("FigmaService.extractTokens", () => {
  it("extracts colors, fonts, and dimensions from node JSON", async () => {
    const svc = new FigmaService("fake-key");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ json: async () => MOCK_FIGMA_NODE });

    const tokens = await svc.extractTokens("ABC123", "10:20");

    assert.ok(tokens.colors.includes("#6366f1"), `expected #6366f1 in ${tokens.colors}`);
    assert.ok(tokens.colors.includes("#ffffff"), `expected #ffffff in ${tokens.colors}`);
    assert.deepEqual(tokens.dimensions, { width: 400, height: 200 });
    assert.ok(tokens.fonts.some((f) => f.fontFamily === "Inter" && f.fontSize === 16));

    globalThis.fetch = originalFetch;
  });
});

describe("FigmaService.extract", () => {
  it("returns null for unparseable URL", async () => {
    const svc = new FigmaService("fake-key");
    const result = await svc.extract("https://example.com");
    assert.equal(result, null);
  });

  it("returns imageBase64 and tokens on success", async () => {
    const svc = new FigmaService("fake-key");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.includes("/images/")) {
        return { json: async () => ({ images: { "10:20": "https://cdn.figma.com/img/fake.png" } }) };
      }
      if (url.includes("cdn.figma.com")) {
        return { arrayBuffer: async () => new Uint8Array(Buffer.from("fakepng")).buffer };
      }
      if (url.includes("/nodes")) {
        return { json: async () => MOCK_FIGMA_NODE };
      }
    };

    const result = await svc.extract(
      "https://www.figma.com/design/ABC123/Name?node-id=10-20"
    );

    assert.equal(result.imageBase64, Buffer.from("fakepng").toString("base64"));
    assert.ok(Array.isArray(result.tokens.colors));
    globalThis.fetch = originalFetch;
  });
});
