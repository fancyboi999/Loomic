"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { ImageGenerationPreference } from "@loomic/shared";

const STORAGE_KEY = "loomic:image-model-preference";
const DEFAULT_MODEL = "google/nano-banana-2";

export type ImageModelPreference = ImageGenerationPreference;

const defaultPreference: ImageModelPreference = {
  mode: "auto",
  models: [DEFAULT_MODEL],
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
      cachedPreference = raw
        ? normalizePreference(JSON.parse(raw) as Partial<ImageModelPreference> & { model?: string })
        : defaultPreference;
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

function normalizePreference(
  preference?: Partial<ImageModelPreference> & { model?: string },
): ImageModelPreference {
  if (!preference) return defaultPreference;

  const models = Array.isArray(preference.models)
    ? preference.models.filter(
        (model): model is string => typeof model === "string" && model.length > 0,
      )
    : typeof preference.model === "string" && preference.model.length > 0
      ? [preference.model]
      : defaultPreference.models;

  return {
    mode: preference.mode === "manual" ? "manual" : "auto",
    models: models.length > 0 ? models : defaultPreference.models,
  };
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

  const toggleModel = useCallback(
    (model: string) => {
      const isSelected = preference.models.includes(model);

      if (isSelected && preference.models.length === 1) {
        return;
      }

      const models = isSelected
        ? preference.models.filter((item) => item !== model)
        : [...preference.models, model];

      setPreference({
        mode: "manual",
        models,
      });
    },
    [preference.models, setPreference],
  );

  const activeImageGenerationPreference =
    preference.mode === "manual" && preference.models.length > 0
      ? preference
      : undefined;

  return {
    preference,
    setPreference,
    setMode,
    toggleModel,
    activeImageGenerationPreference,
  };
}
