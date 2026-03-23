import { type DesktopRuntime, createDesktopRuntime } from "./runtime.js";

export const DESKTOP_BRIDGE_KEY = "loomicDesktop";

export type DesktopBridge = Readonly<{
  runtime: DesktopRuntime;
}>;

export function createDesktopBridge(runtime: DesktopRuntime): DesktopBridge {
  return Object.freeze({
    runtime,
  });
}

export async function installDesktopBridge(
  runtime: DesktopRuntime = createDesktopRuntime(),
): Promise<void> {
  const { contextBridge } = await import("electron");

  contextBridge.exposeInMainWorld(
    DESKTOP_BRIDGE_KEY,
    createDesktopBridge(runtime),
  );
}

if (process.contextIsolated) {
  void installDesktopBridge();
}

declare global {
  interface Window {
    loomicDesktop?: DesktopBridge;
  }
}
