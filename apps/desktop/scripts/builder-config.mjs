import path from "node:path";

export function createElectronBuilderConfig({ desktopAppDir }) {
  return {
    appId: "com.loomic.desktop",
    asar: true,
    directories: {
      output: path.join(desktopAppDir, "release"),
    },
    extraResources: [
      {
        from: path.join(desktopAppDir, "../web/out"),
        to: "web",
      },
    ],
    files: ["dist/**/*", "package.json"],
    mac: {
      category: "public.app-category.graphics-design",
      icon: path.join(desktopAppDir, "build/icon.icns"),
      target: ["dir"],
    },
    productName: "Loomic",
  };
}
