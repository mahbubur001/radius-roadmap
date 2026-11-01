import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/server/db/client";
import { feedbackItems } from "@/server/db/schema";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import {
  ForbiddenError,
  type PublicContext,
  type WorkspaceContext,
} from "./context";
import { billing } from "./plan-limits";
import { submitIdea } from "./public-ideas";
import { createUpdate, patchUpdate, publishUpdate } from "./updates";
import {
  getWidgetKey,
  getWidgetSettings,
  rotateWidgetKey,
  updateWidgetSettings,
  verifyWidgetToken,
  widgetIdentity,
  widgetSite,
} from "./widget";
import { createWorkspace } from "./workspaces";

// The JavaScript widget (doc 26 6B).

let ws: WorkspaceContext; // owner, account A
let other: WorkspaceContext; // owner, account B
let member: WorkspaceContext;
let pub: PublicContext;
const accounts: string[] = [];
const users: string[] = [];

const SETTINGS = {
  layout: "popover" as const,
  position: "left" as const,
  launcher: "bell" as const,
  color: "#123abc",
  title: "Changelog",
  reactions: true,
  feedback: true,
};

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "wid-a"),
    await createTestAccount(db, "wid-b"),
  ];
  const [oA, oB, m] = [
    await createTestUser(db, "wid-owner-a"),
    await createTestUser(db, "wid-owner-b"),
    await createTestUser(db, "wid-member"),
  ];
  accounts.push(a, b);
  users.push(oA, oB, m);
  const ctxA = await addTestMember(db, a, oA, "owner");
  const ctxB = await addTestMember(db, b, oB, "owner");
  const ctxM = await addTestMember(db, a, m, "member");
  const w = await createWorkspace(db, ctxA, { name: "Wid", slug: "wid" });
  const wB = await createWorkspace(db, ctxB, { name: "Wiq", slug: "wiq" });
  ws = { ...ctxA, workspaceId: w.id, workspaceSlug: w.slug };
  other = { ...ctxB, workspaceId: wB.id, workspaceSlug: wB.slug };
  member = { ...ctxM, workspaceId: w.id, workspaceSlug: w.slug };
  pub = { accountId: a };
});

afterAll(() => cleanup(db, accounts, users));

afterEach(() => {
  vi.restoreAllMocks();
});

async function sign(
  secret: string,
  claims: Record<string, unknown>,
  exp = "1h",
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
}

describe("settings", () => {
  it("has defaults, saves for admins only", async () => {
    expect(await getWidgetSettings(db, ws)).toMatchObject({
      layout: "sidebar",
      title: "What's new",
    });
    await expect(
      updateWidgetSettings(db, member, SETTINGS),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await updateWidgetSettings(db, ws, SETTINGS);
    expect(await getWidgetSettings(db, ws)).toEqual(SETTINGS);
    // Another account's workspace is untouched.
    expect((await getWidgetSettings(db, other)).layout).toBe("sidebar");
  });
});

describe("identity tokens", () => {
  it("accepts tokens signed with this account's key only", async () => {
    const secret = await getWidgetKey(db, ws);
    expect(await getWidgetKey(db, ws)).toBe(secret);
    const otherSecret = await getWidgetKey(db, other);

    const good = await sign(secret, {
      sub: "cust-1",
      email: "Ada@Example.test",
      name: "Ada",
    });
    expect(await verifyWidgetToken(db, pub, good)).toEqual({
      id: "cust-1",
      email: "ada@example.test",
      name: "Ada",
    });
    // Signed with account B's key, or used on account B.
    expect(
      await verifyWidgetToken(db, pub, await sign(otherSecret, { sub: "x" })),
    ).toBeNull();
    expect(
      await verifyWidgetToken(db, { accountId: other.accountId }, good),
    ).toBeNull();
    // No subject, expired, or living longer than a day.
    expect(await verifyWidgetToken(db, pub, await sign(secret, {}))).toBeNull();
    expect(
      await verifyWidgetToken(db, pub, await sign(secret, { sub: "a" }, "-1m")),
    ).toBeNull();
    expect(
      await verifyWidgetToken(db, pub, await sign(secret, { sub: "a" }, "2d")),
    ).toBeNull();
    expect(await verifyWidgetToken(db, pub, "garbage")).toBeNull();
  });

  it("rotating the key signs everyone out", async () => {
    const old = await getWidgetKey(db, ws);
    const token = await sign(old, { sub: "cust-2" });
    const next = await rotateWidgetKey(db, ws);
    expect(next).not.toBe(old);
    expect(await verifyWidgetToken(db, pub, token)).toBeNull();
    await expect(rotateWidgetKey(db, member)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("a token is a verified user; a bare email is an unverified guest", async () => {
    const secret = await getWidgetKey(db, ws);
    const token = await sign(secret, {
      sub: "cust-3",
      email: "c3@example.test",
    });
    const sso = await widgetIdentity(db, pub, { token });
    expect(sso).toMatchObject({ verified: true });
    expect(sso?.user).toMatchObject({ kind: "sso", externalId: "cust-3" });

    const guest = await widgetIdentity(db, pub, {
      name: "Guest",
      email: "guest@example.test",
    });
    expect(guest).toMatchObject({ verified: false });
    expect(guest?.user.emailVerifiedAt).toBeNull();
    expect(await widgetIdentity(db, pub, {})).toBeNull();
  });
});

describe("widget site", () => {
  it("shows the latest posts and where feedback goes", async () => {
    const row = await createUpdate(db, ws, {});
    await patchUpdate(db, ws, { id: row.id, title: "Widget launch" });
    await publishUpdate(db, ws, row.id);

    const site = await widgetSite(db, pub, "wid");
    expect(site?.settings).toMatchObject({
      layout: "popover",
      reactions: true,
    });
    expect(site?.posts.map((p) => p.title)).toContain("Widget launch");
    expect(site?.board).toBeTruthy();
    // Another account's slug doesn't resolve here.
    expect(await widgetSite(db, pub, "wiq")).toBeNull();
  });

  it("needs a plan with the widget when billing is on", async () => {
    vi.spyOn(billing, "enabled").mockReturnValue(true);
    expect(await widgetSite(db, pub, "wid")).toBeNull();
  });

  it("unverified feedback always waits in the triage inbox", async () => {
    const site = await widgetSite(db, pub, "wid");
    const guest = await widgetIdentity(db, pub, { email: "g2@example.test" });
    if (!site?.board || !guest) throw new Error("setup");
    const item = await submitIdea(db, pub, {
      workspaceId: ws.workspaceId,
      board: site.board,
      title: "Dark mode please",
      details: "",
      trackedUserId: guest.user.id,
      source: "widget",
      review: true,
    });
    const [row] = await db
      .select({ review: feedbackItems.review, source: feedbackItems.source })
      .from(feedbackItems)
      .where(eq(feedbackItems.id, item.id));
    expect(row).toEqual({ review: "pending", source: "widget" });
  });
});
