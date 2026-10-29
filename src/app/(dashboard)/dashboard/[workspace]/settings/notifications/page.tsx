import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { getMyPrefs } from "@/server/services/notifications";
import { requireWorkspace } from "@/server/session";
import { NotificationsForm } from "./notifications-form";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage({
  params,
}: PageProps<"/dashboard/[workspace]/settings/notifications">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Notifications slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function Notifications({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  const prefs = await getMyPrefs(db, ctx);
  return <NotificationsForm workspace={ctx.workspaceSlug} defaults={prefs} />;
}
