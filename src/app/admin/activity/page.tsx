import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { listAudit } from "@/server/services/platform/audit";
import { AuditList } from "../audit-list";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Activity />
    </Suspense>
  );
}

async function Activity() {
  await requirePlatformAdmin();
  const rows = await listAudit(db, { limit: 200 });
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
      <p className="text-sm text-muted-foreground">
        Every platform admin action, newest first (last 200).
      </p>
      <AuditList rows={rows} showAccount />
    </div>
  );
}
