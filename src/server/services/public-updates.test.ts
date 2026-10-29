import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import type { PublicContext, WorkspaceContext } from "./context";
import { getPublicWorkspace, publicPathStatus } from "./public-site";
import {
  getPublicUpdate,
  getReactablePost,
  listPublicUpdates,
  updatePathStatus,
} from "./public-updates";
import { myReactions, toggleReaction } from "./reactions";
import {
  createUpdate,
  patchUpdate,
  publishDue,
  publishUpdate,
  unpublishUpdate,
} from "./updates";
import { createWorkspace, updatePublicSite } from "./workspaces";

// Publishing and the public Updates pages (doc 23 step 3).

let ws: WorkspaceContext;
let other: WorkspaceContext;
let pub: PublicContext;
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "pup-a"),
    await createTestAccount(db, "pup-b"),
  ];
  const [oA, oB] = [
    await createTestUser(db, "pup-owner-a"),
    await createTestUser(db, "pup-owner-b"),
  ];
  accounts.push(a, b);
  users.push(oA, oB);
  const ctxA = await addTestMember(db, a, oA, "owner");
  const ctxB = await addTestMember(db, b, oB, "owner");
  const w = await createWorkspace(db, ctxA, { name: "Pup", slug: "pup" });
  const wB = await createWorkspace(db, ctxB, { name: "Puq", slug: "puq" });
  ws = { ...ctxA, workspaceId: w.id, workspaceSlug: w.slug };
  other = { ...ctxB, workspaceId: wB.id, workspaceSlug: wB.slug };
  pub = { accountId: a };
});

afterAll(() => cleanup(db, accounts, users));

async function post(title: string) {
  const row = await createUpdate(db, ws, {});
  await patchUpdate(db, ws, { id: row.id, title });
  return row;
}

describe("publishing", () => {
  it("no Updates tab until something is published; slug follows the final title", async () => {
    expect((await getPublicWorkspace(db, pub, "pup"))?.modules.updates).toBe(
      false,
    );
    const p = await post("Dark mode is live");
    expect(await updatePathStatus(db, pub, "pup", undefined)).toBe("missing");
    const { post: live, scheduledFor } = await publishUpdate(db, ws, p.id);
    expect(scheduledFor).toBeNull();
    expect(live).toMatchObject({
      status: "published",
      slug: "dark-mode-is-live",
    });
    expect(live.publishedAt).not.toBeNull();
    expect((await getPublicWorkspace(db, pub, "pup"))?.modules.updates).toBe(
      true,
    );
    expect(await publicPathStatus(db, pub, ["pup", "updates"])).toBe("ok");
    expect(
      await publicPathStatus(db, pub, ["pup", "updates", "dark-mode-is-live"]),
    ).toBe("ok");
    expect(
      await publicPathStatus(db, pub, ["pup", "updates", "feed.xml"]),
    ).toBe("ok");
  });

  it("schedules, publishes when due (once), and ignores a stale job", async () => {
    const p = await post("Scheduled one");
    const at = new Date(Date.now() + 3_600_000);
    const { post: s, scheduledFor } = await publishUpdate(db, ws, p.id, at);
    expect(s.status).toBe("scheduled");
    expect(scheduledFor?.getTime()).toBe(at.getTime());
    expect(await getPublicUpdate(db, pub, ws.workspaceId, s.slug)).toBeNull();

    // A job for an older time does nothing; the right one publishes once.
    expect(
      await publishDue(db, p.id, new Date(at.getTime() - 1000)),
    ).toBeNull();
    expect((await publishDue(db, p.id, at))?.status).toBe("published");
    expect(await publishDue(db, p.id, at)).toBeNull();
  });

  it("drafts, private posts and unpublished posts never show; Updates switch hides all", async () => {
    const draft = await post("Still a draft");
    const priv = await post("Team only");
    await patchUpdate(db, ws, { id: priv.id, isPublic: false });
    await publishUpdate(db, ws, priv.id);
    const gone = await post("Pulled back");
    await publishUpdate(db, ws, gone.id);
    await unpublishUpdate(db, ws, gone.id);

    const { posts } = await listPublicUpdates(db, pub, ws.workspaceId);
    const titles = posts.map((p) => p.title);
    expect(titles).toContain("Dark mode is live");
    expect(titles).not.toContain("Still a draft");
    expect(titles).not.toContain("Team only");
    expect(titles).not.toContain("Pulled back");
    expect(draft.status).toBe("draft");

    await updatePublicSite(db, ws, {
      showRoadmap: true,
      showIdeas: true,
      showUpdates: false,
      commentsEnabled: false,
      approveComments: false,
      followsEnabled: false,
      termsUrl: "",
      privacyUrl: "",
    });
    expect((await listPublicUpdates(db, pub, ws.workspaceId)).posts).toEqual(
      [],
    );
    expect(await publicPathStatus(db, pub, ["pup", "updates"])).toBe("missing");
    await updatePublicSite(db, ws, {
      showRoadmap: true,
      showIdeas: true,
      showUpdates: true,
      commentsEnabled: false,
      approveComments: false,
      followsEnabled: false,
      termsUrl: "",
      privacyUrl: "",
    });
  });

  it("another account can't publish this workspace's posts or see them", async () => {
    const p = await post("Ours");
    await expect(publishUpdate(db, other, p.id)).rejects.toThrow();
    await publishUpdate(db, ws, p.id);
    expect(
      (
        await listPublicUpdates(
          db,
          { accountId: other.accountId },
          ws.workspaceId,
        )
      ).posts,
    ).toEqual([]);
  });
});

describe("reactions", () => {
  it("toggle per visitor and emoji, count, and only on public posts", async () => {
    const p = await post("React to me");
    expect(await getReactablePost(db, pub, p.id)).toBeNull(); // draft
    const { post: published } = await publishUpdate(db, ws, p.id);
    const live = await getReactablePost(db, pub, p.id);
    if (!live) throw new Error("not reactable");

    const a = { visitorId: "visitor-a" };
    const b = { visitorId: "visitor-b" };
    expect(await toggleReaction(db, pub, live.id, "tada", a)).toEqual({
      reacted: true,
      count: 1,
    });
    expect(await toggleReaction(db, pub, live.id, "tada", b)).toEqual({
      reacted: true,
      count: 2,
    });
    await toggleReaction(db, pub, live.id, "heart", a);
    expect(await myReactions(db, pub, ws.workspaceId, a)).toEqual(
      expect.arrayContaining([`${live.id}:tada`, `${live.id}:heart`]),
    );
    const shown = await getPublicUpdate(
      db,
      pub,
      ws.workspaceId,
      published.slug,
    );
    expect(shown?.reactions).toEqual({ tada: 2, heart: 1 });

    expect(await toggleReaction(db, pub, live.id, "tada", a)).toEqual({
      reacted: false,
      count: 1,
    });
    expect(
      await getReactablePost(db, { accountId: other.accountId }, live.id),
    ).toBeNull();
  });
});
