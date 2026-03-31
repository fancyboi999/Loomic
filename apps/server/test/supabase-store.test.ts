import { describe, expect, it, vi } from "vitest";

// Mock PostgresStore to avoid real DB connections in unit tests
const mockSetup = vi.fn().mockResolvedValue(undefined);
vi.mock("@langchain/langgraph-checkpoint-postgres/store", () => ({
  PostgresStore: vi.fn(() => ({ setup: mockSetup })),
}));

import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { LANGGRAPH_PERSISTENCE_SCHEMA } from "../src/agent/persistence/supabase-checkpointer.js";
import { createSupabaseStore } from "../src/agent/persistence/supabase-store.js";

describe("supabase store factory", () => {
  it("creates a PostgresStore with bounded pool config and runs setup", async () => {
    const store = await createSupabaseStore({
      connectionString: "postgresql://user:pass@localhost:5432/db",
    });

    expect(PostgresStore).toHaveBeenCalledWith({
      connectionOptions: expect.objectContaining({
        connectionString: "postgresql://user:pass@localhost:5432/db",
        max: 3,
      }),
      schema: LANGGRAPH_PERSISTENCE_SCHEMA,
    });

    expect(mockSetup).toHaveBeenCalledTimes(1);
    expect(store).toMatchObject({ setup: mockSetup });
  });

  it("respects custom poolMax", async () => {
    vi.mocked(PostgresStore).mockClear();

    await createSupabaseStore({
      connectionString: "postgresql://user:pass@localhost:5432/db",
      poolMax: 5,
    });

    expect(PostgresStore).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionOptions: expect.objectContaining({ max: 5 }),
      }),
    );
  });
});
