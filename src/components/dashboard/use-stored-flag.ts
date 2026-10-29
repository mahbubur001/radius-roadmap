"use client";

import { useCallback, useSyncExternalStore } from "react";

// A boolean UI preference kept in localStorage (per browser), shared by every
// component that reads the same key. The server render uses the fallback.

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStoredFlag(key: string, fallback: boolean) {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : raw === "1";
    },
    () => fallback,
  );
  const set = useCallback(
    (next: boolean) => {
      window.localStorage.setItem(key, next ? "1" : "0");
      for (const listener of listeners) listener();
    },
    [key],
  );
  return [value, set] as const;
}
