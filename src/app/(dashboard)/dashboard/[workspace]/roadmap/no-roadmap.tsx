"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createRoadmapAction } from "@/app/(dashboard)/_actions/roadmap";
import { Button } from "@/components/ui/button";

export function NoRoadmap({
  workspace,
  canManage,
}: {
  workspace: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const result = await createRoadmapAction({ workspace, title: "Roadmap" });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    router.push(`/dashboard/${workspace}/roadmap?r=${result.data.slug}`);
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <h2 className="text-xl font-semibold">No roadmap yet</h2>
      <p className="text-sm text-muted-foreground">
        {canManage
          ? "Create a roadmap with the default columns (In progress, Up next, Future, Done)."
          : "Ask an admin to create a roadmap for this workspace."}
      </p>
      {canManage ? (
        <Button onClick={create} disabled={busy}>
          {busy ? "Creating…" : "Create roadmap"}
        </Button>
      ) : null}
    </div>
  );
}
