import Link from "next/link";
import type { ReactNode } from "react";
import { EmbedResizer } from "@/components/public/embed-resizer";
import { VoterMenu } from "@/components/public/voter-menu";
import { VoterProvider } from "@/components/public/voter-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

/**
 * Chrome around every public page of a workspace. In embed mode (inside the
 * customer's iframe) the header and footer are dropped and the height is
 * reported to embed.js.
 */
export type SiteModule = "roadmap" | "updates" | "ideas";

/** LoopedIn's tab order: Roadmap, Updates, Ideas (Articles in Phase 5). */
const MODULES: { key: SiteModule; label: string }[] = [
  { key: "roadmap", label: "Roadmap" },
  { key: "updates", label: "Updates" },
  { key: "ideas", label: "Ideas" },
];

export function SiteShell({
  account,
  workspace,
  active,
  embed,
  children,
}: {
  /** Account slug: the first path segment of the site. */
  account: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    settings: { darkModeDefault?: boolean };
    /** Modules switched on and with something public (doc 22 P2). */
    modules: Record<SiteModule, boolean>;
  };
  /** The module this page belongs to (its tab is highlighted). */
  active: SiteModule;
  embed: boolean;
  children: ReactNode;
}) {
  const home = MODULES.find((m) => workspace.modules[m.key])?.key ?? active;
  return (
    <VoterProvider site={account} workspaceId={workspace.id} embed={embed}>
      <div
        data-embed-root={embed ? "" : undefined}
        className={cn(
          "flex flex-col bg-background text-foreground",
          // In an iframe the height follows the content (see embed.js).
          !embed && "min-h-svh",
          workspace.settings.darkModeDefault && "dark",
        )}
      >
        {embed ? (
          <>
            <EmbedResizer />
            <div className="flex justify-end px-4 pt-3">
              <VoterMenu />
            </div>
          </>
        ) : (
          <header className="border-b">
            <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
              <Link
                href={`/${account}/${workspace.slug}/${home}`}
                className="flex items-center gap-2 font-semibold"
              >
                <Avatar className="size-7 rounded-md">
                  {workspace.logoUrl ? (
                    <AvatarImage src={workspace.logoUrl} alt="" />
                  ) : null}
                  <AvatarFallback className="rounded-md text-xs">
                    {initials(workspace.name)}
                  </AvatarFallback>
                </Avatar>
                {workspace.name}
              </Link>
              <nav
                aria-label="Site"
                className="flex items-center gap-1 text-sm font-medium"
              >
                {MODULES.filter((m) => workspace.modules[m.key]).map((m) => (
                  <Link
                    key={m.key}
                    href={`/${account}/${workspace.slug}/${m.key}`}
                    aria-current={m.key === active ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-1.5 hover:bg-muted",
                      m.key === active ? "bg-muted" : "text-muted-foreground",
                    )}
                  >
                    {m.label}
                  </Link>
                ))}
              </nav>
              <div className="ml-auto">
                <VoterMenu />
              </div>
            </div>
          </header>
        )}
        <main
          className={cn(
            "mx-auto w-full max-w-7xl flex-1 px-4",
            embed ? "py-3" : "py-8",
          )}
        >
          {children}
        </main>
        <footer className="py-4 text-center text-xs text-muted-foreground">
          Powered by Radius Roadmap
        </footer>
      </div>
    </VoterProvider>
  );
}
