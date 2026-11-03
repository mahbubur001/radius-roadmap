import Link from "next/link";
import type { ReactNode } from "react";
import { EmbedResizer } from "@/components/public/embed-resizer";
import { PublicDock } from "@/components/public/public-dock";
import { SiteBrand } from "@/components/public/site-brand";
import { VoterMenu } from "@/components/public/voter-menu";
import { VoterProvider } from "@/components/public/voter-provider";
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

/** Transit's tab order (doc 32): Roadmap, Ideas, Updates, Help (Articles). */
const MODULES: { key: SiteModule; label: string }[] = [
  { key: "roadmap", label: "Roadmap" },
  { key: "ideas", label: "Ideas" },
  { key: "updates", label: "Updates" },
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
  const modules = MODULES.filter((m) => workspace.modules[m.key]).map((m) => ({
    key: m.key,
    label: workspace.settings[`${m.key}Label`] || m.label,
    href: `${prefix}${wsPath(workspace)}/${m.key}`,
  }));
  const ideasHref = modules.find((m) => m.key === "ideas")?.href ?? null;
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
          <header className="sticky top-0 z-30 border-b bg-paper/88 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-[18px] md:h-16 md:gap-7 md:px-7">
              <Link
                href={`${prefix}${wsPath(workspace)}/${home}`}
                className="flex min-w-0 items-center gap-2.5 font-t-display text-lg font-bold tracking-[-0.02em]"
              >
                {workspace.settings.showLogo !== false ? (
                  logoUrl ? (
                    // biome-ignore lint/performance/noImgElement: tenant uploads on any host
                    <img
                      src={logoUrl}
                      alt=""
                      className="size-[30px] shrink-0 rounded-[9px] object-cover"
                    />
                  ) : (
                    <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-foreground text-[15px] text-background">
                      {initials(workspace.name).slice(0, 1)}
                    </span>
                  )
                ) : null}
                <span className="truncate">{workspace.name}</span>
              </Link>
              <nav
                aria-label="Site"
                className="hidden items-center gap-0.5 md:flex"
              >
                {modules.map((m) => (
                  <Link
                    key={m.key}
                    href={m.href}
                    aria-current={m.key === active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center rounded-full px-3.5 font-medium",
                      m.key === active
                        ? "bg-sheet text-foreground ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m.label}
                  </Link>
                ))}
              </nav>
              <span className="flex-1" />
              <VoterMenu />
            </div>
          </header>
        )}
        <main
          className={cn(
            "mx-auto w-full max-w-[1240px] flex-1 px-[18px] md:px-7",
            embed && "py-3",
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
          <footer className="px-4 pt-6 pb-[120px] text-center font-t-mono text-[11px] font-semibold tracking-[0.12em] text-ink3 uppercase">
            Powered by Radius Roadmap
          </footer>
        ) : (
          <div className="h-24 md:hidden" />
        )}
        {embed ? null : (
          <PublicDock
            items={modules.map((m) => ({
              key: m.key,
              label: m.label,
              href: m.href,
              active: m.key === active,
            }))}
            shareHref={
              ideasHref
                ? `${ideasHref}${ideasHref.includes("?") ? "&" : "?"}share=1`
                : null
            }
          />
        )}
      </div>
    </VoterProvider>
  );
}
