import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeNext } from "@/lib/safe-next";
import { startCodeSchema } from "@/lib/schemas/voting";
import { db } from "@/server/db/client";
import { notFound, publicRequest, siteOrigin } from "@/server/public-request";
import { enqueueEmail } from "@/server/queue/email";
import { hit, VOTE_LIMITS } from "@/server/rate-limit";
import { startEmailCode } from "@/server/services/voter-auth";

const schema = startCodeSchema.extend({ next: z.string().max(500).optional() });

/** Emails a 6-digit code and a one-click link to sign in as a voter. */
export async function POST(request: NextRequest) {
  const req = await publicRequest(request);
  if (!req) return notFound();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return req.respond({ error: "Enter a valid email." }, { status: 400 });
  }
  const { email } = parsed.data;
  const allowed = await hit([
    {
      key: `code:ip:${req.ipHash ?? req.visitorId}`,
      max: VOTE_LIMITS.codesPerIpHour,
      windowSeconds: 3600,
    },
    {
      key: `code:email:${req.ctx.accountId}:${email}`,
      max: VOTE_LIMITS.codesPerEmailHour,
      windowSeconds: 3600,
    },
  ]);
  if (!allowed) {
    return req.respond(
      { error: "Too many codes requested. Try again later." },
      { status: 429 },
    );
  }

  const { code, token } = await startEmailCode(db, req.ctx, email);
  const link = new URL("/api/public/auth/link", siteOrigin(request));
  link.searchParams.set("token", token);
  link.searchParams.set("next", safeNext(parsed.data.next, "/"));
  await enqueueEmail({
    template: "voter-code",
    to: email,
    props: { siteName: req.site.name, code, url: link.toString() },
  });
  return req.respond({ ok: true });
}
