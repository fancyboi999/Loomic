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

  it("includes attachment names when provided", () => {
    const result = buildUserMessage("参考品牌图生成海报", [
      {
        assetId: "asset-001",
        url: "http://localhost:54321/storage/v1/object/public/test/img1.png",
        mimeType: "image/png",
        name: "品牌主视觉",
      },
    ]);

    expect(result.text).toContain('name="品牌主视觉"');
  });

  it("returns plain prompt when no attachments", () => {
    const result = buildUserMessage("hello", []);
    expect(result.text).toBe("hello");
    expect(result.text).not.toContain("<input_images");
  });

  it("appends human image generation preference XML when preferred models exist", () => {
    const result = buildUserMessage("生成一张海报", [], {
      mode: "manual",
      models: [
        "google/nano-banana-2",
        "black-forest-labs/flux-kontext-pro",
      ],
    });

    expect(result.text).toContain("生成一张海报");
    expect(result.text).toContain('<human_image_generation_preference mode="manual" count="2">');
    expect(result.text).toContain('<preferred_model index="1" id="google/nano-banana-2" />');
    expect(result.text).toContain('<preferred_model index="2" id="black-forest-labs/flux-kontext-pro" />');
    expect(result.text).toContain("</human_image_generation_preference>");
  });

  it("combines input images XML and human image generation preference XML", () => {
    const result = buildUserMessage("参考我的图生成 KV", fakeAttachments, {
      mode: "manual",
      models: ["google/nano-banana-2"],
    });

    expect(result.text).toContain('<input_images count="2">');
    expect(result.text).toContain('<human_image_generation_preference mode="manual" count="1">');
    expect(result.text).toContain('<preferred_model index="1" id="google/nano-banana-2" />');
  });

  it("appends mentioned model and brand kit asset XML", () => {
    const result = buildUserMessage(
      "参考这个品牌资产生成 KV",
      [],
      undefined,
      [
        {
          mentionType: "image-model",
          id: "black-forest-labs/flux-kontext-pro",
          label: "Flux Kontext Pro",
        },
        {
          mentionType: "brand-kit-asset",
          id: "brand-logo-1",
          label: "Loomic 主 Logo",
          assetType: "logo",
          fileUrl: "https://example.com/logo.png",
        },
        {
          mentionType: "brand-kit-asset",
          id: "brand-color-1",
          label: "品牌蓝",
          assetType: "color",
          textContent: "#2563EB",
        },
      ],
    );

    expect(result.text).toContain('<human_image_model_mentions count="1">');
    expect(result.text).toContain(
      '<model index="1" id="black-forest-labs/flux-kontext-pro" display_name="Flux Kontext Pro" />',
    );
    expect(result.text).toContain('<human_brand_kit_mentions count="2">');
    expect(result.text).toContain(
      '<brand_kit_asset index="1" id="brand-logo-1" type="logo" display_name="Loomic 主 Logo" file_url="https://example.com/logo.png" />',
    );
    expect(result.text).toContain(
      '<brand_kit_asset index="2" id="brand-color-1" type="color" display_name="品牌蓝" text_content="#2563EB" />',
    );
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
