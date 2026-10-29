import type { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { db } from "@/server/db/client";
import { verifyLink } from "@/server/internal-signature";
import { publicRequest } from "@/server/public-request";
import {
  subscriptionById,
  subscriptionForToken,
  unsubscribe,
} from "@/server/services/subscribers";
import { escapeHtml, simplePage } from "@/server/simple-page";

// Unsubscribe links in update emails (doc 23 steps 4–5).
// GET shows a page with a button: mail scanners open links, so a GET must
// never unsubscribe. POST unsubscribes: from that button, or "one-click"
// from the mail client itself (RFC 8058, List-Unsubscribe-Post).
// Links carry either the subscriber's token (`token`) or a signed id
// (`s` + `sig`, used in every post email so old emails keep working).

type Link = { token: string } | { id: string };

function linkOf(request: NextRequest): Link | null {
  const params = request.nextUrl.searchParams;
  const token = params.get("token") ?? "";
  if (token.length >= 20 && token.length <= 100) return { token };
  const id = z.uuid().safeParse(params.get("s"));
  const sig = params.get("sig") ?? "";
  if (
    id.success &&
    sig.length < 100 &&
    verifyLink(env.BETTER_AUTH_SECRET, `unsub:${id.data}`, sig)
  ) {
    return { id: id.data };
  }
  return null;
}

const expired = () =>
  simplePage(
    "Link expired",
    "<h1>This link doesn't work any more</h1><p>You may already be unsubscribed.</p>",
    404,
  );

export async function GET(request: NextRequest) {
  const req = await publicRequest(request);
  const link = linkOf(request);
  const sub =
    req && link
      ? "token" in link
        ? await subscriptionForToken(db, req.ctx, link.token)
        : await subscriptionById(db, req.ctx, link.id)
      : null;
  if (!req || !sub) return expired();
  if (sub.status === "unsubscribed") {
    return simplePage(
      "Unsubscribed",
      `<h1>You're unsubscribed</h1><p>${escapeHtml(sub.email)} no longer gets ${escapeHtml(sub.workspaceName)} updates.</p>`,
    );
  }
  // Post back to the same URL (same link parameters).
  const action = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  return simplePage(
    "Unsubscribe",
    `<h1>Unsubscribe from ${escapeHtml(sub.workspaceName)} updates?</h1>
<p>${escapeHtml(sub.email)} will stop getting update emails.</p>
<form method="post" action="${escapeHtml(action)}">
<label><input type="checkbox" name="all" value="1"> Also stop every other email from ${escapeHtml(req.site.name)}</label>
<button type="submit">Unsubscribe</button>
</form>`,
  );
}

export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  const link = linkOf(request);
  if (!req || !link) return expired();
  const form = await request.formData().catch(() => null);
  // One-click from the mail client posts "List-Unsubscribe=One-Click".
  const everything = form?.get("all") === "1";
  const sub = await unsubscribe(db, req.ctx, link, everything);
  if (!sub) return expired();
  return simplePage(
    "Unsubscribed",
    `<h1>You're unsubscribed</h1><p>${escapeHtml(sub.email)} no longer gets ${escapeHtml(sub.workspaceName)} updates${everything ? `, or any other email from ${escapeHtml(req.site.name)}` : ""}.</p>`,
  );
}
