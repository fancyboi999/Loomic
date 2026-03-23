import { describe, expect, it } from "vitest";

import {
  applyOpenAICompatEnv,
  createDefaultModelSpecifier,
  createLoomicDeepAgent,
} from "../src/agent/deep-agent.js";

describe("@loomic/server deep-agent config", () => {
  it("maps OpenAI-compatible env vars for the default deep-agent model path", () => {
    const targetEnv: NodeJS.ProcessEnv = {};

    applyOpenAICompatEnv(
      {
        openAIApiBase: "https://proxy.example.com/v1",
        openAIApiKey: "proxy-key",
      },
      targetEnv,
    );

    expect(targetEnv.OPENAI_API_KEY).toBe("proxy-key");
    expect(targetEnv.OPENAI_BASE_URL).toBe("https://proxy.example.com/v1");
  });

  it("uses an OpenAI provider-scoped model id for the default deep-agent model", () => {
    expect(
      createDefaultModelSpecifier({
        agentModel: "az_sre/gpt-5.4",
      }),
    ).toBe("openai:az_sre/gpt-5.4");
  });

  it("still creates a default deep agent after applying OpenAI-compatible env", () => {
    const targetEnv: NodeJS.ProcessEnv = {};

    applyOpenAICompatEnv(
      {
        openAIApiBase: "https://proxy.example.com/v1",
        openAIApiKey: "proxy-key",
      },
      targetEnv,
    );

    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalBaseUrl = process.env.OPENAI_BASE_URL;
    process.env.OPENAI_API_KEY = targetEnv.OPENAI_API_KEY;
    process.env.OPENAI_BASE_URL = targetEnv.OPENAI_BASE_URL;

    try {
      const agent = createLoomicDeepAgent({
        env: {
          agentBackendMode: "state",
          agentModel: "az_sre/gpt-5.4",
          openAIApiBase: "https://proxy.example.com/v1",
          openAIApiKey: "proxy-key",
          port: 3001,
          version: "0.0.0-test",
          webOrigin: "http://localhost:3000",
        },
      });

      expect(agent).toBeDefined();
    } finally {
      if (originalApiKey === undefined) {
        process.env.OPENAI_API_KEY = undefined;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }

      if (originalBaseUrl === undefined) {
        process.env.OPENAI_BASE_URL = undefined;
      } else {
        process.env.OPENAI_BASE_URL = originalBaseUrl;
      }
    }
  });
});
