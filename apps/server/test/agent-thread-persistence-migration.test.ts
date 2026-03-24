import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath = new URL(
  "../../../supabase/migrations/20260324000007_agent_thread_persistence.sql",
  import.meta.url,
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("agent thread persistence migration", () => {
  const normalizedSql = normalizeSql(migrationSql);

  it("adds a nullable chat session thread_id with a partial unique index", () => {
    expect(normalizedSql).toContain(
      "alter table public.chat_sessions add column thread_id text;",
    );
    expect(normalizedSql).toContain(
      "create unique index chat_sessions_thread_id_non_null_idx on public.chat_sessions(thread_id) where thread_id is not null;",
    );
  });

  it("creates the required official langgraph persistence tables", () => {
    expect(normalizedSql).toContain("create schema if not exists langgraph;");

    for (const tableName of [
      "agent_runs",
      "checkpoint_migrations",
      "checkpoints",
      "checkpoint_blobs",
      "checkpoint_writes",
      "store_migrations",
      "store",
    ]) {
      expect(normalizedSql).toContain(
        tableName === "agent_runs"
          ? `create table public.${tableName} (`
          : `create table langgraph.${tableName} (`,
      );
    }
  });

  it("uses the official checkpoint/store column layout the runtime will depend on", () => {
    expect(normalizedSql).toContain(
      "create table langgraph.checkpoints ( thread_id text not null, checkpoint_ns text not null default '', checkpoint_id text not null, parent_checkpoint_id text, type text, checkpoint jsonb not null, metadata jsonb not null default '{}'::jsonb, primary key (thread_id, checkpoint_ns, checkpoint_id) );",
    );
    expect(normalizedSql).toContain(
      "create table langgraph.checkpoint_blobs ( thread_id text not null, checkpoint_ns text not null default '', channel text not null, version text not null, type text not null, blob bytea, primary key (thread_id, checkpoint_ns, channel, version) );",
    );
    expect(normalizedSql).toContain(
      "create table langgraph.checkpoint_writes ( thread_id text not null, checkpoint_ns text not null default '', checkpoint_id text not null, task_id text not null, idx integer not null, channel text not null, type text, blob bytea not null, primary key (thread_id, checkpoint_ns, checkpoint_id, task_id, idx) );",
    );
    expect(normalizedSql).toContain(
      "create table langgraph.store ( namespace_path text not null, key text not null, value jsonb not null, created_at timestamptz default current_timestamp, updated_at timestamptz default current_timestamp, expires_at timestamptz, primary key (namespace_path, key) );",
    );
  });

  it("keeps the run bookkeeping foreign key runtime code depends on", () => {
    expect(normalizedSql).toContain(
      "session_id uuid not null references public.chat_sessions(id) on delete cascade",
    );
  });

  it("enables RLS on server-only persistence tables without user-facing policies", () => {
    for (const tableName of [
      "agent_runs",
      "checkpoint_migrations",
      "checkpoints",
      "checkpoint_blobs",
      "checkpoint_writes",
      "store_migrations",
      "store",
    ]) {
      expect(normalizedSql).toContain(
        tableName === "agent_runs"
          ? `alter table public.${tableName} enable row level security;`
          : `alter table langgraph.${tableName} enable row level security;`,
      );
      expect(migrationSql).not.toMatch(
        new RegExp(`create policy\\s+${tableName}_`, "i"),
      );
    }
  });
});

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}
