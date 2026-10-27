import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LAST_WORKSPACE_COOKIE } from "@/lib/schemas/workspace";
import { db } from "@/server/db/client";
import { listWorkspaces } from "@/server/services/workspaces";
import { requireAccount } from "@/server/session";

// Entry point: back to the last-used workspace, else the first one the user
// can open. Members with no workspace access yet get an explanation page.
export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeRedirect />
    </Suspense>
  );
}

async function HomeRedirect() {
  const ctx = await requireAccount();
  const workspaces = await listWorkspaces(db, ctx);
  const last = (await cookies()).get(LAST_WORKSPACE_COOKIE)?.value;
  const target = workspaces.find((w) => w.slug === last) ?? workspaces[0];
  if (target) redirect(`/${target.slug}`);
  redirect(ctx.role === "member" ? "/no-access" : "/onboarding");
  return null;
}
