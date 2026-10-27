import type { Db } from "@/server/db/client";

export type PlanLimits = { workspaces: number; teammates: number };

/**
 * Per-account plan limits. Unlimited until billing ships in Phase 6; callers
 * already enforce whatever this returns.
 */
export async function getPlanLimits(
  _db: Db,
  _accountId: string,
): Promise<PlanLimits> {
  return { workspaces: Infinity, teammates: Infinity };
}
