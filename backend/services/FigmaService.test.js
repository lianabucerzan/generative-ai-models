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
