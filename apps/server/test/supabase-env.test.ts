import { describe, expect, it } from "vitest";

import { loadServerEnv } from "../src/config/env.js";

describe("@loomic/server supabase env", () => {
  it("loads explicit Supabase settings from env", () => {
    const env = loadServerEnv(
      {},
      {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        SUPABASE_PROJECT_ID: "project-ref-123",
      } as NodeJS.ProcessEnv,
    );

    expect(env.supabaseUrl).toBe("https://example.supabase.co");
    expect(env.supabaseAnonKey).toBe("anon-key");
    expect(env.supabaseServiceRoleKey).toBe("service-role-key");
    expect(env.supabaseProjectId).toBe("project-ref-123");
  });

  it("omits Supabase settings when they are not configured", () => {
    const env = loadServerEnv({}, {} as NodeJS.ProcessEnv);

    expect(env.supabaseUrl).toBeUndefined();
    expect(env.supabaseAnonKey).toBeUndefined();
    expect(env.supabaseServiceRoleKey).toBeUndefined();
    expect(env.supabaseProjectId).toBeUndefined();
  });

  it("trims Supabase settings before exposing them", () => {
    const env = loadServerEnv(
      {},
      {
        SUPABASE_URL: " https://example.supabase.co ",
        SUPABASE_ANON_KEY: " anon-key ",
        SUPABASE_SERVICE_ROLE_KEY: " service-role-key ",
        SUPABASE_PROJECT_ID: " project-ref-123 ",
      } as NodeJS.ProcessEnv,
    );

    expect(env.supabaseUrl).toBe("https://example.supabase.co");
    expect(env.supabaseAnonKey).toBe("anon-key");
    expect(env.supabaseServiceRoleKey).toBe("service-role-key");
    expect(env.supabaseProjectId).toBe("project-ref-123");
  });
});
