import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { db } from "@/server/db/client";
import { verifyLink } from "@/server/internal-signature";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import type { PublicContext, WorkspaceContext } from "./context";
import {
  confirmSubscription,
  subscribe,
  suppress,
  unsubscribe,
} from "./subscribers";
import {
  claimUpdateEmail,
  subscriberBatch,
  updateEmail,
} from "./update-emails";
import { createUpdate, patchUpdate, publishUpdate } from "./updates";
import { createWorkspace } from "./workspaces";

// Emailing published posts to subscribers (doc 23 step 5).

let ws: WorkspaceContext;
let wsOther: WorkspaceContext;
let pub: PublicContext;
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const a = await createTestAccount(db, "uem-a");
  const o = await createTestUser(db, "uem-owner");
  accounts.push(a);
  users.push(o);
  const ctx = await addTestMember(db, a, o, "owner");
  const w = await createWorkspace(db, ctx, { name: "Uem", slug: "uem" });
  const w2 = await createWorkspace(db, ctx, { name: "Uen", slug: "uen" });
  ws = { ...ctx, workspaceId: w.id, workspaceSlug: w.slug };
  wsOther = { ...ctx, workspaceId: w2.id, workspaceSlug: w2.slug };
  pub = { accountId: a };

  const active = async (workspaceId: string, email: string) => {
    const r = await subscribe(db, pub, { workspaceId, email, verified: false });
    if (r.status === "pending") await confirmSubscription(db, pub, r.token);
    return r;
  };
  await active(w.id, "one@example.test");
  await active(w.id, "two@example.test");
  const gone = await active(w.id, "gone@example.test");
  if (gone.status === "pending") {
    await unsubscribe(db, pub, { token: gone.token });
  }
  await subscribe(db, pub, {
    workspaceId: w.id,
    email: "pending@example.test",
    verified: false,
  });
  await active(w.id, "blocked@example.test");
  await suppress(db, pub, "blocked@example.test", "complaint");
  await active(w2.id, "elsewhere@example.test");
});

afterAll(() => cleanup(db, accounts, users));

async function published(title: string, patch = {}) {
  const post = await createUpdate(db, ws, {});
  await patchUpdate(db, ws, { id: post.id, title, ...patch });
  return (await publishUpdate(db, ws, post.id)).post;
}

describe("post emails", () => {
  it("claims a post once and sends only to active, unsuppressed subscribers of its workspace", async () => {
    const post = await published("Big release");
    const claimed = await claimUpdateEmail(db, post.id);
    expect(claimed?.title).toBe("Big release");
    expect(await claimUpdateEmail(db, post.id)).toBeNull();
    if (!claimed) throw new Error("not claimed");

    const batch = await subscriberBatch(db, claimed, null);
    expect(batch.map((s) => s.email).sort()).toEqual([
      "one@example.test",
      "two@example.test",
    ]);
    // Keyset paging: after the last one there's nothing left.
    expect(
      await subscriberBatch(db, claimed, batch.at(-1)?.id ?? null),
    ).toEqual([]);
  });

  it("builds an email with a signed one-click unsubscribe link", async () => {
    const post = await published("Second release");
    const claimed = await claimUpdateEmail(db, post.id);
    if (!claimed) throw new Error("not claimed");
    const [sub] = await subscriberBatch(db, claimed, null);
    if (!sub) throw new Error("no subscriber");
    const email = updateEmail(claimed, sub);
    expect(email.to).toBe(sub.email);
    expect(email.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    const url = new URL(
      email.headers?.["List-Unsubscribe"]?.slice(1, -1) ?? "",
    );
    expect(url.searchParams.get("s")).toBe(sub.id);
    expect(
      verifyLink(
        env.BETTER_AUTH_SECRET,
        `unsub:${sub.id}`,
        url.searchParams.get("sig") ?? "",
      ),
    ).toBe(true);
    expect(email.props).toMatchObject({
      title: "Second release",
      url: expect.stringContaining("/uem/updates/second-release"),
    });
  });

  it("never emails private posts, posts with emails off, or drafts", async () => {
    const priv = await published("Private one", { isPublic: false });
    expect(await claimUpdateEmail(db, priv.id)).toBeNull();
    const quiet = await published("Quiet one", { emailSubscribers: false });
    expect(await claimUpdateEmail(db, quiet.id)).toBeNull();
    const draft = await createUpdate(db, ws, {});
    expect(await claimUpdateEmail(db, draft.id)).toBeNull();
    expect(wsOther.workspaceId).not.toBe(ws.workspaceId);
  });
});
