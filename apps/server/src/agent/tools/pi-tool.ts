import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { z } from "zod";

/** Keep Zod as the runtime validator and expose the same schema to Pi. */
export function definePiTool<T extends z.ZodType>(options: {
  name: string;
  description: string;
  schema: T;
  run: (input: z.output<T>, signal?: AbortSignal) => Promise<unknown>;
}): AgentTool {
  return {
    name: options.name,
    label: options.name,
    description: options.description,
    // Pi validates model-supplied input; Zod defaults are filled only after parsing.
    parameters: Type.Unsafe(z.toJSONSchema(options.schema, { io: "input" })),
    async execute(_id, params, signal) {
      const input = options.schema.parse(params);
      const result = await options.run(input, signal);
      return {
        content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }],
        details: undefined,
      };
    },
  };
}

export type ToolContext = {
  access_token?: string;
  canvas_id?: string;
  user_id?: string;
  user_attachment_map?: Record<string, string>;
};

/** Bind server-owned run context before exposing a tool to the model. */
export function createTool(context: ToolContext = {}) {
  return <T extends z.ZodType>(
    run: (input: z.output<T>, config: { configurable: ToolContext }) => Promise<unknown>,
    metadata: { name: string; description: string; schema: T },
  ): AgentTool => definePiTool({
    ...metadata,
    run: (input) => run(input, { configurable: context }),
  });
}
