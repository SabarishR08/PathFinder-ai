"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "pathfinder.learnerId";

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): string | null {
  return typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
}

function getServerSnapshot(): string | null {
  return null;
}

/** Learner identity: localStorage-backed, no-auth demo model. SSR-safe via useSyncExternalStore. */
export function useLearner() {
  const learnerId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLearnerId = useCallback((id: string | null) => {
    if (typeof window === "undefined") return;
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
    emit();
  }, []);

  return { learnerId, setLearnerId, hydrated: true };
}
