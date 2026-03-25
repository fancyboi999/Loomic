import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app } from "electron";

import { waitForHttpEntrypoint } from "./dev-server.js";
import { resolveDesktopContentSource } from "./url.js";
import { createDesktopLoadFailureUrl } from "./window-diagnostics.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentFileExtension = path.extname(currentFilePath);
const desktopAppDir = fileURLToPath(new URL("..", import.meta.url));
const preloadPath = fileURLToPath(
  new URL(`./preload${currentFileExtension}`, import.meta.url),
);

export async function createMainWindow(): Promise<BrowserWindow> {
  const source = resolveDesktopContentSource({
    mode: app.isPackaged ? "production" : "development",
    desktopAppDir,
    resourcesPath: process.resourcesPath,
  });

  if (!app.isPackaged && source.kind === "url") {
    await waitForHttpEntrypoint(source.entrypoint);
  }

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
  let isShowingLoadFailure = false;

  mainWindow.webContents.on(
    "did-fail-load",
    (
      _event,
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    ) => {
      if (!isMainFrame || isShowingLoadFailure) {
        return;
      }

      console.error("Desktop renderer failed to load.", {
        attemptedEntrypoint: validatedURL || source.entrypoint,
        errorCode,
        errorDescription,
      });

      isShowingLoadFailure = true;
      void showLoadFailurePage(mainWindow, {
        attemptedEntrypoint: validatedURL || source.entrypoint,
        errorCode,
        errorDescription,
      });
    },
  );

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Desktop renderer process exited unexpectedly.", details);
  });

  mainWindow.on("unresponsive", () => {
    console.error("Desktop window became unresponsive.");
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  try {
    await mainWindow.loadURL(source.entrypoint);
  } catch (error) {
    if (isShowingLoadFailure && isNavigationAbortError(error)) {
      return mainWindow;
    }

    console.error("Desktop window failed during initial load.", error);
    isShowingLoadFailure = true;
    await showLoadFailurePage(mainWindow, {
      attemptedEntrypoint: source.entrypoint,
      errorCode: -1,
      errorDescription:
        error instanceof Error ? error.message : "Unknown renderer load error",
    });
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

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

void bootstrap().catch((error) => {
  console.error("Desktop bootstrap failed.", error);
  app.exit(1);
});

async function showLoadFailurePage(
  mainWindow: BrowserWindow,
  options: Parameters<typeof createDesktopLoadFailureUrl>[0],
) {
  await mainWindow.loadURL(createDesktopLoadFailureUrl(options));
  mainWindow.show();
}

function isNavigationAbortError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ERR_ABORTED"
  );
}
