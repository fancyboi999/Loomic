import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const desktopAppDir = fileURLToPath(new URL("..", import.meta.url));
const sourceSvgPath = path.join(desktopAppDir, "../web/public/logo.svg");
const buildDir = path.join(desktopAppDir, "build");
const iconIcnsPath = path.join(buildDir, "icon.icns");

const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "loomic-iconset-"));
const rasterDir = path.join(tmpRoot, "raster");
const iconsetDir = path.join(tmpRoot, "Loomic.iconset");

await mkdir(rasterDir, { recursive: true });
await mkdir(iconsetDir, { recursive: true });
await mkdir(buildDir, { recursive: true });

try {
  await execFileAsync("/usr/bin/qlmanage", [
    "-t",
    "-s",
    "1024",
    "-o",
    rasterDir,
    sourceSvgPath,
  ]);

  const basePngPath = path.join(
    rasterDir,
    `${path.basename(sourceSvgPath)}.png`,
  );

  const variants = [
    ["icon_16x16.png", "16"],
    ["icon_16x16@2x.png", "32"],
    ["icon_32x32.png", "32"],
    ["icon_32x32@2x.png", "64"],
    ["icon_128x128.png", "128"],
    ["icon_128x128@2x.png", "256"],
    ["icon_256x256.png", "256"],
    ["icon_256x256@2x.png", "512"],
    ["icon_512x512.png", "512"],
    ["icon_512x512@2x.png", "1024"],
  ];

  for (const [fileName, size] of variants) {
    await execFileAsync("/usr/bin/sips", [
      "-z",
      size,
      size,
      basePngPath,
      "--out",
      path.join(iconsetDir, fileName),
    ]);
  }

  await execFileAsync("/usr/bin/iconutil", [
    "-c",
    "icns",
    iconsetDir,
    "-o",
    iconIcnsPath,
  ]);

  console.log(`Generated macOS app icon: ${iconIcnsPath}`);
} finally {
  await rm(tmpRoot, { force: true, recursive: true });
}
