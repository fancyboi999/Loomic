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
});
