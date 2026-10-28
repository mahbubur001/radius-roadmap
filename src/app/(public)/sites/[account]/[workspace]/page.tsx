import { redirect } from "next/navigation";
import { Suspense } from "react";

/** /<account>/<workspace> → its roadmap (the only public module so far). */
export default function PublicWorkspacePage({
  params,
}: PageProps<"/sites/[account]/[workspace]">) {
  return (
    <Suspense fallback={null}>
      <Redirect path={params.then((p) => `/${p.account}/${p.workspace}`)} />
    </Suspense>
  );
}

async function Redirect({ path }: { path: Promise<string> }) {
  redirect(`${await path}/roadmap`);
  return null;
}
