"use client";

import { useSyncExternalStore } from "react";

/** True while the media query matches; false on the server. */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Wide enough for a list and a detail pane side by side (doc 30 R8). */
export const WIDE = "(min-width: 1440px)";

/** Phone width: details open as bottom sheets (doc 31 M3). */
export const PHONE = "(max-width: 767px)";
