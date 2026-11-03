import Link from "next/link";
import type { ReactNode } from "react";
import { EmbedResizer } from "@/components/public/embed-resizer";
import { SiteBrand } from "@/components/public/site-brand";
import { VoterMenu } from "@/components/public/voter-menu";
import { VoterProvider } from "@/components/public/voter-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/initials";
import { wsPath } from "@/lib/public-path";
import { siteTheme } from "@/lib/schemas/workspace";
import { cn } from "@/lib/utils";
import type { WorkspaceSettings } from "@/server/db/schema";
import { loadSite, sitePrefix } from "./data";

/**
 * Chrome around every public page of a workspace. In embed mode (inside the
 * customer's iframe) the header is dropped and the height is reported to
 * embed.js. The account's branding (doc 26 6C) applies in both.
 */
export type SiteModule = "roadmap" | "updates" | "ideas" | "articles";

/** LoopedIn's tab order: Roadmap, Updates, Ideas, Articles. */
const MODULES: { key: SiteModule; label: string }[] = [
  { key: "roadmap", label: "Roadmap" },
  { key: "updates", label: "Updates" },
  { key: "ideas", label: "Ideas" },
  { key: "articles", label: "Articles" },
];

export async function SiteShell({
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
    /** The account's default workspace: no slug in its URLs. */
    isDefault: boolean;
    logoUrl: string | null;
    settings: Pick<
      WorkspaceSettings,
      | "theme"
      | "darkModeDefault"
      | "showLogo"
      | "roadmapLabel"
      | "updatesLabel"
      | "ideasLabel"
      | "articlesLabel"
    >;
    /** Modules switched on and with something public (doc 22 P2). */
    modules: Record<SiteModule, boolean>;
    /** Plan features (doc 26 P7). */
    features: { embed: boolean; logo: boolean };
  };
  /** The module this page belongs to (its tab is highlighted). */
  active: SiteModule;
  embed: boolean;
  children: ReactNode;
}) {
  const home = MODULES.find((m) => workspace.modules[m.key])?.key ?? active;
  const [site, prefix] = await Promise.all([
    loadSite(account),
    sitePrefix(account),
  ]);
  const brand = site?.brand;
  // Workspace logo, else the account's (both need the plan's logo feature).
  const logoUrl = workspace.features.logo
    ? (workspace.logoUrl ?? site?.logoUrl ?? null)
    : null;
  return (
    <VoterProvider site={account} workspaceId={workspace.id} embed={embed}>
      <div
        data-embed-root={embed ? "" : undefined}
        data-site-theme={siteTheme(workspace.settings)}
        className={cn(
          "flex flex-col bg-background text-foreground",
          // In an iframe the height follows the content (see embed.js).
          !embed && "min-h-svh",
        )}
      >
        {brand ? <SiteBrand brand={brand} /> : null}
        {embed ? (
          <>
            <EmbedResizer />
            <div className="flex justify-end px-4 pt-3">
              <VoterMenu />
            </div>
          </>
        ) : (
          <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            {/* Phones: logo + sign-in on one row, tabs scrolling underneath
                (doc 31 M1). From sm up: one row, as before. */}
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 px-4 sm:h-16 sm:flex-nowrap">
              <Link
                href={`${prefix}${wsPath(workspace)}/${home}`}
                className="flex h-13 min-w-0 items-center gap-2 font-semibold sm:h-auto"
              >
                {workspace.settings.showLogo !== false ? (
                  <Avatar className="size-7 shrink-0 rounded-md">
                    {logoUrl ? <AvatarImage src={logoUrl} alt="" /> : null}
                    <AvatarFallback className="rounded-md text-xs">
                      {initials(workspace.name)}
                    </AvatarFallback>
                  </Avatar>
                ) : null}
                <span className="truncate">{workspace.name}</span>
              </Link>
              <nav
                aria-label="Site"
                className="order-last -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-2 text-sm font-medium [scrollbar-width:none] sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
              >
                {MODULES.filter((m) => workspace.modules[m.key]).map((m) => (
                  <Link
                    key={m.key}
                    href={`${prefix}${wsPath(workspace)}/${m.key}`}
                    aria-current={m.key === active ? "page" : undefined}
                    className={cn(
                      "relative shrink-0 rounded-md px-3 py-2.5 sm:py-1.5 sm:hover:bg-muted",
                      m.key === active
                        ? "text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary sm:bg-muted sm:after:hidden"
                        : "text-muted-foreground",
                    )}
                  >
                    {workspace.settings[`${m.key}Label`] || m.label}
                  </Link>
                ))}
              </nav>
              <div className="ml-auto shrink-0">
                <VoterMenu />
              </div>
            </div>
          </header>
        )}
        <main
          className={cn(
            "mx-auto w-full max-w-7xl flex-1 px-4",
            embed ? "py-3" : "py-5 sm:py-8",
          )}
        >
          {embed && !workspace.features.embed ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Embedding needs a paid plan.{" "}
              <a
                href={`${prefix}${wsPath(workspace)}/${active}`}
                target="_blank"
                rel="noopener"
                className="text-primary underline"
              >
                Open {workspace.name}
              </a>
            </p>
          ) : (
            children
          )}
        </main>
        {brand?.poweredBy !== false ? (
          <footer className="py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
            Powered by Radius Roadmap
          </footer>
        ) : null}
      </div>
    </VoterProvider>
  );
}
