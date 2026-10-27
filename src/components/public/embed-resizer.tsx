"use client";

import { useEffect } from "react";

/**
 * Inside the embed iframe: tells embed.js how tall the content is so the
 * iframe can grow to fit (no inner scrollbar). The parent checks the origin.
 */
export function EmbedResizer() {
  useEffect(() => {
    if (window.parent === window) return;
    // Measure the site shell, not the document: the document is never
    // shorter than the iframe itself, so the frame could only ever grow.
    const root = document.querySelector("[data-embed-root]");
    if (!root) return;
    const post = () =>
      window.parent.postMessage(
        {
          type: "radius-roadmap:height",
          height: Math.ceil(root.getBoundingClientRect().height),
        },
        "*",
      );
    const observer = new ResizeObserver(post);
    observer.observe(root);
    post();
    return () => observer.disconnect();
  }, []);
  return null;
}
