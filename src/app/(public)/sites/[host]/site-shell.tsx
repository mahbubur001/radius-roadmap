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
export function SiteShell({
  workspace,
  embed,
  children,
}: {
  workspace: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    settings: { darkModeDefault?: boolean };
  };
  embed: boolean;
  children: ReactNode;
}) {
  return (
    <VoterProvider workspaceId={workspace.id} embed={embed}>
      <div
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
            <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
              <Link
                href={`/${workspace.slug}/roadmap`}
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
              <nav className="flex items-center gap-1 text-sm">
                <Link
                  href={`/${workspace.slug}/roadmap`}
                  className="rounded-md bg-muted px-3 py-1.5 font-medium"
                >
                  Roadmap
                </Link>
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
