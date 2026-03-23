import { afterEach, describe, expect, it } from "vitest";

import { healthResponseSchema } from "@loomic/shared";

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

describe("GET /api/health", () => {
  it("returns liveness metadata and version info", async () => {
    const app = buildApp({
      env: {
        port: 3001,
        version: "9.9.9-test",
        webOrigin: "http://localhost:3000",
      },
    });
    appsUnderTest.add(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);

    const payload = healthResponseSchema.parse(response.json());
    expect(payload).toEqual({
      ok: true,
      service: "loomic-server",
      version: "9.9.9-test",
    });
  });

  it("allows browser-origin preflight requests from the configured web app origin", async () => {
    const app = buildApp({
      env: {
        port: 3001,
        version: "9.9.9-test",
        webOrigin: "http://localhost:3000",
      },
    });
    appsUnderTest.add(app);

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/health",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
  });
});
