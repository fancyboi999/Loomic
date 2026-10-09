import type pg from "pg";

export type StoredFile = { key: string; content: string };

/** Store project workspace files independently of the agent transcript. */
export function createProjectFileStore(pool: pg.Pool) {
  return {
    async get(namespace: string[], key: string): Promise<string | null> {
      const { rows } = await pool.query<{ content: string }>(
        "select content from pi.files where namespace_path = $1 and key = $2",
        [namespace.join(":"), key],
      );
      return rows[0]?.content ?? null;
    },
    async list(namespace: string[]): Promise<StoredFile[]> {
      const { rows } = await pool.query<StoredFile>(
        "select key, content from pi.files where namespace_path = $1 order by key",
        [namespace.join(":")],
      );
      return rows;
    },
    async put(namespace: string[], key: string, content: string): Promise<void> {
      await pool.query(
        `insert into pi.files (namespace_path, key, content)
         values ($1, $2, $3)
         on conflict (namespace_path, key) do update set content = excluded.content`,
        [namespace.join(":"), key, content],
      );
    },
    async create(namespace: string[], key: string, content: string): Promise<boolean> {
      const result = await pool.query(
        `insert into pi.files (namespace_path, key, content)
         values ($1, $2, $3)
         on conflict (namespace_path, key) do nothing`,
        [namespace.join(":"), key, content],
      );
      return result.rowCount === 1;
    },
  };
}

export type ProjectFileStore = ReturnType<typeof createProjectFileStore>;
