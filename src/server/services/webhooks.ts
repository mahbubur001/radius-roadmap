import { createHmac, randomBytes } from "node:crypto";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
} from "drizzle-orm";
import { env } from "@/lib/env";
import {
  type WebhookEndpointInput,
  type WebhookEvent,
  webhookEndpointSchema,
} from "@/lib/schemas/webhooks";
import { serialize } from "@/server/api/serialize";
import type { Db } from "@/server/db/client";
import {
  comments,
  member,
  organization,
  updateSubscribers,
  user,
  webhookDeliveries,
  webhookEndpoints,
  workspaces,
} from "@/server/db/schema";
import { apiCards, apiFeedback, apiUpdates } from "./api-read";
import {
  type AccountContext,
  assertRole,
  ConflictError,
  NotFoundError,
} from "./context";
import { assertFeature, hasFeature } from "./plan-limits";
import { isSuspended } from "./platform/suspension";

// Outgoing webhooks (doc 27 A8–A11). Runs in the worker too (delivery):
// no server-only imports.

const MAX_ENDPOINTS = 10;
const KEEP_DELIVERIES = 100;
/** Only failures for this long switch an endpoint off (A10). */
const DISABLE_AFTER_MS = 3 * 24 * 3600 * 1000;
const TIMEOUT_MS = 10_000;

/**
 * In production a URL must be https and resolve to public addresses (A9).
 * Development and tests may post to a local receiver.
 */
export const webhookNetwork = {
  allowPrivate: () => env.NODE_ENV === "development",
};

// ── SSRF guard ──────────────────────────────────────────────────────────

function v4Private(ip: string) {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Loopback, private, link-local, metadata, multicast or reserved. */
export function isPrivateAddress(ip: string) {
  const kind = isIP(ip);
  if (kind === 4) return v4Private(ip);
  if (kind !== 6) return true;
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return v4Private(mapped[1]);
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") || // unique local
    /^fe[89ab]/.test(v6) || // link-local
    v6.startsWith("ff") || // multicast
    v6.startsWith("64:ff9b:") // NAT64 (could reach private v4)
  );
}

type Lookup = (
  hostname: string,
  options: { all: true },
  callback: (err: Error | null, addresses: LookupAddress[]) => void,
) => void;

/** Resolves `host`; fails if any address is private (unless allowed). */
export function resolvePublic(
  host: string,
  allowPrivate: boolean,
  lookup: Lookup = dnsLookup as unknown as Lookup,
): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) => {
    lookup(host, { all: true }, (err, addresses) => {
      if (err) return reject(new Error(`Can't resolve ${host}.`));
      if (!addresses.length) return reject(new Error(`Can't resolve ${host}.`));
      if (!allowPrivate && addresses.some((a) => isPrivateAddress(a.address))) {
        return reject(
          new Error("That URL points to a private network address."),
        );
      }
      resolve(addresses);
    });
  });
}

/** Checks a webhook URL before saving it (and again at every delivery). */
export async function assertPublicUrl(
  url: string,
  allowPrivate = webhookNetwork.allowPrivate(),
  lookup?: Lookup,
) {
  const u = new URL(url);
  if (u.protocol !== "https:" && !(allowPrivate && u.protocol === "http:")) {
    throw new ConflictError("Use an https:// URL.");
  }
  if (u.username || u.password) {
    throw new ConflictError("Don't put a username or password in the URL.");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (!allowPrivate && isPrivateAddress(host)) {
      throw new ConflictError("That URL points to a private network address.");
    }
    return;
  }
  await resolvePublic(host, allowPrivate, lookup).catch((e: Error) => {
    throw new ConflictError(e.message);
  });
}

// ── Signing and sending ─────────────────────────────────────────────────

export const SIGNATURE_HEADER = "X-RadiusRoadmap-Signature";

/** `t=<unix>,v1=<hex HMAC-SHA256 of "t.body">` (Stripe style, A9). */
export function signPayload(secret: string, body: string, t: number) {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

export type PostResult = {
  status: number | null;
  snippet: string;
  durationMs: number;
};

/**
 * POST JSON without following redirects. The connection's DNS lookup goes
 * through `resolvePublic`, so a name can't switch to a private address
 * between the check and the request (DNS rebinding).
 */
export function postJson(
  url: string,
  body: string,
  headers: Record<string, string>,
  allowPrivate = webhookNetwork.allowPrivate(),
): Promise<PostResult> {
  const started = Date.now();
  const u = new URL(url);
  const client = u.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    const done = (status: number | null, snippet: string) =>
      resolve({
        status,
        snippet: snippet.slice(0, 1024),
        durationMs: Date.now() - started,
      });
    // IP literals skip the lookup below, so check them here.
    const literal = u.hostname.replace(/^\[|\]$/g, "");
    if (isIP(literal) && !allowPrivate && isPrivateAddress(literal)) {
      return done(null, "That URL points to a private network address.");
    }
    const req = client.request(
      u,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "RadiusRoadmap-Webhooks/1.0",
          "content-length": Buffer.byteLength(body),
          ...headers,
        },
        timeout: TIMEOUT_MS,
        // A fresh connection each time: a pooled socket would skip the
        // address check in `lookup`.
        agent: false,
        // Node may ask for every address (`all`, happy eyeballs) or one.
        lookup: ((
          hostname: string,
          options: { all?: boolean },
          callback: (
            err: Error | null,
            address: string | LookupAddress[],
            family?: number,
          ) => void,
        ) => {
          resolvePublic(hostname, allowPrivate)
            .then((addresses) => {
              if (options?.all) return callback(null, addresses);
              const first = addresses[0] as LookupAddress;
              callback(null, first.address, first.family);
            })
            .catch((e: Error) => callback(e, "", 4));
        }) as unknown as typeof dnsLookup,
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          if (text.length < 1024) text += chunk;
        });
        res.on("end", () => done(res.statusCode ?? null, text));
        res.on("error", (e) => done(res.statusCode ?? null, e.message));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timed out after 10 s.")));
    req.on("error", (e) => done(null, e.message));
    req.end(body);
  });
}

// ── Endpoints (Settings → Webhooks) ─────────────────────────────────────

const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

export async function listEndpoints(db: Db, ctx: AccountContext) {
  assertRole(ctx, "admin");
  return db
    .select({
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
      description: webhookEndpoints.description,
      events: webhookEndpoints.events,
      enabled: webhookEndpoints.enabled,
      disabledReason: webhookEndpoints.disabledReason,
      failingSince: webhookEndpoints.failingSince,
      createdAt: webhookEndpoints.createdAt,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.accountId, ctx.accountId))
    .orderBy(desc(webhookEndpoints.createdAt));
}

async function ownEndpoint(db: Db, ctx: AccountContext, id: string) {
  const [row] = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, id),
        eq(webhookEndpoints.accountId, ctx.accountId),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Webhook not found.");
  return row;
}

export async function createEndpoint(
  db: Db,
  ctx: AccountContext,
  input: WebhookEndpointInput,
) {
  assertRole(ctx, "admin");
  await assertFeature(db, ctx.accountId, "webhooks");
  const data = webhookEndpointSchema.parse(input);
  await assertPublicUrl(data.url);
  const [n] = await db
    .select({ n: count() })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.accountId, ctx.accountId));
  if ((n?.n ?? 0) >= MAX_ENDPOINTS) {
    throw new ConflictError(
      `An account can have up to ${MAX_ENDPOINTS} webhooks.`,
    );
  }
  const [row] = await db
    .insert(webhookEndpoints)
    .values({
      accountId: ctx.accountId,
      url: data.url,
      description: data.description || null,
      events: data.events,
      secret: newSecret(),
      createdBy: ctx.userId,
    })
    .returning({ id: webhookEndpoints.id });
  if (!row) throw new Error("Webhook not saved.");
  return row.id;
}

export async function updateEndpoint(
  db: Db,
  ctx: AccountContext,
  id: string,
  input: WebhookEndpointInput,
) {
  assertRole(ctx, "admin");
  await assertFeature(db, ctx.accountId, "webhooks");
  await ownEndpoint(db, ctx, id);
  const data = webhookEndpointSchema.parse(input);
  await assertPublicUrl(data.url);
  await db
    .update(webhookEndpoints)
    .set({
      url: data.url,
      description: data.description || null,
      events: data.events,
    })
    .where(eq(webhookEndpoints.id, id));
}

export async function deleteEndpoint(db: Db, ctx: AccountContext, id: string) {
  assertRole(ctx, "admin");
  await ownEndpoint(db, ctx, id);
  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
}

/** Switch on (clears the failure state) or off by hand. */
export async function setEndpointEnabled(
  db: Db,
  ctx: AccountContext,
  id: string,
  enabled: boolean,
) {
  assertRole(ctx, "admin");
  if (enabled) await assertFeature(db, ctx.accountId, "webhooks");
  await ownEndpoint(db, ctx, id);
  await db
    .update(webhookEndpoints)
    .set({ enabled, disabledReason: null, failingSince: null })
    .where(eq(webhookEndpoints.id, id));
}

export async function revealSecret(db: Db, ctx: AccountContext, id: string) {
  assertRole(ctx, "admin");
  return (await ownEndpoint(db, ctx, id)).secret;
}

export async function rotateSecret(db: Db, ctx: AccountContext, id: string) {
  assertRole(ctx, "admin");
  await ownEndpoint(db, ctx, id);
  const secret = newSecret();
  await db
    .update(webhookEndpoints)
    .set({ secret })
    .where(eq(webhookEndpoints.id, id));
  return secret;
}

export async function listDeliveries(
  db: Db,
  ctx: AccountContext,
  endpointId: string,
  limit = 20,
) {
  assertRole(ctx, "admin");
  await ownEndpoint(db, ctx, endpointId);
  return db
    .select({
      id: webhookDeliveries.id,
      event: webhookDeliveries.event,
      status: webhookDeliveries.status,
      attempts: webhookDeliveries.attempts,
      responseStatus: webhookDeliveries.responseStatus,
      responseSnippet: webhookDeliveries.responseSnippet,
      durationMs: webhookDeliveries.durationMs,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.endpointId, endpointId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

/** "Send test event": a `ping` with a sample payload. Returns the delivery id. */
export async function testDelivery(
  db: Db,
  ctx: AccountContext,
  endpointId: string,
) {
  assertRole(ctx, "admin");
  const endpoint = await ownEndpoint(db, ctx, endpointId);
  const eventId = `evt_${randomBytes(12).toString("hex")}`;
  const [row] = await db
    .insert(webhookDeliveries)
    .values({
      endpointId: endpoint.id,
      event: "ping",
      eventId,
      payload: {
        id: eventId,
        event: "ping",
        created_at: new Date().toISOString(),
        account_id: ctx.accountId,
        data: { message: "Webhook test from Radius Roadmap." },
      },
    })
    .returning({ id: webhookDeliveries.id });
  return row?.id ?? null;
}

/** "Resend": the same event and payload again, as a new delivery. */
export async function resendDelivery(
  db: Db,
  ctx: AccountContext,
  deliveryId: string,
) {
  assertRole(ctx, "admin");
  const [old] = await db
    .select({
      endpointId: webhookDeliveries.endpointId,
      event: webhookDeliveries.event,
      eventId: webhookDeliveries.eventId,
      payload: webhookDeliveries.payload,
    })
    .from(webhookDeliveries)
    .innerJoin(
      webhookEndpoints,
      eq(webhookEndpoints.id, webhookDeliveries.endpointId),
    )
    .where(
      and(
        eq(webhookDeliveries.id, deliveryId),
        eq(webhookEndpoints.accountId, ctx.accountId),
      ),
    )
    .limit(1);
  if (!old) throw new NotFoundError("Delivery not found.");
  const [row] = await db
    .insert(webhookDeliveries)
    .values(old)
    .returning({ id: webhookDeliveries.id });
  return row?.id ?? null;
}

// ── Events → deliveries (worker) ────────────────────────────────────────

/** The `data` of an event: the item in the API's shape, at that moment. */
export async function eventData(
  db: Db,
  accountId: string,
  event: WebhookEvent,
  entityId: string,
): Promise<Record<string, unknown> | null> {
  const [kind] = event.split(".");
  const first = <T>(page: { data: T[] }) => page.data[0] ?? null;
  let item: unknown = null;
  if (kind === "feedback") {
    item = first(await apiFeedback(db, accountId, { limit: 1 }, entityId));
  } else if (kind === "roadmap_card") {
    item = first(await apiCards(db, accountId, { limit: 1 }, entityId));
  } else if (kind === "update") {
    item = first(await apiUpdates(db, accountId, { limit: 1 }, entityId));
  } else if (kind === "comment") {
    const [row] = await db
      .select({
        id: comments.id,
        workspaceId: comments.workspaceId,
        feedbackId: comments.feedbackId,
        cardId: comments.cardId,
        body: comments.body,
        internal: comments.isInternal,
        review: comments.review,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(and(eq(comments.accountId, accountId), eq(comments.id, entityId)))
      .limit(1);
    item = row ?? null;
  } else if (kind === "subscriber") {
    const [row] = await db
      .select({
        id: updateSubscribers.id,
        workspaceId: updateSubscribers.workspaceId,
        email: updateSubscribers.email,
        status: updateSubscribers.status,
        createdAt: updateSubscribers.createdAt,
      })
      .from(updateSubscribers)
      .where(
        and(
          eq(updateSubscribers.accountId, accountId),
          eq(updateSubscribers.id, entityId),
        ),
      )
      .limit(1);
    item = row ?? null;
  }
  return item ? (serialize(item) as Record<string, unknown>) : null;
}

/**
 * The `emit` job: build the payload once and create a delivery for every
 * enabled endpoint that wants the event. Returns the new delivery ids.
 */
export async function createDeliveries(
  db: Db,
  job: {
    accountId: string;
    event: WebhookEvent;
    entityId: string;
    data?: Record<string, unknown>;
    at: string;
  },
) {
  const endpoints = await db
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.accountId, job.accountId),
        eq(webhookEndpoints.enabled, true),
        sql`${job.event} = any(${webhookEndpoints.events})`,
      ),
    );
  if (!endpoints.length) return [];
  if (!(await hasFeature(db, job.accountId, "webhooks"))) return [];
  if (await isSuspended(db, job.accountId)) return []; // doc 28 C8
  const data =
    job.data ?? (await eventData(db, job.accountId, job.event, job.entityId));
  if (!data) return []; // gone again, or never committed
  const eventId = `evt_${randomBytes(12).toString("hex")}`;
  const payload = {
    id: eventId,
    event: job.event,
    created_at: job.at,
    account_id: job.accountId,
    data,
  };
  const rows = await db
    .insert(webhookDeliveries)
    .values(
      endpoints.map((e) => ({
        endpointId: e.id,
        event: job.event,
        eventId,
        payload,
      })),
    )
    .returning({ id: webhookDeliveries.id });
  return rows.map((r) => r.id);
}

export type DeliveryOutcome =
  | { result: "success" }
  | { result: "retry"; error: string }
  | { result: "failed"; error: string; disabled: boolean }
  | { result: "skipped" };

/**
 * The `deliver` job. `final` = BullMQ's last attempt. Failures mark the
 * endpoint as failing; after 3 days of only failures it's switched off (A10).
 */
export async function deliver(
  db: Db,
  deliveryId: string,
  final: boolean,
  send: typeof postJson = postJson,
  now = new Date(),
): Promise<DeliveryOutcome> {
  const [row] = await db
    .select({
      delivery: webhookDeliveries,
      url: webhookEndpoints.url,
      secret: webhookEndpoints.secret,
      enabled: webhookEndpoints.enabled,
      failingSince: webhookEndpoints.failingSince,
    })
    .from(webhookDeliveries)
    .innerJoin(
      webhookEndpoints,
      eq(webhookEndpoints.id, webhookDeliveries.endpointId),
    )
    .where(eq(webhookDeliveries.id, deliveryId))
    .limit(1);
  if (!row || row.delivery.status !== "pending") return { result: "skipped" };
  const { delivery } = row;
  if (!row.enabled) {
    await db
      .update(webhookDeliveries)
      .set({
        status: "failed",
        responseSnippet: "The webhook is switched off.",
      })
      .where(eq(webhookDeliveries.id, deliveryId));
    return { result: "skipped" };
  }

  const body = JSON.stringify(delivery.payload);
  const t = Math.floor(now.getTime() / 1000);
  const sent = await send(row.url, body, {
    [SIGNATURE_HEADER]: signPayload(row.secret, body, t),
    "X-RadiusRoadmap-Event": delivery.event,
    "X-RadiusRoadmap-Delivery": delivery.id,
  });
  const ok = sent.status !== null && sent.status >= 200 && sent.status < 300;
  const attempts = delivery.attempts + 1;

  if (ok) {
    await db
      .update(webhookDeliveries)
      .set({
        status: "success",
        attempts,
        responseStatus: sent.status,
        responseSnippet: sent.snippet,
        durationMs: sent.durationMs,
        deliveredAt: now,
      })
      .where(eq(webhookDeliveries.id, deliveryId));
    await db
      .update(webhookEndpoints)
      .set({ failingSince: null })
      .where(eq(webhookEndpoints.id, delivery.endpointId));
    await pruneDeliveries(db, delivery.endpointId);
    return { result: "success" };
  }

  const error = sent.status
    ? `HTTP ${sent.status}`
    : sent.snippet || "No response";
  const failingSince = row.failingSince ?? now;
  const disable = now.getTime() - failingSince.getTime() >= DISABLE_AFTER_MS;
  await db
    .update(webhookDeliveries)
    .set({
      status: final || disable ? "failed" : "pending",
      attempts,
      responseStatus: sent.status,
      responseSnippet: sent.snippet || error,
      durationMs: sent.durationMs,
    })
    .where(eq(webhookDeliveries.id, deliveryId));
  await db
    .update(webhookEndpoints)
    .set(
      disable
        ? {
            failingSince,
            enabled: false,
            disabledReason: `Switched off after 3 days of failed deliveries (last: ${error}).`,
          }
        : { failingSince },
    )
    .where(
      and(
        eq(webhookEndpoints.id, delivery.endpointId),
        eq(webhookEndpoints.enabled, true),
      ),
    );
  if (disable) return { result: "failed", error, disabled: true };
  return final
    ? { result: "failed", error, disabled: false }
    : { result: "retry", error };
}

/** Keep the newest deliveries of an endpoint (A10). */
async function pruneDeliveries(db: Db, endpointId: string) {
  const keep = db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.endpointId, endpointId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(KEEP_DELIVERIES);
  await db
    .delete(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.endpointId, endpointId),
        notInArray(webhookDeliveries.id, keep),
      ),
    );
}

/** Who to tell when an endpoint is switched off: the account's owners. */
export async function endpointNotice(db: Db, deliveryId: string) {
  const [row] = await db
    .select({
      accountId: webhookEndpoints.accountId,
      url: webhookEndpoints.url,
      reason: webhookEndpoints.disabledReason,
      accountName: organization.name,
    })
    .from(webhookDeliveries)
    .innerJoin(
      webhookEndpoints,
      eq(webhookEndpoints.id, webhookDeliveries.endpointId),
    )
    .innerJoin(organization, eq(organization.id, webhookEndpoints.accountId))
    .where(eq(webhookDeliveries.id, deliveryId))
    .limit(1);
  if (!row) return null;
  const [owners, [first]] = await Promise.all([
    db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(eq(member.organizationId, row.accountId), eq(member.role, "owner")),
      ),
    db
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.accountId, row.accountId))
      .orderBy(workspaces.createdAt)
      .limit(1),
  ]);
  return {
    ...row,
    owners: owners.map((o) => o.email),
    settingsUrl: `${new URL(env.NEXT_PUBLIC_APP_URL).origin}${first ? `/dashboard/${first.slug}/settings/webhooks` : "/"}`,
  };
}

/** Pending deliveries an endpoint still has (shown in the list). */
export async function pendingCount(db: Db, endpointIds: string[]) {
  if (!endpointIds.length) return new Map<string, number>();
  const rows = await db
    .select({ endpointId: webhookDeliveries.endpointId, n: count() })
    .from(webhookDeliveries)
    .where(
      and(
        inArray(webhookDeliveries.endpointId, endpointIds),
        eq(webhookDeliveries.status, "pending"),
        isNull(webhookDeliveries.deliveredAt),
      ),
    )
    .groupBy(webhookDeliveries.endpointId);
  return new Map(rows.map((r) => [r.endpointId, r.n]));
}
