import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";
import { notFound, publicRequest } from "@/server/public-request";
import { hit } from "@/server/rate-limit";
import { similarPublicIdeas } from "@/server/services/public-ideas";
import { getPublicWorkspaceById } from "@/server/services/public-site";

const querySchema = z.object({
  workspaceId: z.uuid(),
  q: z.string().trim().min(1).max(120),
});

/** Look-alike ideas while a visitor types a title (doc 31 M5). */
export async function GET(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return req.respond({ items: [] });

  const ws = await getPublicWorkspaceById(db, req.ctx, parsed.data.workspaceId);
  if (!ws?.modules.ideas) return notFound();

  const allowed = await hit([
    {
      key: `similar:ip:m:${req.ipHash ?? req.visitorId}`,
      max: 60,
      windowSeconds: 60,
    },
  ]);
  if (!allowed) return req.respond({ items: [] }, { status: 429 });

  const items = await similarPublicIdeas(db, req.ctx, ws.id, parsed.data.q);
  return req.respond({ items });
}
