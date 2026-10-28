import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { seesAllWorkspaces } from "@/server/services/context";
import { listInvitations } from "@/server/services/invitations";
import { listMembers } from "@/server/services/team";
import { listWorkspaces } from "@/server/services/workspaces";
import { requireWorkspace } from "@/server/session";
import { fileUrl } from "@/server/storage";
import { TeamManager } from "./team-manager";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage({
  params,
}: PageProps<"/dashboard/[workspace]/settings/team">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Team slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function Team({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  const canManage = seesAllWorkspaces(ctx);
  const [members, invitations, workspaces] = await Promise.all([
    listMembers(db, ctx),
    canManage ? listInvitations(db, ctx) : Promise.resolve([]),
    listWorkspaces(db, ctx),
  ]);

  return (
    <TeamManager
      me={{ userId: ctx.userId, role: ctx.role }}
      members={members.map((m) => ({
        memberId: m.memberId,
        userId: m.userId,
        name: m.name,
        email: m.email,
        imageUrl: fileUrl(m.image),
        role: m.role,
        workspaceIds: m.workspaceIds,
      }))}
      invitations={invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        workspaceIds: i.workspaceIds,
        expired: i.expired,
      }))}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
    />
  );
}
