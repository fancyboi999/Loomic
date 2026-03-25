import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(appDir, "dist");

await mkdir(outDir, { recursive: true });

await Promise.all([
  build({
    bundle: true,
    entryPoints: [path.join(appDir, "src/main.ts")],
    external: ["electron"],
    format: "esm",
    outfile: path.join(outDir, "main.js"),
    platform: "node",
    sourcemap: true,
    target: "node22",
  }),
  build({
    bundle: true,
    entryPoints: [path.join(appDir, "src/preload.ts")],
    external: ["electron"],
    format: "esm",
    outfile: path.join(outDir, "preload.js"),
    platform: "node",
    sourcemap: true,
    target: "node22",
  }),
]);
