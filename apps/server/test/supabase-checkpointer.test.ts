import { describe, expect, it, vi } from "vitest";

import {
  LANGGRAPH_PERSISTENCE_SCHEMA,
  createSupabaseCheckpointer,
} from "../src/agent/persistence/supabase-checkpointer.js";

describe("supabase checkpointer factory", () => {
  it("creates an official PostgresSaver in the langgraph schema and runs setup", async () => {
    const setup = vi.fn().mockResolvedValue(undefined);
    const factory = vi.fn().mockReturnValue({ setup });

    const checkpointer = await createSupabaseCheckpointer({
      connectionString: "postgresql://user:pass@localhost:5432/db",
      factory,
    });

    expect(factory).toHaveBeenCalledWith(
      "postgresql://user:pass@localhost:5432/db",
      { schema: LANGGRAPH_PERSISTENCE_SCHEMA },
    );
    expect(setup).toHaveBeenCalledTimes(1);
    expect(checkpointer).toMatchObject({ setup });
  });
});
