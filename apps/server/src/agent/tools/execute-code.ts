import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Result returned from the PGMQ-based code execution job.
 */
export type CodeExecutionResult = {
  output: string;
  exitCode: number;
  files: Array<{
    name: string;
    url: string;
    size: number;
    mime_type: string;
  }>;
};

/**
 * Closure type for submitting a code execution job via PGMQ and polling
 * until completion. Implemented in runtime.ts using the same pattern as
 * submitImageJob / submitVideoJob.
 */
export type SubmitCodeExecutionFn = (input: {
  command: string;
}) => Promise<CodeExecutionResult | { error: string }>;

/**
 * Create the custom `execute` tool for production mode (PGMQ-based).
 *
 * In production, there is no LocalShellBackend, so deepagents does not
 * inject its built-in `execute` tool. This custom tool provides the same
 * interface — the agent and SKILLs call `execute({ command })` as usual.
 *
 * The tool submits the command as a background job via PGMQ, which is
 * picked up by the worker process, run in an isolated subprocess, and
 * output files are auto-uploaded to Supabase Storage.
 */
export function createExecuteCodeTool(deps: {
  submitCodeExecution: SubmitCodeExecutionFn;
}) {
  return tool(
    async (input) => {
      try {
        const result = await deps.submitCodeExecution({
          command: input.command,
        });

        // Error case (timeout, dead-letter, etc.)
        if ("error" in result) {
          return `Error: ${result.error}\n[Command failed]`;
        }

        // Build output matching deepagents' built-in execute format
        const parts: string[] = [];

        if (result.output) {
          parts.push(result.output);
        }

        parts.push(
          `[Command ${result.exitCode === 0 ? "succeeded" : "failed"} with exit code ${result.exitCode}]`,
        );

        if (result.files.length > 0) {
          parts.push("");
          parts.push("Generated files:");
          for (const file of result.files) {
            parts.push(`- ${file.name}: ${file.url}`);
          }
        }

        return parts.join("\n");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return `Error: ${message}\n[Command failed]`;
      }
    },
    {
      name: "execute_code",
      description:
        "Execute a shell command in an isolated sandbox environment. " +
        "Python 3, Pillow, reportlab, and common CLI tools are available. " +
        "Output files created in the working directory are automatically uploaded " +
        "and their URLs are returned.",
      schema: z.object({
        command: z.string().describe("Shell command to execute"),
      }),
    },
  );
}
