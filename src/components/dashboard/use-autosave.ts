"use client";

import { useCallback, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

/** Label for the drawer header's save indicator. */
export function autosaveLabel(status: AutosaveStatus) {
  return { idle: "", saving: "Saving…", saved: "Saved", error: "Not saved" }[
    status
  ];
}

/**
 * Debounced autosave. Patches merge until 600 ms of quiet, then go out one
 * request at a time (so a slow save can't land after a newer one).
 */
export function useAutosave<Patch extends object>(
  save: (patch: Patch) => Promise<boolean>,
) {
  const pending = useRef<Partial<Patch>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const queue = useRef(Promise.resolve());
  const [status, setStatus] = useState<AutosaveStatus>("idle");

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return queue.current;
    setStatus("saving");
    queue.current = queue.current.then(async () => {
      setStatus((await save(patch as Patch)) ? "saved" : "error");
    });
    return queue.current;
  }, [save]);

  const schedule = useCallback(
    (patch: Patch) => {
      Object.assign(pending.current, patch);
      setStatus("saving");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 600);
    },
    [flush],
  );

  return { schedule, flush, status };
}
