import { describe, expect, it } from "vitest";

describe("tool exports", () => {
  it("createMainAgentTools returns core tools including generate_image", { timeout: 15_000 }, async () => {
    const { createMainAgentTools } = await import("../src/agent/tools/index.js");
    const mockBackend = {} as any;
    const mockCreateUserClient = (() => {}) as any;
    const tools = createMainAgentTools(mockBackend, { createUserClient: mockCreateUserClient });
    const names = tools.map((t: any) => t.name);
    expect(names).toContain("think");
    expect(names).toContain("inspect_canvas");
    expect(names).toContain("project_search");
    expect(names).toContain("generate_image");
  });
});
