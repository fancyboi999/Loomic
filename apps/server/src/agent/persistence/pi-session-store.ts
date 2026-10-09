import pg from "pg";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { createProjectFileStore } from "./file-store.js";

/** One transcript per server-owned thread. The table is created by a migration. */
export function createPiSessionStore(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (error) => console.error("[pi-session-pool] Idle client error:", error.message));
  return {
    fileStore: createProjectFileStore(pool),
    async loadMessages(threadId: string): Promise<AgentMessage[] | null> {
      const { rows } = await pool.query<{ messages: AgentMessage[] }>(
        "select messages from pi.threads where thread_id = $1",
        [threadId],
      );
      return rows[0]?.messages ?? null;
    },
    async saveMessages(threadId: string, messages: AgentMessage[]): Promise<void> {
      await pool.query(
        `insert into pi.threads (thread_id, messages)
         values ($1, $2::jsonb)
         on conflict (thread_id) do update
         set messages = excluded.messages, updated_at = now()`,
        [threadId, JSON.stringify(messages.filter((message) => message.role !== "system"))],
      );
    },
  };
}
