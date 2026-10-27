import { redirect } from "next/navigation";
import { Suspense } from "react";

/** /<workspace> → its roadmap (the only public module so far). */
export default function PublicWorkspacePage({
  params,
}: PageProps<"/sites/[host]/[workspace]">) {
  return (
    <Suspense fallback={null}>
      <Redirect workspace={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function Redirect({ workspace }: { workspace: Promise<string> }) {
  redirect(`/${await workspace}/roadmap`);
  return null;
}
