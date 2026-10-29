import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { seesAllWorkspaces } from "@/server/services/context";
import {
  listSubscribers,
  SUBSCRIBER_STATUSES,
  subscriberCounts,
} from "@/server/services/subscribers";
import { requireWorkspace } from "@/server/session";
import { SubscribersView } from "./subscribers-view";

export const metadata: Metadata = { title: "Subscribers" };

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default function SubscribersPage({
  params,
  searchParams,
}: PageProps<"/dashboard/[workspace]/updates/subscribers">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Subscribers
        slug={params.then((p) => p.workspace)}
        query={searchParams}
      />
    </Suspense>
  );
}

async function Subscribers({
  slug,
  query,
}: {
  slug: Promise<string>;
  query: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireWorkspace(await slug);
  const q = await query;
  const statusParam = one(q.status);
  const status = SUBSCRIBER_STATUSES.find((s) => s === statusParam);
  const search = one(q.q)?.slice(0, 100) || undefined;
  const [rows, counts] = await Promise.all([
    listSubscribers(db, ctx, { q: search, status }),
    subscriberCounts(db, ctx),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/dashboard/${ctx.workspaceSlug}/updates`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to updates
      </Link>
      <SubscribersView
        workspace={ctx.workspaceSlug}
        canManage={seesAllWorkspaces(ctx)}
        rows={rows}
        counts={counts}
        status={status ?? ""}
        query={search ?? ""}
      />
    </div>
  );
}
