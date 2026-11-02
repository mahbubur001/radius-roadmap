import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { db } from "@/server/db/client";
import { trackedUsers } from "@/server/db/schema";
import { verifyLink } from "@/server/internal-signature";
import { publicRequest } from "@/server/public-request";
import { suppress } from "@/server/services/subscribers";
import { escapeHtml, simplePage } from "@/server/simple-page";

// "Stop these emails" in the email voters get when something they voted for
// ships (doc 30 R4). Same rules as unfollow links: GET only shows a page
// (mail scanners open links), POST suppresses every email from the site.

function linkOf(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const u = z.uuid().safeParse(p.get("u"));
  const sig = p.get("sig") ?? "";
  if (!u.success || sig.length > 100) return null;
  return verifyLink(env.BETTER_AUTH_SECRET, `optout:${u.data}`, sig)
    ? u.data
    : null;
}

/** The voter's email, only within the site's account. */
async function emailOf(accountId: string, trackedUserId: string) {
  const [row] = await db
    .select({ email: trackedUsers.email })
    .from(trackedUsers)
    .where(
      and(
        eq(trackedUsers.id, trackedUserId),
        eq(trackedUsers.accountId, accountId),
      ),
    )
    .limit(1);
  return row?.email ?? null;
}

export async function GET(request: NextRequest) {
  const req = await publicRequest(request);
  const id = linkOf(request);
  if (!req || !id) {
    return simplePage("Link expired", "<h1>This link doesn't work</h1>", 404);
  }
  const action = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  return simplePage(
    "Stop emails",
    `<h1>Stop emails from ${escapeHtml(req.site.name)}?</h1>
<p>You won't hear when things you voted for ship, or get any other email from them.</p>
<form method="post" action="${escapeHtml(action)}">
<button type="submit">Stop emails</button>
</form>`,
  );
}

export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  const id = linkOf(request);
  if (!req || !id) {
    return simplePage("Link expired", "<h1>This link doesn't work</h1>", 404);
  }
  const email = await emailOf(req.ctx.accountId, id);
  if (email) await suppress(db, req.ctx, email, "unsubscribed_all");
  return simplePage(
    "Emails stopped",
    `<h1>Done</h1><p>${escapeHtml(req.site.name)} won't email you again.</p>`,
  );
}
