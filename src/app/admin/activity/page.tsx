import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { listAudit } from "@/server/services/platform/audit";
import { AuditList } from "../audit-list";
import { PageHeader, Panel } from "../ui";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Activity />
    </Suspense>
  );
}

async function Activity() {
  await requirePlatformAdmin();
  const rows = await listAudit(db, { limit: 200 });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Monitor"
        title="Activity"
        description="Everything platform admins changed, newest first. This log can't be edited."
      />
      <Panel>
        <AuditList rows={rows} showAccount />
      </Panel>
    </div>
  );
}
