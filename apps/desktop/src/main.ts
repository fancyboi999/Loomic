import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app } from "electron";

import { resolveDesktopContentSource } from "./url.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentFileExtension = path.extname(currentFilePath);
const desktopAppDir = fileURLToPath(new URL("..", import.meta.url));
const preloadPath = fileURLToPath(
  new URL(`./preload${currentFileExtension}`, import.meta.url),
);

export async function createMainWindow(): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: "#0f1115",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const source = resolveDesktopContentSource({
    mode: app.isPackaged ? "production" : "development",
    desktopAppDir,
  });

  await mainWindow.loadURL(source.entrypoint);
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  return mainWindow;
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  await createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

void bootstrap();
