import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/server/db/client";
import { listWorkspaces } from "@/server/services/workspaces";
import { requireAccount } from "@/server/session";

// Entry point: send the user to their first workspace (or sign-in/onboarding).
export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeRedirect />
    </Suspense>
  );
}

async function HomeRedirect() {
  const ctx = await requireAccount();
  const [first] = await listWorkspaces(db, ctx);
  redirect(first ? `/${first.slug}` : "/onboarding");
  return null;
}
