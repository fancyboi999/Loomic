import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

export const LANGGRAPH_PERSISTENCE_SCHEMA = "langgraph";

/**
 * Default pool size for the checkpointer connection pool.
 * Kept low to avoid exhausting Supabase Supavisor connection limits
 * when multiple pools (checkpointer + store + pgmq) coexist.
 */
const DEFAULT_POOL_MAX = 3;

export async function createSupabaseCheckpointer(options: {
  connectionString: string;
  poolMax?: number;
}) {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.poolMax ?? DEFAULT_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  // Prevent pool-level errors from crashing the process
  pool.on("error", (err) => {
    console.error("[checkpointer-pool] Unexpected error on idle client:", err.message);
  });

  const checkpointer = new PostgresSaver(pool, undefined, {
    schema: LANGGRAPH_PERSISTENCE_SCHEMA,
  });
  await checkpointer.setup();
  return checkpointer;
}
