import { Suspense } from "react";

// Custom-domain public site (rewritten here by src/proxy.ts). Phase 2/6.
export default function PublicSitePage({
  params,
}: PageProps<"/sites/[host]/[[...path]]">) {
  return (
    <main className="mx-auto max-w-3xl p-10">
      <Suspense fallback={null}>
        <Host params={params} />
      </Suspense>
    </main>
  );
}

async function Host({
  params,
}: {
  params: PageProps<"/sites/[host]/[[...path]]">["params"];
}) {
  const { host } = await params;
  return (
    <p className="text-sm text-muted-foreground">
      Public site for <strong>{decodeURIComponent(host)}</strong> is coming in
      Phase 2.
    </p>
  );
}
