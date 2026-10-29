import { z } from "zod";
import { env } from "@/lib/env";
import { verifyInternal } from "@/server/internal-signature";
import { invalidatePublic, invalidateSite } from "@/server/public-cache";

const schema = z.object({
  accountId: z.string().min(1).max(100),
  workspaceId: z.uuid(),
  ts: z.number().int(),
  signature: z.string().max(200),
});

/**
 * The worker asks the web app to drop a workspace's public cache (it can't
 * do it itself: the cache lives in this process). Signed, short-lived.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { accountId, workspaceId, ts, signature } = parsed.data;
  if (
    !verifyInternal(
      env.BETTER_AUTH_SECRET,
      `${accountId}:${workspaceId}`,
      ts,
      signature,
    )
  ) {
    return new Response("Forbidden", { status: 403 });
  }
  invalidatePublic(workspaceId);
  invalidateSite(accountId);
  return new Response(null, { status: 204 });
}
