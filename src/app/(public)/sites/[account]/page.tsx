import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { loadSite, loadWorkspaces } from "./data";

export const metadata: Metadata = { title: { absolute: "Roadmaps" } };

/** Account root: straight to the only workspace, or a list of them. */
export default function PublicSiteHome({
  params,
}: PageProps<"/sites/[account]">) {
  return (
    <Suspense fallback={null}>
      <Home account={params.then((p) => decodeURIComponent(p.account))} />
    </Suspense>
  );
}

async function Home({ account }: { account: Promise<string> }) {
  const site = await loadSite(await account);
  if (!site) notFound();
  const workspaces = await loadWorkspaces(site.accountId);
  const [only] = workspaces;
  if (workspaces.length === 1 && only)
    redirect(`/${site.slug}/${only.slug}/roadmap`);
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">{site.name}</h1>
      {workspaces.length ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {workspaces.map((w) => (
            <li key={w.id}>
              <Link
                href={`/${site.slug}/${w.slug}/roadmap`}
                className="block px-4 py-3 hover:bg-muted"
              >
                {w.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Nothing has been published yet.</p>
      )}
    </main>
  );
}
