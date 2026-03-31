import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";

import { LANGGRAPH_PERSISTENCE_SCHEMA } from "./supabase-checkpointer.js";

/**
 * Default pool size for the store connection pool.
 * Kept low to avoid exhausting Supabase Supavisor connection limits.
 */
const DEFAULT_POOL_MAX = 3;

export async function createSupabaseStore(options: {
  connectionString: string;
  poolMax?: number;
}) {
  const store = new PostgresStore({
    connectionOptions: {
      connectionString: options.connectionString,
      max: options.poolMax ?? DEFAULT_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    },
    schema: LANGGRAPH_PERSISTENCE_SCHEMA,
  });
  await store.setup();
  return store;
}
