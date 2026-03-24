import { describe, expect, it, vi } from "vitest";

import { LANGGRAPH_PERSISTENCE_SCHEMA } from "../src/agent/persistence/supabase-checkpointer.js";
import { createSupabaseStore } from "../src/agent/persistence/supabase-store.js";

describe("supabase store factory", () => {
  it("creates an official PostgresStore in the langgraph schema and runs setup", async () => {
    const setup = vi.fn().mockResolvedValue(undefined);
    const factory = vi.fn().mockReturnValue({ setup });

    const store = await createSupabaseStore({
      connectionString: "postgresql://user:pass@localhost:5432/db",
      factory,
    });

    expect(factory).toHaveBeenCalledWith(
      "postgresql://user:pass@localhost:5432/db",
      { schema: LANGGRAPH_PERSISTENCE_SCHEMA },
    );
    expect(setup).toHaveBeenCalledTimes(1);
    expect(store).toMatchObject({ setup });
  });
});
