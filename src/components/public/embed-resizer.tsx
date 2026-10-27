"use client";

import { useEffect } from "react";

/**
 * Inside the embed iframe: tells embed.js how tall the content is so the
 * iframe can grow to fit (no inner scrollbar). The parent checks the origin.
 */
export function EmbedResizer() {
  useEffect(() => {
    if (window.parent === window) return;
    const post = () =>
      window.parent.postMessage(
        {
          type: "radius-roadmap:height",
          height: document.documentElement.scrollHeight,
        },
        "*",
      );
    const observer = new ResizeObserver(post);
    observer.observe(document.body);
    post();
    return () => observer.disconnect();
  }, []);
  return null;
}
