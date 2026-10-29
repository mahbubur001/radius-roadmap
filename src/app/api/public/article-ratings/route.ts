import type { NextRequest } from "next/server";
import { rateArticleSchema } from "@/lib/schemas/articles";
import { db } from "@/server/db/client";
import { invalidatePublic } from "@/server/public-cache";
import { notFound, publicRequest } from "@/server/public-request";
import { hit } from "@/server/rate-limit";
import { rateArticle } from "@/server/services/article-ratings";
import { trackEvent } from "@/server/services/events";
import { getRateableArticle } from "@/server/services/public-articles";

/** "Was this helpful?" on a public article (doc 25 A4). No sign-in needed. */
export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const parsed = rateArticleSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return req.respond({ error: "Invalid request." }, { status: 400 });
  }
  const article = await getRateableArticle(db, req.ctx, parsed.data.articleId);
  if (!article) return notFound();
  const allowed = await hit([
    {
      key: `article-rating:ip:${req.ipHash ?? req.visitorId}`,
      max: 60,
      windowSeconds: 3600,
    },
  ]);
  if (!allowed) {
    return req.respond(
      { error: "Too many ratings. Try again later." },
      { status: 429 },
    );
  }
  const result = await rateArticle(
    db,
    req.ctx,
    article.id,
    parsed.data.value,
    req.voter ? { trackedUserId: req.voter.id } : { visitorId: req.visitorId },
  );
  if (result.value) {
    await trackEvent(db, req.ctx, {
      workspaceId: article.workspaceId,
      type: "article_rating",
      subjectId: article.id,
      visitorId: req.visitorId,
      ...req.location,
      source: req.embed ? "embed" : "public",
    });
  }
  invalidatePublic(article.workspaceId);
  return req.respond({ ...result, visitor: req.visitorToken });
}
