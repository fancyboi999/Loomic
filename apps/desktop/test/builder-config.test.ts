import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const desktopAppDir = fileURLToPath(new URL("..", import.meta.url));

describe("@loomic/desktop builder config", () => {
  it("packages desktop dist files and copies the exported web app into resources", async () => {
    const modulePath = "../scripts/builder-config.mjs";
    const { createElectronBuilderConfig } = await import(modulePath);
    const config = createElectronBuilderConfig({ desktopAppDir });

    expect(config.directories?.output).toBe(path.join(desktopAppDir, "release"));
    expect(config.files).toEqual(["dist/**/*", "package.json"]);
    expect(config.extraResources).toEqual([
      {
        from: path.join(desktopAppDir, "../web/out"),
        to: "web",
      },
    ]);
    expect(config.mac?.icon).toBe(path.join(desktopAppDir, "build/icon.icns"));
    expect(config.mac?.target).toEqual(["dir"]);
  });
});
