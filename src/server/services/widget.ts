import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import {
  type WidgetSettingsInput,
  widgetSettings,
  widgetSettingsSchema,
} from "@/lib/schemas/widget";
import type { Db } from "@/server/db/client";
import { widgetKeys, workspaces } from "@/server/db/schema";
import {
  type AccountContext,
  assertRole,
  NotFoundError,
  type PublicContext,
  type WorkspaceContext,
} from "./context";
import { hasFeature } from "./plan-limits";
import { listPublicBoards } from "./public-ideas";
import { getPublicWorkspace } from "./public-site";
import { listPublicUpdates } from "./public-updates";
import { identifyTrackedUser } from "./tracked-users";

// The JavaScript widget (doc 26 6B): its settings, the account's signing key
// for identity tokens (P10), and who a widget request is.

export async function getWidgetSettings(db: Db, ctx: WorkspaceContext) {
  const [row] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.accountId, ctx.accountId),
        eq(workspaces.id, ctx.workspaceId),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Workspace not found.");
  return widgetSettings(row.settings.widget);
}

export async function updateWidgetSettings(
  db: Db,
  ctx: WorkspaceContext,
  input: WidgetSettingsInput,
) {
  assertRole(ctx, "admin");
  const parsed = widgetSettingsSchema.parse(input);
  const widget = { ...parsed, color: parsed.color || null };
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.accountId, ctx.accountId),
          eq(workspaces.id, ctx.workspaceId),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) throw new NotFoundError("Workspace not found.");
    await tx
      .update(workspaces)
      .set({ settings: { ...row.settings, widget } })
      .where(eq(workspaces.id, ctx.workspaceId));
    return widgetSettings(widget);
  });
}

function newSecret() {
  return randomBytes(32).toString("base64url");
}

/** The account's signing key, created on first use. Owners and admins only. */
export async function getWidgetKey(db: Db, ctx: AccountContext) {
  assertRole(ctx, "admin");
  await db
    .insert(widgetKeys)
    .values({ accountId: ctx.accountId, secret: newSecret() })
    .onConflictDoNothing();
  const [row] = await db
    .select({ secret: widgetKeys.secret })
    .from(widgetKeys)
    .where(eq(widgetKeys.accountId, ctx.accountId))
    .limit(1);
  if (!row) throw new Error("Failed to create the widget key.");
  return row.secret;
}

/** New key: tokens signed with the old one stop working at once. */
export async function rotateWidgetKey(db: Db, ctx: AccountContext) {
  assertRole(ctx, "admin");
  const secret = newSecret();
  await db
    .insert(widgetKeys)
    .values({ accountId: ctx.accountId, secret })
    .onConflictDoUpdate({
      target: widgetKeys.accountId,
      set: { secret, createdAt: new Date() },
    });
  return secret;
}

export type WidgetUser = {
  /** The customer's own user id. */
  id: string;
  email: string | null;
  name: string | null;
};

/**
 * Checks an identity token from the customer's app (HS256 JWT signed with
 * the account's widget key, doc 26 P10). Needs `sub` and `exp`; tokens may
 * live at most a day. Returns null when anything is off.
 */
export async function verifyWidgetToken(
  db: Db,
  ctx: PublicContext,
  token: string | null | undefined,
): Promise<WidgetUser | null> {
  if (!token) return null;
  const [row] = await db
    .select({ secret: widgetKeys.secret })
    .from(widgetKeys)
    .where(eq(widgetKeys.accountId, ctx.accountId))
    .limit(1);
  if (!row) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(row.secret),
      { algorithms: ["HS256"], requiredClaims: ["sub", "exp"] },
    );
    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub || (payload.exp ?? 0) - now > 86_400) return null;
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null;
    return {
      id: payload.sub,
      email: str(payload.email)?.toLowerCase() ?? null,
      name: str(payload.name),
    };
  } catch {
    return null;
  }
}

/**
 * Who is using the widget: a verified user from a valid token, else an
 * unverified guest from the name and email the page (or the visitor) gave,
 * else nobody.
 */
export async function widgetIdentity(
  db: Db,
  ctx: PublicContext,
  input: { token?: string | null; name?: string | null; email?: string | null },
) {
  const user = await verifyWidgetToken(db, ctx, input.token);
  if (user) {
    const row = await identifyTrackedUser(db, ctx, {
      kind: "sso",
      externalId: user.id,
      email: user.email,
      name: user.name,
      verified: !!user.email,
    });
    return { user: row, verified: true };
  }
  const email = input.email?.trim().toLowerCase();
  if (!email) return null;
  const row = await identifyTrackedUser(db, ctx, {
    kind: "widget",
    email,
    name: input.name?.trim() || null,
  });
  return { user: row, verified: false };
}

/**
 * Everything the widget shows for a workspace, or null when the workspace
 * has nothing public or the plan has no widget (Startup+, doc 26 P7).
 */
export async function widgetSite(
  db: Db,
  ctx: PublicContext,
  workspaceSlug: string,
) {
  if (!(await hasFeature(db, ctx.accountId, "widget"))) return null;
  const ws = await getPublicWorkspace(db, ctx, workspaceSlug);
  if (!ws) return null;
  const settings = widgetSettings(ws.settings.widget);
  const [updates, boards] = await Promise.all([
    ws.modules.updates
      ? listPublicUpdates(db, ctx, ws.id, { limit: 10 })
      : null,
    ws.modules.ideas && settings.feedback
      ? listPublicBoards(db, ctx, ws.id)
      : [],
  ]);
  return {
    workspace: {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      isDefault: ws.isDefault,
      logo: ws.features.logo ? ws.logo : null,
    },
    settings: {
      ...settings,
      reactions: settings.reactions && ws.features.reactions,
      feedback: !!boards[0],
    },
    posts: updates?.posts ?? [],
    /** Where "Send feedback" posts go: the first public ideas board. */
    board: boards[0]?.slug ?? null,
  };
}
