import { describe, expect, it, vi } from "vitest";

// Mock pg.Pool to avoid real DB connections in unit tests
const mockPoolInstance = {
  on: vi.fn(),
};
vi.mock("pg", () => ({
  default: {
    Pool: vi.fn(() => mockPoolInstance),
  },
}));

// Mock PostgresSaver to avoid real DB setup
const mockSetup = vi.fn().mockResolvedValue(undefined);
vi.mock("@langchain/langgraph-checkpoint-postgres", () => ({
  PostgresSaver: vi.fn(() => ({ setup: mockSetup })),
}));

import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  LANGGRAPH_PERSISTENCE_SCHEMA,
  createSupabaseCheckpointer,
} from "../src/agent/persistence/supabase-checkpointer.js";

describe("supabase checkpointer factory", () => {
  it("creates a PostgresSaver with a bounded pool and runs setup", async () => {
    const checkpointer = await createSupabaseCheckpointer({
      connectionString: "postgresql://user:pass@localhost:5432/db",
    });

    // Pool created with explicit max limit
    expect(pg.Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: "postgresql://user:pass@localhost:5432/db",
        max: 3,
      }),
    );

    // Pool error listener registered
    expect(mockPoolInstance.on).toHaveBeenCalledWith("error", expect.any(Function));

    // PostgresSaver constructed with pool and schema
    expect(PostgresSaver).toHaveBeenCalledWith(mockPoolInstance, undefined, {
      schema: LANGGRAPH_PERSISTENCE_SCHEMA,
    });

    expect(mockSetup).toHaveBeenCalledTimes(1);
    expect(checkpointer).toMatchObject({ setup: mockSetup });
  });

  it("respects custom poolMax", async () => {
    vi.mocked(pg.Pool).mockClear();

    await createSupabaseCheckpointer({
      connectionString: "postgresql://user:pass@localhost:5432/db",
      poolMax: 5,
    });

    expect(pg.Pool).toHaveBeenCalledWith(
      expect.objectContaining({ max: 5 }),
    );
  });
});
