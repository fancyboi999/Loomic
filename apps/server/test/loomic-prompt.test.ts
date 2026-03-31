import { describe, expect, it } from "vitest";
import { LOOMIC_SYSTEM_PROMPT } from "../src/agent/prompts/loomic-main.js";

describe("LOOMIC_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof LOOMIC_SYSTEM_PROMPT).toBe("string");
    expect(LOOMIC_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it("contains Loomic persona identity", () => {
    expect(LOOMIC_SYSTEM_PROMPT).toContain("Loomic");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("inspect_canvas");
  });

  it("contains coordinate system documentation", () => {
    expect(LOOMIC_SYSTEM_PROMPT).toContain("x 向右增大");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("y 向下增大");
  });

  it("contains behavioral boundaries", () => {
    expect(LOOMIC_SYSTEM_PROMPT).toContain("不是猜测补全");
  });

  it("contains image input detection instructions", () => {
    expect(LOOMIC_SYSTEM_PROMPT).toContain("参考图片处理");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("<input_images>");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("asset_id");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("inputImages");
  });

  it("contains image model preference instructions", () => {
    expect(LOOMIC_SYSTEM_PROMPT).toContain("图片模型偏好");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("<human_image_generation_preference>");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("preferred_model");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("generate_image 工具的 model 参数");
  });

  it("contains explicit mention instructions for models and brand kit assets", () => {
    expect(LOOMIC_SYSTEM_PROMPT).toContain("<human_image_model_mentions>");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("为每个模型分别调用一次 generate_image");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("<human_brand_kit_mentions>");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("必须使用或必须参考");
  });

  it("keeps image generation on the main agent tool path", () => {
    expect(LOOMIC_SYSTEM_PROMPT).toContain("多张图片或复杂图片工作流");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("自行规划");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("generate_image 工具");
    expect(LOOMIC_SYSTEM_PROMPT).not.toContain("委派给 image_generate 子代理");
  });
});
