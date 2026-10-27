import { redirect } from "next/navigation";
import { Suspense } from "react";

// /<workspace>/settings → the workspace tab.
export default function SettingsIndex({
  params,
}: PageProps<"/[workspace]/settings">) {
  return (
    <Suspense fallback={null}>
      <Redirect slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function Redirect({ slug }: { slug: Promise<string> }) {
  redirect(`/${await slug}/settings/workspace`);
  return null;
}
