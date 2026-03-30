"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "loomic:agent-model";

type AgentModel = string | null; // null = auto (workspace default)

// Listeners for cross-component reactivity
const listeners = new Set<() => void>();
function emitChange() {
  for (const listener of listeners) listener();
}

// Cache parsed result -- useSyncExternalStore requires stable references
let cachedRaw: string | null | undefined;
let cachedModel: AgentModel = null;

function getSnapshot(): AgentModel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedModel = raw || null;
    }
    return cachedModel;
  } catch {
    return null;
  }
}

function getServerSnapshot(): AgentModel {
  return null;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useAgentModel() {
  const model = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setModel = useCallback((next: AgentModel) => {
    if (next) {
      localStorage.setItem(STORAGE_KEY, next);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    emitChange();
  }, []);

  return { model, setModel };
}
