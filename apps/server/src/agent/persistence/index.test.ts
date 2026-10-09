import { describe, expect, it, vi } from "vitest";

import { createAgentPersistenceService } from "./index.js";
import { createPiSessionStore } from "./pi-session-store.js";

describe("Pi persistence", () => {
  it("returns no persistence without a database URL", async () => {
    const createStore = vi.fn();
    const service = createAgentPersistenceService({}, {
      createPiSessionStore: createStore as unknown as typeof createPiSessionStore,
    });

    expect(await service.getPersistence()).toBeNull();
    expect(createStore).not.toHaveBeenCalled();
  });

  it("loads Pi messages and starts a new thread with an empty transcript", async () => {
    const messages = [{ role: "user", content: "Current", timestamp: 1 }];
    const loadMessages = vi.fn().mockResolvedValueOnce(messages).mockResolvedValueOnce(null);
    const saveMessages = vi.fn();
    const createStore = vi.fn(() => ({ fileStore: {}, loadMessages, saveMessages })) as unknown as typeof createPiSessionStore;
    const service = createAgentPersistenceService({ supabaseDbUrl: "postgres://test" }, {
      createPiSessionStore: createStore,
    });

    const persistence = await service.getPersistence();
    expect(await persistence?.loadMessages("thread-1")).toEqual(messages);
    expect(await persistence?.loadMessages("thread-2")).toEqual([]);
    await persistence?.saveMessages("thread-1", messages as never);
    expect(saveMessages).toHaveBeenCalledWith("thread-1", messages);
    expect(await service.getPersistence()).toBe(persistence);
    expect(createStore).toHaveBeenCalledOnce();
  });
});
