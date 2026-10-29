import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";
import { notFound, publicRequest } from "@/server/public-request";
import { hit } from "@/server/rate-limit";
import { trackEvent } from "@/server/services/events";
import { isSiteWorkspace } from "@/server/services/public-site";

const schema = z.object({
  workspaceId: z.uuid(),
  type: z.enum([
    "page_view",
    "card_view",
    "feedback_view",
    "update_view",
    "article_view",
  ]),
  subjectId: z.uuid().nullable().optional(),
});

/** Page-view beacon from the (cached) public pages. */
export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return req.respond({ ok: false }, { status: 400 });

  const ok = await hit([
    { key: `events:${req.visitorId}`, max: 120, windowSeconds: 3600 },
  ]);
  if (!ok) return req.respond({ ok: false }, { status: 429 });

  if (!(await isSiteWorkspace(db, req.ctx, parsed.data.workspaceId))) {
    return req.respond({ ok: false }, { status: 404 });
  }

  await trackEvent(db, req.ctx, {
    workspaceId: parsed.data.workspaceId,
    type: parsed.data.type,
    subjectId: parsed.data.subjectId ?? null,
    visitorId: req.visitorId,
    ...req.location,
    source: req.embed ? "embed" : "public",
  });
  return req.respond({ ok: true });
}
