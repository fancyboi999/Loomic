import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { createElectronBuilderConfig } from "./builder-config.mjs";

const require = createRequire(import.meta.url);
const { build } = require("electron-builder");

const desktopAppDir = fileURLToPath(new URL("..", import.meta.url));

await build({
  config: createElectronBuilderConfig({ desktopAppDir }),
  projectDir: desktopAppDir,
  publish: "never",
});

console.log(
  `Electron packaging complete: ${path.join(desktopAppDir, "release")}`,
);
