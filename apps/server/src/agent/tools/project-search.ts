import type { BackendProtocol } from "deepagents";
import { tool } from "langchain";
import { z } from "zod";

const DEFAULT_SEARCH_ROOT = "/workspace";
const DEFAULT_MAX_MATCHES = 5;

const projectSearchSchema = z.object({
  query: z.string().min(1),
  glob: z.string().min(1).optional(),
  maxMatches: z.number().int().positive().max(20).optional(),
});

type ProjectSearchInput = z.infer<typeof projectSearchSchema>;

type ProjectSearchResult = {
  matchCount: number;
  matches: Array<{
    line: number;
    path: string;
    text: string;
  }>;
  summary: string;
};

export async function runProjectSearch(
  backend: BackendProtocol,
  input: ProjectSearchInput,
): Promise<ProjectSearchResult> {
  const rawMatches = await backend.grepRaw(
    input.query,
    DEFAULT_SEARCH_ROOT,
    input.glob ?? null,
  );

  if (typeof rawMatches === "string") {
    return {
      matchCount: 0,
      matches: [],
      summary: rawMatches,
    };
  }

  const sortedMatches = [...rawMatches].sort((left, right) => {
    if (left.path === right.path) {
      return left.line - right.line;
    }

    return left.path.localeCompare(right.path);
  });
  const matchCount = sortedMatches.length;
  const limitedMatches = sortedMatches.slice(
    0,
    input.maxMatches ?? DEFAULT_MAX_MATCHES,
  );
  const fileCount = new Set(sortedMatches.map((match) => match.path)).size;

  return {
    matchCount,
    matches: limitedMatches.map((match) => ({
      line: match.line,
      path: match.path,
      text: match.text,
    })),
    summary:
      matchCount === 0
        ? `No workspace matches found for "${input.query}".`
        : `Found ${matchCount} workspace match(es) for "${input.query}" across ${fileCount} file(s).`,
  };
}

export function createProjectSearchTool(backend: BackendProtocol) {
  return tool(
    async (input) => {
      return await runProjectSearch(backend, input);
    },
    {
      name: "project_search",
      description:
        "Search the Loomic workspace for matching project text without using shell execution.",
      schema: projectSearchSchema,
    },
  );
}
