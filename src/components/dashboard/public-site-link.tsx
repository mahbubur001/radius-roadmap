"use client";

import { Globe } from "lucide-react";
import { useSidebarCollapsed } from "./sidebar";

/** The live public address under the workspace name. */
export function PublicSiteLink({ url }: { url: string }) {
  const collapsed = useSidebarCollapsed();
  if (collapsed) return <div className="h-2" />;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title="Opens your public site in a new tab"
      className="mb-2.5 flex w-full items-center gap-1.5 truncate px-2 font-mono text-[11.5px] text-faint hover:text-sidebar-accent-foreground"
    >
      <Globe className="size-3 shrink-0" />
      <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
    </a>
  );
}
