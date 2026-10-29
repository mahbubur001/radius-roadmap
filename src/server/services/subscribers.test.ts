import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import {
  NotFoundError,
  type PublicContext,
  type WorkspaceContext,
} from "./context";
import { newSubscriberEmails, setMyPrefs } from "./notifications";
import {
  confirmSubscription,
  isSuppressed,
  listSubscribers,
  removeSubscriber,
  subscribe,
  subscriberCounts,
  subscribersCsv,
  suppress,
  unsubscribe,
} from "./subscribers";
import { createWorkspace } from "./workspaces";

// Update subscribers (doc 23 step 4).

let ws: WorkspaceContext;
let other: WorkspaceContext;
let pub: PublicContext;
let pubB: PublicContext;
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "sub-a"),
    await createTestAccount(db, "sub-b"),
  ];
  const [oA, oB] = [
    await createTestUser(db, "sub-owner-a"),
    await createTestUser(db, "sub-owner-b"),
  ];
  accounts.push(a, b);
  users.push(oA, oB);
  const ctxA = await addTestMember(db, a, oA, "owner");
  const ctxB = await addTestMember(db, b, oB, "owner");
  const w = await createWorkspace(db, ctxA, { name: "Subs", slug: "subs" });
  const wB = await createWorkspace(db, ctxB, { name: "Subz", slug: "subz" });
  ws = { ...ctxA, workspaceId: w.id, workspaceSlug: w.slug };
  other = { ...ctxB, workspaceId: wB.id, workspaceSlug: wB.slug };
  pub = { accountId: a };
  pubB = { accountId: b };
});

afterAll(() => cleanup(db, accounts, users));

const sub = (email: string, verified = false) =>
  subscribe(db, pub, { workspaceId: ws.workspaceId, email, verified });

describe("subscribers", () => {
  it("double opt-in: pending until confirmed, then active once", async () => {
    const first = await sub("Ana@Example.test");
    expect(first.status).toBe("pending");
    if (first.status !== "pending") throw new Error("not pending");
    // Another account can't use the token.
    expect(await confirmSubscription(db, pubB, first.token)).toBeNull();
    const ok = await confirmSubscription(db, pub, first.token);
    expect(ok).toMatchObject({ email: "ana@example.test", activated: true });
    expect((await confirmSubscription(db, pub, first.token))?.activated).toBe(
      false,
    );
    // Subscribing again changes nothing.
    expect(await sub("ana@example.test")).toMatchObject({
      status: "active",
      activated: false,
    });
  });

  it("verified voters are active at once and alert members who opted in", async () => {
    await setMyPrefs(db, ws, {
      newFeedback: "instant",
      newComment: "instant",
      newSubscriber: "instant",
    });
    const result = await sub("vera@example.test", true);
    expect(result).toMatchObject({ status: "active", activated: true });
    const emails = await newSubscriberEmails(db, result.id);
    expect(emails.map((e) => e.userId)).toEqual([ws.userId]);
    expect(emails[0]?.props).toMatchObject({ email: "vera@example.test" });
  });

  it("unsubscribe, 'stop everything' and re-subscribing", async () => {
    const first = await sub("ula@example.test");
    if (first.status !== "pending") throw new Error("not pending");
    await confirmSubscription(db, pub, first.token);
    const gone = await unsubscribe(db, pub, first.token, true);
    expect(gone?.email).toBe("ula@example.test");
    expect(await isSuppressed(db, pub, "ula@example.test")).toBe(true);
    expect(await isSuppressed(db, pubB, "ula@example.test")).toBe(false);

    // Subscribing again is a new, explicit request: pending again, and the
    // "stop everything" suppression is lifted.
    expect((await sub("ula@example.test")).status).toBe("pending");
    expect(await isSuppressed(db, pub, "ula@example.test")).toBe(false);
  });

  it("bounced or complaining addresses never get a confirmation", async () => {
    await suppress(db, pub, "bad@example.test", "bounce");
    expect(await sub("bad@example.test")).toMatchObject({
      status: "active",
      id: "",
    });
    expect((await listSubscribers(db, ws)).map((s) => s.email)).not.toContain(
      "bad@example.test",
    );
  });

  it("team lists, counts, exports and removes; other accounts can't", async () => {
    await sub("=formula@example.test");
    const counts = await subscriberCounts(db, ws);
    expect(counts.active).toBeGreaterThan(0);
    const csv = await subscribersCsv(db, ws);
    expect(csv.split("\r\n")[0]).toBe(
      "Email,Status,Source,Subscribed,Confirmed",
    );
    expect(csv).toContain("'=formula@example.test");
    const [row] = await listSubscribers(db, ws, { q: "formula" });
    await expect(
      removeSubscriber(db, other, row?.id ?? ""),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await listSubscribers(db, other)).toEqual([]);
    await removeSubscriber(db, ws, row?.id ?? "");
    expect(await listSubscribers(db, ws, { q: "formula" })).toEqual([]);
  });
});
