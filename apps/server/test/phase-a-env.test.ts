import { describe, expect, it } from "vitest";

import {
  DEFAULT_AGENT_BACKEND_MODE,
  DEFAULT_AGENT_MODEL,
  loadServerEnv,
} from "../src/config/env.js";

describe("@loomic/server phase-a env", () => {
  it("loads explicit deep-agent runtime settings from env", () => {
    const env = loadServerEnv({}, {
      LOOMIC_AGENT_MODEL: "gpt-4.1-mini",
      OPENAI_API_KEY: "test-key",
      OPENAI_API_BASE: "https://example.com/v1",
      LOOMIC_AGENT_BACKEND_MODE: "filesystem",
      LOOMIC_AGENT_FILES_ROOT: "/tmp/loomic-agent",
    } as NodeJS.ProcessEnv);

    expect(env.agentModel).toBe("gpt-4.1-mini");
    expect(env.openAIApiKey).toBe("test-key");
    expect(env.openAIApiBase).toBe("https://example.com/v1");
    expect(env.agentBackendMode).toBe("filesystem");
    expect(env.agentFilesRoot).toBe("/tmp/loomic-agent");
  });

  it("defaults phase-a runtime settings to a safe state-backed mode", () => {
    const env = loadServerEnv({}, {} as NodeJS.ProcessEnv);

    expect(env.agentModel).toBe(DEFAULT_AGENT_MODEL);
    expect(env.agentBackendMode).toBe(DEFAULT_AGENT_BACKEND_MODE);
    expect(env.agentBackendMode).toBe("state");
    expect(env.agentFilesRoot).toBeUndefined();
  });

  it("falls back to the default model when LOOMIC_AGENT_MODEL is blank", () => {
    const env = loadServerEnv({}, {
      LOOMIC_AGENT_MODEL: "   ",
    } as NodeJS.ProcessEnv);

    expect(env.agentModel).toBe(DEFAULT_AGENT_MODEL);
  });

  it("rejects unsupported backend modes", () => {
    expect(() =>
      loadServerEnv({}, {
        LOOMIC_AGENT_BACKEND_MODE: "local_shell",
      } as NodeJS.ProcessEnv),
    ).toThrow(/LOOMIC_AGENT_BACKEND_MODE/);
  });
});
