import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

export const LANGGRAPH_PERSISTENCE_SCHEMA = "langgraph";

type CheckpointerFactory = typeof PostgresSaver.fromConnString;

export async function createSupabaseCheckpointer(options: {
  connectionString: string;
  factory?: CheckpointerFactory;
}) {
  const factory = options.factory ?? PostgresSaver.fromConnString;
  const checkpointer = factory(options.connectionString, {
    schema: LANGGRAPH_PERSISTENCE_SCHEMA,
  });
  await checkpointer.setup();
  return checkpointer;
}
