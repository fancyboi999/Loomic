import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { createDesktopBridge } from "../src/preload.js";
import {
  DEFAULT_SERVER_BASE_URL,
  createDesktopRuntime,
} from "../src/runtime.js";
import {
  DEFAULT_WEB_DEV_URL,
  resolveDesktopContentSource,
} from "../src/url.js";

describe("@loomic/desktop shell url resolution", () => {
  it("prefers WEB_URL in development", () => {
    const source = resolveDesktopContentSource({
      mode: "development",
      env: {
        WEB_URL: "http://localhost:4010",
      },
      desktopAppDir: "/repo/apps/desktop",
    });

    expect(source).toEqual({
      kind: "url",
      entrypoint: "http://localhost:4010",
    });
  });

  it("falls back to the local Next.js dev server in development", () => {
    const source = resolveDesktopContentSource({
      mode: "development",
      env: {},
      desktopAppDir: "/repo/apps/desktop",
    });

    expect(source).toEqual({
      kind: "url",
      entrypoint: DEFAULT_WEB_DEV_URL,
    });
  });

  it("resolves the packaged web export from apps/web/out in production", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "loomic-desktop-"));
    const desktopAppDir = path.join(tempRoot, "apps/desktop");
    const webOutDir = path.join(tempRoot, "apps/web/out");
    const expectedIndexPath = path.join(webOutDir, "index.html");

    await mkdir(desktopAppDir, { recursive: true });
    await mkdir(webOutDir, { recursive: true });
    await writeFile(expectedIndexPath, "<!doctype html>", "utf8");

    const source = resolveDesktopContentSource({
      mode: "production",
      env: {},
      desktopAppDir,
    });

    expect(source.kind).toBe("file");
    if (source.kind !== "file") {
      throw new Error("Expected a file-based production entrypoint.");
    }

    expect(source.filePath).toBe(expectedIndexPath);
    expect(source.entrypoint).toBe(pathToFileURL(expectedIndexPath).toString());
    expect(source.entrypoint).toMatch(/apps\/web\/out\/index\.html$/);
  });
});

describe("@loomic/desktop preload bridge", () => {
  it("exposes only minimal runtime metadata for this phase", () => {
    const runtime = createDesktopRuntime({
      env: {
        LOOMIC_SERVER_PORT: "4123",
      },
      platform: "darwin",
      appVersion: "0.0.0-test",
    });

    expect(createDesktopRuntime({ env: {}, platform: "linux" })).toEqual({
      appVersion: "0.0.0",
      platform: "linux",
      serverBaseUrl: DEFAULT_SERVER_BASE_URL,
    });

    const bridge = createDesktopBridge(runtime);

    expect(Object.keys(bridge)).toEqual(["runtime"]);
    expect(bridge.runtime).toEqual({
      appVersion: "0.0.0-test",
      platform: "darwin",
      serverBaseUrl: "http://127.0.0.1:4123",
    });
  });
});
