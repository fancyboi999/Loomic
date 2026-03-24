import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const appsUnderTest = new Set<Awaited<ReturnType<typeof buildApp>>>();

afterEach(async () => {
  await Promise.all(
    [...appsUnderTest].map(async (app) => {
      appsUnderTest.delete(app);
      await app.close();
    }),
  );
});

describe("POST /api/agent/generate-image", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildApp({
      env: {
        port: 3001,
        version: "test",
        webOrigin: "http://localhost:3000",
      },
      auth: {
        async authenticate() {
          return null;
        },
      },
    });
    appsUnderTest.add(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/generate-image",
      headers: {
        authorization: "Bearer invalid",
        "content-type": "application/json",
      },
      payload: { prompt: "a cat" },
    });

    expect(response.statusCode).toBe(401);
  });
});
