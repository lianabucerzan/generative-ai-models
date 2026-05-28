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
