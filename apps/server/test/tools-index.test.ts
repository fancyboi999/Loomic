import { describe, expect, it } from "vitest";

describe("tool exports", () => {
  it("createMainAgentTools returns inspect_canvas and project_search only", async () => {
    const { createMainAgentTools } = await import("../src/agent/tools/index.js");
    const mockBackend = {} as any;
    const mockCreateUserClient = (() => {}) as any;
    const tools = createMainAgentTools(mockBackend, { createUserClient: mockCreateUserClient });
    const names = tools.map((t: any) => t.name);
    expect(names).toContain("inspect_canvas");
    expect(names).toContain("project_search");
    expect(names).not.toContain("generate_image");
    expect(names).not.toContain("generate_video");
  });
});
