import { describe, expect, it } from "vitest";

import { createViewerService } from "../src/features/bootstrap/ensure-user-foundation.js";

describe("createViewerService", () => {
  it("calls bootstrap_viewer RPC instead of raw profile upsert", async () => {
    const rpcCalls: unknown[] = [];
    const workspaceId = "ws-1";
    const admin = createMockAdminClient({
      rpcResult: { data: workspaceId, error: null },
      onRpc(name, params) {
        rpcCalls.push({ name, params });
      },
      profile: {
        avatar_url: "https://example.com/custom-avatar.png",
        display_name: "Custom Name",
        email: "ada@example.com",
        id: "user-ada",
      },
      workspace: {
        id: workspaceId,
        name: "Custom Name Workspace",
        owner_user_id: "user-ada",
        type: "personal",
      },
      membership: {
        role: "owner",
        user_id: "user-ada",
        workspace_id: workspaceId,
      },
    });

    const service = createViewerService({
      getAdminClient: () => admin as any,
    });
    const result = await service.ensureViewer({
      accessToken: "token",
      email: "ada@example.com",
      id: "user-ada",
      userMetadata: {
        avatar_url: "https://example.com/old-avatar.png",
        full_name: "Ada Lovelace",
      },
    });

    expect(rpcCalls).toEqual([
      {
        name: "bootstrap_viewer",
        params: {
          p_user_id: "user-ada",
          p_email: "ada@example.com",
          p_user_meta: {
            avatar_url: "https://example.com/old-avatar.png",
            full_name: "Ada Lovelace",
          },
        },
      },
    ]);
    // Profile values come from DB (which preserves user-edited data)
    expect(result.profile.displayName).toBe("Custom Name");
    expect(result.profile.avatarUrl).toBe(
      "https://example.com/custom-avatar.png",
    );
  });

  it("throws BootstrapError when RPC fails", async () => {
    const admin = createMockAdminClient({
      rpcResult: { data: null, error: { message: "rpc failed" } },
      profile: null,
      workspace: null,
      membership: null,
    });

    const service = createViewerService({
      getAdminClient: () => admin as any,
    });

    await expect(
      service.ensureViewer({
        accessToken: "token",
        email: "fail@example.com",
        id: "user-fail",
        userMetadata: {},
      }),
    ).rejects.toThrow("Unable to prepare viewer workspace.");
  });

  it("throws BootstrapError when workspace not found after bootstrap", async () => {
    const admin = createMockAdminClient({
      rpcResult: { data: "ws-1", error: null },
      profile: {
        avatar_url: null,
        display_name: "Test",
        email: "test@example.com",
        id: "user-test",
      },
      workspace: null,
      membership: null,
    });

    const service = createViewerService({
      getAdminClient: () => admin as any,
    });

    await expect(
      service.ensureViewer({
        accessToken: "token",
        email: "test@example.com",
        id: "user-test",
        userMetadata: {},
      }),
    ).rejects.toThrow("Unable to prepare viewer workspace.");
  });
});

function createMockAdminClient(options: {
  rpcResult: { data: unknown; error: unknown };
  onRpc?: (name: string, params: unknown) => void;
  profile: Record<string, unknown> | null;
  workspace: Record<string, unknown> | null;
  membership: Record<string, unknown> | null;
}) {
  return {
    rpc(name: string, params: unknown) {
      options.onRpc?.(name, params);
      return Promise.resolve(options.rpcResult);
    },
    from(table: string) {
      return createMockQueryBuilder(table, options);
    },
  };
}

function createMockQueryBuilder(
  table: string,
  options: {
    profile: Record<string, unknown> | null;
    workspace: Record<string, unknown> | null;
    membership: Record<string, unknown> | null;
  },
) {
  const chain: Record<string, unknown> = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      return chain;
    },
    single() {
      const dataMap: Record<string, unknown> = {
        profiles: options.profile,
        workspaces: options.workspace,
        workspace_members: options.membership,
      };
      const data = dataMap[table] ?? null;
      return Promise.resolve({
        data,
        error: data ? null : { message: `${table} not found` },
      });
    },
    maybeSingle() {
      const dataMap: Record<string, unknown> = {
        profiles: options.profile,
        workspaces: options.workspace,
        workspace_members: options.membership,
      };
      const data = dataMap[table] ?? null;
      return Promise.resolve({ data, error: null });
    },
  };
  return chain;
}
