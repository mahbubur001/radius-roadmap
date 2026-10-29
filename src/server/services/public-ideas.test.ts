import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { feedbackBoards } from "@/server/db/schema";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import type { PublicContext, WorkspaceContext } from "./context";
import {
  createFeedback,
  getFeedback,
  listBoards,
  mergeFeedback,
  reviewFeedback,
} from "./feedback";
import {
  getPublicIdea,
  getPublicIdeas,
  getVotableIdea,
  ideaPathStatus,
  pendingIdeas,
  submitIdea,
} from "./public-ideas";
import { getPublicWorkspace, publicPathStatus } from "./public-site";
import { guestSignIn } from "./voter-auth";
import { toggleFeedbackVote, votedIds } from "./votes";
import { createWorkspace, updatePublicSite } from "./workspaces";

// Public Ideas (doc 20 steps 5–6, doc 22 step 4).

let ws: WorkspaceContext;
let wsB: WorkspaceContext;
let pub: PublicContext;
let pubB: PublicContext;
let board: { id: string; slug: string };
let voterId: string;
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "ideas-a"),
    await createTestAccount(db, "ideas-b"),
  ];
  const [oA, oB] = [
    await createTestUser(db, "ideas-owner-a"),
    await createTestUser(db, "ideas-owner-b"),
  ];
  accounts.push(a, b);
  users.push(oA, oB);
  const ctxA = await addTestMember(db, a, oA, "owner");
  const ctxB = await addTestMember(db, b, oB, "owner");
  const w = await createWorkspace(db, ctxA, { name: "Ideas", slug: "ideas" });
  const wB = await createWorkspace(db, ctxB, { name: "Bee", slug: "bee" });
  ws = { ...ctxA, workspaceId: w.id, workspaceSlug: w.slug };
  wsB = { ...ctxB, workspaceId: wB.id, workspaceSlug: wB.slug };
  pub = { accountId: a };
  pubB = { accountId: b };
  const [first] = await listBoards(db, ws);
  board = { id: first?.id ?? "", slug: first?.slug ?? "" };
  voterId = (await guestSignIn(db, pub, { name: "Ann", email: "ann@x.test" }))
    .id;
});

afterAll(() => cleanup(db, accounts, users));

describe("public ideas", () => {
  it("shows the Ideas tab and only approved, public items", async () => {
    expect((await getPublicWorkspace(db, pub, "ideas"))?.modules.ideas).toBe(
      true,
    );
    const shown = await createFeedback(db, ws, {
      boardId: board.id,
      title: "Dark mode",
    });
    const hidden = await submitIdea(db, pub, {
      workspaceId: ws.workspaceId,
      board: board.slug,
      title: "Waiting one",
      details: "",
      trackedUserId: voterId,
      source: "public",
    });
    expect(hidden.review).toBe("pending");

    const list = await getPublicIdeas(db, pub, ws.workspaceId, {});
    const ids = list?.items.map((i) => i.id) ?? [];
    expect(ids).toContain(shown.id);
    expect(ids).not.toContain(hidden.id);
    expect(
      await getPublicIdea(db, pub, ws.workspaceId, hidden.slug),
    ).toBeNull();
    expect(
      (await pendingIdeas(db, pub, ws.workspaceId, voterId)).map((i) => i.id),
    ).toEqual([hidden.id]);

    // Approving publishes it.
    await reviewFeedback(db, ws, [hidden.id], "approve");
    expect(
      (await getPublicIdea(db, pub, ws.workspaceId, hidden.slug))?.title,
    ).toBe("Waiting one");
  });

  it("stores plain-text details safely and auto-publishes when the board says so", async () => {
    await db
      .update(feedbackBoards)
      .set({ autoPublish: true })
      .where(eq(feedbackBoards.id, board.id));
    const item = await submitIdea(db, pub, {
      workspaceId: ws.workspaceId,
      board: board.slug,
      title: "Export",
      details: "<script>x</script>\nCSV please",
      trackedUserId: voterId,
      source: "public",
    });
    expect(item.review).toBe("approved");
    const idea = await getPublicIdea(db, pub, ws.workspaceId, item.slug);
    expect(idea?.html).toBe(
      "<p>&lt;script&gt;x&lt;/script&gt;<br>CSV please</p>",
    );
    await db
      .update(feedbackBoards)
      .set({ autoPublish: false })
      .where(eq(feedbackBoards.id, board.id));
  });

  it("votes and unvotes an idea, and lists it as voted", async () => {
    const item = await createFeedback(db, ws, {
      boardId: board.id,
      title: "Vote me",
    });
    const votable = await getVotableIdea(db, pub, item.id);
    if (!votable) throw new Error("not votable");
    const meta = {
      ipHash: null,
      country: null,
      city: null,
      source: "public",
    } as const;
    const voter = { visitorId: "v-1" };
    expect(await toggleFeedbackVote(db, pub, votable, voter, meta)).toEqual({
      voted: true,
      total: 1,
    });
    expect(await votedIds(db, pub, voter, ws.workspaceId)).toContain(item.id);
    expect(await toggleFeedbackVote(db, pub, votable, voter, meta)).toEqual({
      voted: false,
      total: 0,
    });
  });

  it("redirects a merged idea to its target and 404s unknown ones", async () => {
    const source = await createFeedback(db, ws, {
      boardId: board.id,
      title: "Dupe",
    });
    const target = await createFeedback(db, ws, {
      boardId: board.id,
      title: "Original",
    });
    await mergeFeedback(db, ws, source.id, target.id);
    expect(await ideaPathStatus(db, pub, "ideas", source.slug)).toEqual({
      redirect: `/ideas/ideas/${target.slug}`,
    });
    expect(await publicPathStatus(db, pub, ["ideas", "ideas", "nope"])).toBe(
      "missing",
    );
    expect(await publicPathStatus(db, pub, ["ideas", "ideas"])).toBe("ok");
  });

  it("hides everything when Ideas is switched off or the board is private", async () => {
    const item = await createFeedback(db, ws, {
      boardId: board.id,
      title: "Switch",
    });
    await updatePublicSite(db, ws, {
      showRoadmap: true,
      showIdeas: false,
      showUpdates: true,
      commentsEnabled: false,
      approveComments: false,
      followsEnabled: false,
      termsUrl: "",
      privacyUrl: "",
    });
    expect((await getPublicWorkspace(db, pub, "ideas"))?.modules.ideas).toBe(
      false,
    );
    expect(await getVotableIdea(db, pub, item.id)).toBeNull();
    expect(await publicPathStatus(db, pub, ["ideas", "ideas"])).toBe("missing");
    await expect(
      submitIdea(db, pub, {
        workspaceId: ws.workspaceId,
        board: board.slug,
        title: "Nope",
        details: "",
        trackedUserId: voterId,
        source: "public",
      }),
    ).rejects.toThrow();
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

  it("another account can't see, vote on or submit to these ideas", async () => {
    const item = await createFeedback(db, ws, {
      boardId: board.id,
      title: "Ours",
    });
    expect(await getPublicIdeas(db, pubB, ws.workspaceId, {})).toBeNull();
    expect(await getPublicIdea(db, pubB, ws.workspaceId, item.slug)).toBeNull();
    expect(await getVotableIdea(db, pubB, item.id)).toBeNull();
    await expect(
      submitIdea(db, pubB, {
        workspaceId: ws.workspaceId,
        board: board.slug,
        title: "Sneaky",
        details: "",
        trackedUserId: voterId,
        source: "public",
      }),
    ).rejects.toThrow();
    expect((await getFeedback(db, ws, item.id)).voteCount).toBe(0);
    expect(wsB.workspaceId).not.toBe(ws.workspaceId);
  });
});
