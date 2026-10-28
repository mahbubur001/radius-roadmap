import type { Metadata } from "next";
import { Suspense } from "react";
import { Forbidden } from "@/components/dashboard/forbidden";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { ImageUpload } from "@/components/form/image-upload";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db/client";
import { seesAllWorkspaces } from "@/server/services/context";
import { getWorkspaceBySlug } from "@/server/services/workspaces";
import { requireWorkspace } from "@/server/session";
import { fileUrl } from "@/server/storage";
import { DeleteWorkspace, WorkspaceSettingsForm } from "./workspace-form";

export const metadata: Metadata = { title: "Workspace settings" };

export default function WorkspaceSettingsPage({
  params,
}: PageProps<"/dashboard/[workspace]/settings/workspace">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <WorkspaceSettings slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

async function WorkspaceSettings({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  if (!seesAllWorkspaces(ctx)) return <Forbidden what="workspace settings" />;
  const ws = await getWorkspaceBySlug(db, ctx, ctx.workspaceSlug);

  return (
    <>
      <SettingsSection
        title="Logo"
        description="Shown in the dashboard and on public pages."
      >
        <ImageUpload
          purpose="workspace-logo"
          workspaceId={ws.id}
          name={ws.name}
          url={fileUrl(ws.logo)}
          rounded="md"
        />
      </SettingsSection>
      <WorkspaceSettingsForm
        workspace={{
          id: ws.id,
          name: ws.name,
          slug: ws.slug,
          settings: {
            requireVoterLogin: ws.settings.requireVoterLogin ?? false,
            darkModeDefault: ws.settings.darkModeDefault ?? false,
            indexPublicPages: ws.settings.indexPublicPages ?? true,
          },
        }}
      />
      <SettingsSection
        title="Delete workspace"
        description="Deletes this workspace and everything in it. This can't be undone."
      >
        <div>
          <DeleteWorkspace id={ws.id} name={ws.name} />
        </div>
      </SettingsSection>
    </>
  );
}
