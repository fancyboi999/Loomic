"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "loomic:image-model-preference";
const DEFAULT_MODEL = "google/nano-banana-2";

export type ImageModelPreference = {
  mode: "auto" | "manual";
  model: string;
};

const defaultPreference: ImageModelPreference = {
  mode: "auto",
  model: DEFAULT_MODEL,
};

// Listeners for cross-component reactivity
const listeners = new Set<() => void>();
function emitChange() {
  for (const listener of listeners) listener();
}

// Cache parsed result — useSyncExternalStore requires stable references
let cachedRaw: string | null = null;
let cachedPreference: ImageModelPreference = defaultPreference;

function getSnapshot(): ImageModelPreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedPreference = raw ? (JSON.parse(raw) as ImageModelPreference) : defaultPreference;
    }
    return cachedPreference;
  } catch {
    return defaultPreference;
  }
}

function getServerSnapshot(): ImageModelPreference {
  return defaultPreference;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useImageModelPreference() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setPreference = useCallback((next: ImageModelPreference) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    emitChange();
  }, []);

  const setMode = useCallback(
    (mode: "auto" | "manual") => {
      setPreference({ ...preference, mode });
    },
    [preference, setPreference],
  );

  const setModel = useCallback(
    (model: string) => {
      setPreference({ mode: "manual", model });
    },
    [setPreference],
  );

  /** Returns the model ID to send in the run payload, or undefined for auto mode. */
  const activeImageModel = preference.mode === "manual" ? preference.model : undefined;

  return { preference, setPreference, setMode, setModel, activeImageModel };
}
