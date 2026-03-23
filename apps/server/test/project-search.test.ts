import { describe, expect, it } from "vitest";

import { StateBackend } from "deepagents";

import {
  createProjectSearchTool,
  runProjectSearch,
} from "../src/agent/tools/project-search.js";

describe("project_search tool", () => {
  it("returns a deterministic summary for workspace matches", async () => {
    const backend = new StateBackend({
      state: {
        files: {
          "/workspace/docs/foundation.md": createFileData(
            "Loomic foundation doc\nTask two backend work",
          ),
          "/workspace/specs/plan.md": createFileData(
            "Backend work plan\nfoundation follow-up",
          ),
          "/memories/user.md": createFileData(
            "foundation should stay outside search",
          ),
        },
      },
    });

    const result = await runProjectSearch(backend, {
      query: "foundation",
    });

    expect(result).toEqual({
      matchCount: 2,
      summary: 'Found 2 workspace match(es) for "foundation" across 2 file(s).',
      matches: [
        {
          line: 1,
          path: "/workspace/docs/foundation.md",
          text: "Loomic foundation doc",
        },
        {
          line: 2,
          path: "/workspace/specs/plan.md",
          text: "foundation follow-up",
        },
      ],
    });
  });

  it("exposes the same deterministic summary through the LangChain tool wrapper", async () => {
    const backend = new StateBackend({
      state: {
        files: {
          "/workspace/docs/foundation.md": createFileData(
            "Loomic foundation doc",
          ),
        },
      },
    });
    const tool = createProjectSearchTool(backend);

    const result = await tool.invoke({
      query: "foundation",
    });

    expect(result).toEqual({
      matchCount: 1,
      summary: 'Found 1 workspace match(es) for "foundation" across 1 file(s).',
      matches: [
        {
          line: 1,
          path: "/workspace/docs/foundation.md",
          text: "Loomic foundation doc",
        },
      ],
    });
  });
});

function createFileData(content: string) {
  const timestamp = "2026-03-23T12:00:00.000Z";

  return {
    content: content.split("\n"),
    created_at: timestamp,
    modified_at: timestamp,
  };
}
