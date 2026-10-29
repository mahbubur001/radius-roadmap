import type { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { db } from "@/server/db/client";
import { verifyLink } from "@/server/internal-signature";
import { publicRequest } from "@/server/public-request";
import { followedIdea, setIdeaFollow } from "@/server/services/comments";
import { suppress } from "@/server/services/subscribers";
import { escapeHtml, simplePage } from "@/server/simple-page";

// "Stop following this idea" links in follow emails (doc 23 step 6). Same
// rules as unsubscribe links: GET only shows a page (mail scanners open
// links), POST acts, including RFC 8058 one-click.

function linkOf(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const u = z.uuid().safeParse(p.get("u"));
  const f = z.uuid().safeParse(p.get("f"));
  const sig = p.get("sig") ?? "";
  if (!u.success || !f.success || sig.length > 100) return null;
  return verifyLink(env.BETTER_AUTH_SECRET, `unfollow:${u.data}:${f.data}`, sig)
    ? { trackedUserId: u.data, feedbackId: f.data }
    : null;
}

const done = (title: string) =>
  simplePage(
    "Unfollowed",
    `<h1>You've stopped following “${escapeHtml(title)}”</h1><p>No more emails about this idea.</p>`,
  );

export async function GET(request: NextRequest) {
  const req = await publicRequest(request);
  const link = linkOf(request);
  if (!req || !link) {
    return simplePage("Link expired", "<h1>This link doesn't work</h1>", 404);
  }
  const idea = await followedIdea(
    db,
    req.ctx,
    link.trackedUserId,
    link.feedbackId,
  );
  if (!idea) {
    return simplePage(
      "Not following",
      "<h1>You're not following this idea</h1><p>You won't get emails about it.</p>",
    );
  }
  const action = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  return simplePage(
    "Stop following",
    `<h1>Stop following “${escapeHtml(idea.title)}”?</h1>
<form method="post" action="${escapeHtml(action)}">
<label><input type="checkbox" name="all" value="1"> Also stop every other email from ${escapeHtml(req.site.name)}</label>
<button type="submit">Stop following</button>
</form>`,
  );
}

export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  const link = linkOf(request);
  if (!req || !link) {
    return simplePage("Link expired", "<h1>This link doesn't work</h1>", 404);
  }
  const idea = await followedIdea(
    db,
    req.ctx,
    link.trackedUserId,
    link.feedbackId,
  );
  await setIdeaFollow(db, req.ctx, link.feedbackId, link.trackedUserId, false);
  const form = await request.formData().catch(() => null);
  if (form?.get("all") === "1" && idea?.email) {
    await suppress(db, req.ctx, idea.email, "unsubscribed_all");
  }
  return done(idea?.title ?? "this idea");
}
