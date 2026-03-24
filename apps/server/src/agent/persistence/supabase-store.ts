import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";

import { LANGGRAPH_PERSISTENCE_SCHEMA } from "./supabase-checkpointer.js";

type StoreFactory = typeof PostgresStore.fromConnString;

export async function createSupabaseStore(options: {
  connectionString: string;
  factory?: StoreFactory;
}) {
  const factory = options.factory ?? PostgresStore.fromConnString;
  const store = factory(options.connectionString, {
    schema: LANGGRAPH_PERSISTENCE_SCHEMA,
  });
  await store.setup();
  return store;
}
