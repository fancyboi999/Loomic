import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath = new URL(
  "../../../supabase/migrations/20260324000007_agent_thread_persistence.sql",
  import.meta.url,
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("agent thread persistence migration", () => {
  it("adds a nullable chat session thread_id with a partial unique index", () => {
    expect(migrationSql).toMatch(
      /alter table public\.chat_sessions\s+add column thread_id text/i,
    );
    expect(migrationSql).toMatch(
      /create unique index .*chat_sessions_thread_id.* on public\.chat_sessions\s*\(thread_id\)\s*where thread_id is not null/i,
    );
  });

  it("creates the required persistence tables", () => {
    for (const tableName of [
      "agent_runs",
      "agent_checkpoints",
      "agent_checkpoint_writes",
      "agent_store_items",
    ]) {
      expect(migrationSql).toMatch(
        new RegExp(`create table public\\.${tableName}\\b`, "i"),
      );
    }
  });

  it("defines the foreign keys runtime code depends on", () => {
    expect(migrationSql).toMatch(
      /session_id\s+uuid\s+not null references public\.chat_sessions\(id\) on delete cascade/i,
    );
    expect(migrationSql).toMatch(
      /foreign key \(thread_id,\s*checkpoint_ns,\s*checkpoint_id\)\s+references public\.agent_checkpoints\(thread_id,\s*checkpoint_ns,\s*checkpoint_id\)\s+on delete cascade/i,
    );
  });

  it("enables RLS on server-only persistence tables without user-facing policies", () => {
    for (const tableName of [
      "agent_runs",
      "agent_checkpoints",
      "agent_checkpoint_writes",
      "agent_store_items",
    ]) {
      expect(migrationSql).toMatch(
        new RegExp(
          `alter table public\\.${tableName}\\s+enable row level security`,
          "i",
        ),
      );
      expect(migrationSql).not.toMatch(
        new RegExp(`create policy\\s+${tableName}_`, "i"),
      );
    }
  });
});
