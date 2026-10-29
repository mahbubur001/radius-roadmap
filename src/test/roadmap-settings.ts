import {
  defaultDisplay,
  defaultInternalDisplay,
  type RoadmapSettingsInput,
} from "@/lib/schemas/roadmap";
import type { Db } from "@/server/db/client";
import type { WorkspaceContext } from "@/server/services/context";
import { getRoadmap, listColumns } from "@/server/services/roadmaps";

/** The Edit roadmap form as it would load for `roadmapId`. */
export async function currentSettings(
  db: Db,
  ctx: WorkspaceContext,
  roadmapId: string,
): Promise<RoadmapSettingsInput> {
  const roadmap = await getRoadmap(db, ctx, roadmapId);
  const columns = await listColumns(db, ctx, roadmapId);
  return {
    id: roadmap.id,
    internalTitle: roadmap.internalTitle,
    publicTitle: roadmap.publicTitle,
    internalSummaryJson: roadmap.internalSummaryJson,
    publicSummaryJson: roadmap.publicSummaryJson,
    isPublic: roadmap.isPublic,
    notifyOnComplete: roadmap.notifyOnComplete,
    display: { ...defaultDisplay, ...roadmap.display },
    internalDisplay: { ...defaultInternalDisplay, ...roadmap.internalDisplay },
    columns: columns.map(({ id, name, isPublic, isDone }) => ({
      id,
      name,
      isPublic,
      isDone,
    })),
  };
}
