import { describe, it, expect } from "vitest";
import { buildUserMessage, buildAttachmentDataMap } from "../src/agent/runtime.js";

describe("buildUserMessage with attachments", () => {
  const fakeAttachments = [
    { assetId: "asset-001", url: "http://localhost:54321/storage/v1/object/public/test/img1.png", mimeType: "image/png" },
    { assetId: "asset-002", url: "http://localhost:54321/storage/v1/object/public/test/img2.jpg", mimeType: "image/jpeg" },
  ];

  it("appends <input_images> XML to prompt text when attachments exist", () => {
    const prompt = "参考我的模卡图生成一个模特照";
    const result = buildUserMessage(prompt, fakeAttachments);

    expect(result.text).toContain(prompt);
    expect(result.text).toContain('<input_images count="2">');
    expect(result.text).toContain('asset_id="asset-001"');
    expect(result.text).toContain('asset_id="asset-002"');
    expect(result.text).toContain('index="1"');
    expect(result.text).toContain('index="2"');
    expect(result.text).toContain("</input_images>");
  });

  it("returns plain prompt when no attachments", () => {
    const result = buildUserMessage("hello", []);
    expect(result.text).toBe("hello");
    expect(result.text).not.toContain("<input_images");
  });
});

describe("buildAttachmentDataMap", () => {
  it("maps assetId to base64 data URI", () => {
    const downloaded = [
      { assetId: "asset-001", mimeType: "image/png", base64: "iVBORw0KGgo=" },
      { assetId: "asset-002", mimeType: "image/jpeg", base64: "/9j/4AAQ=" },
    ];
    const map = buildAttachmentDataMap(downloaded);

    expect(map["asset-001"]).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(map["asset-002"]).toBe("data:image/jpeg;base64,/9j/4AAQ=");
  });

  it("returns empty map for empty input", () => {
    expect(buildAttachmentDataMap([])).toEqual({});
  });
});
