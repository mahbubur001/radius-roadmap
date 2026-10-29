import type { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { publicRequest } from "@/server/public-request";
import {
  subscriptionForToken,
  unsubscribe,
} from "@/server/services/subscribers";
import { escapeHtml, simplePage } from "@/server/simple-page";

// Unsubscribe links in update emails (doc 23 step 4).
// GET shows a page with a button: mail scanners open links, so a GET must
// never unsubscribe. POST unsubscribes: from that button, or "one-click"
// from the mail client itself (RFC 8058, List-Unsubscribe-Post).

function tokenOf(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  return token.length >= 20 && token.length <= 100 ? token : null;
}

const expired = () =>
  simplePage(
    "Link expired",
    "<h1>This link doesn't work any more</h1><p>You may already be unsubscribed.</p>",
    404,
  );

export async function GET(request: NextRequest) {
  const req = await publicRequest(request);
  const token = tokenOf(request);
  const sub =
    req && token ? await subscriptionForToken(db, req.ctx, token) : null;
  if (!req || !token || !sub) return expired();
  const action = `/api/public/unsubscribe?site=${encodeURIComponent(req.site.slug)}&token=${encodeURIComponent(token)}`;
  if (sub.status === "unsubscribed") {
    return simplePage(
      "Unsubscribed",
      `<h1>You're unsubscribed</h1><p>${escapeHtml(sub.email)} no longer gets ${escapeHtml(sub.workspaceName)} updates.</p>`,
    );
  }
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
  const token = tokenOf(request);
  if (!req || !token) return expired();
  const form = await request.formData().catch(() => null);
  // One-click from the mail client posts "List-Unsubscribe=One-Click".
  const everything = form?.get("all") === "1";
  const sub = await unsubscribe(db, req.ctx, token, everything);
  if (!sub) return expired();
  return simplePage(
    "Unsubscribed",
    `<h1>You're unsubscribed</h1><p>${escapeHtml(sub.email)} no longer gets ${escapeHtml(sub.workspaceName)} updates${everything ? `, or any other email from ${escapeHtml(req.site.name)}` : ""}.</p>`,
  );
}
