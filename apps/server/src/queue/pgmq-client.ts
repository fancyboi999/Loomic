import pg from "pg";

export type PgmqMessage<T = Record<string, unknown>> = {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: T;
};

export type PgmqClient = {
  send(queue: string, payload: Record<string, unknown>, delay?: number): Promise<number>;
  read<T = Record<string, unknown>>(queue: string, vt: number, qty: number): Promise<PgmqMessage<T>[]>;
  deleteMsg(queue: string, msgId: number): Promise<boolean>;
  archive(queue: string, msgId: number): Promise<boolean>;
  setVt(queue: string, msgId: number, vt: number): Promise<void>;
  shutdown(): Promise<void>;
};

export function createPgmqClient(databaseUrl: string): PgmqClient {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  // Prevent unhandled pool errors from crashing the process on transient DB blips
  pool.on("error", (err) => {
    console.error("[pgmq-client] Pool error (non-fatal):", err.message);
  });

  return {
    async send(queue, payload, delay = 0) {
      const { rows } = await pool.query(
        `SELECT * FROM pgmq.send($1::text, $2::jsonb, $3::integer)`,
        [queue, JSON.stringify(payload), delay],
      );
      return rows[0].send;
    },

    async read<T>(queue: string, vt: number, qty: number) {
      const { rows } = await pool.query(
        `SELECT * FROM pgmq.read($1::text, $2::integer, $3::integer)`,
        [queue, vt, qty],
      );
      return rows as PgmqMessage<T>[];
    },

    async deleteMsg(queue, msgId) {
      const { rows } = await pool.query(
        `SELECT pgmq.delete($1::text, $2::bigint)`,
        [queue, msgId],
      );
      return rows[0]?.delete === true;
    },

    async archive(queue, msgId) {
      const { rows } = await pool.query(
        `SELECT pgmq.archive($1::text, $2::bigint)`,
        [queue, msgId],
      );
      return rows[0]?.archive === true;
    },

    async setVt(queue, msgId, vt) {
      await pool.query(
        `SELECT pgmq.set_vt($1::text, $2::bigint, $3::integer)`,
        [queue, msgId, vt],
      );
    },

    async shutdown() {
      await pool.end();
    },
  };
}
