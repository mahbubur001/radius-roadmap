"use client";

import { Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useSidebarCollapsed } from "./sidebar";

/** Light / dark switch (the dashboard follows the system until changed). */
export function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      className="grid size-8 place-items-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </button>
  );
}

/** What the plan includes, in one line (doc 29: Free = everything but three). */
export function PlanNote({
  pro,
  billingHref,
}: {
  pro: boolean;
  billingHref: string | null;
}) {
  const collapsed = useSidebarCollapsed();
  if (collapsed) return null;
  return (
    <div className="mb-2 rounded-xl bg-background/45 px-3 py-2.5 text-xs leading-snug shadow-[inset_0_0_0_1px_var(--sidebar-border)]">
      {pro ? (
        <>
          <b className="font-semibold text-sidebar-accent-foreground">Pro</b> ·
          your own domain, uploads, no “Powered by”.
        </>
      ) : (
        <>
          <b className="font-semibold text-sidebar-accent-foreground">Free</b> ·
          every feature included. Pro adds your own domain and uploads.
          {billingHref ? (
            <>
              {" "}
              <Link
                href={billingHref}
                className="text-sidebar-accent-foreground underline decoration-sidebar-border underline-offset-2"
              >
                See Pro
              </Link>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
