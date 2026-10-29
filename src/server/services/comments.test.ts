import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { createCard } from "./cards";
import {
  addPublicComment,
  addTeamComment,
  approveComment,
  deleteComment,
  followedIdeaIds,
  listPendingComments,
  listPublicComments,
  listTeamComments,
  pendingCommentCount,
  setIdeaFollow,
  updateTeamComment,
} from "./comments";
import {
  ForbiddenError,
  NotFoundError,
  type PublicContext,
  type WorkspaceContext,
} from "./context";
import { createFeedback, getFeedback, listBoards } from "./feedback";
import { listColumns, listRoadmaps } from "./roadmaps";
import { guestSignIn } from "./voter-auth";
import { createWorkspace } from "./workspaces";

// Comments on ideas and cards + idea follows (doc 20 D3, step 7).

let owner: WorkspaceContext;
let member: WorkspaceContext;
let other: WorkspaceContext;
let pub: PublicContext;
let visitorId: string;
let boardId: string;
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "cmt-a"),
    await createTestAccount(db, "cmt-b"),
  ];
  const [oA, oB, m] = [
    await createTestUser(db, "cmt-owner-a"),
    await createTestUser(db, "cmt-owner-b"),
    await createTestUser(db, "cmt-member"),
  ];
  accounts.push(a, b);
  users.push(oA, oB, m);
  const ctxA = await addTestMember(db, a, oA, "owner");
  const ctxB = await addTestMember(db, b, oB, "owner");
  const ctxM = await addTestMember(db, a, m, "member");
  const ws = await createWorkspace(db, ctxA, { name: "Cmt", slug: "cmt" });
  const wsB = await createWorkspace(db, ctxB, { name: "Oth", slug: "oth" });
  owner = { ...ctxA, workspaceId: ws.id, workspaceSlug: ws.slug };
  member = { ...ctxM, workspaceId: ws.id, workspaceSlug: ws.slug };
  other = { ...ctxB, workspaceId: wsB.id, workspaceSlug: wsB.slug };
  pub = { accountId: a };
  boardId = (await listBoards(db, owner))[0]?.id ?? "";
  visitorId = (await guestSignIn(db, pub, { name: "Vic", email: "vic@x.test" }))
    .id;
});

afterAll(() => cleanup(db, accounts, users));

async function idea(title: string) {
  return createFeedback(db, owner, { boardId, title });
}

describe("comments on ideas", () => {
  it("shows approved public comments and team replies, never internal notes or pending ones", async () => {
    const item = await idea("Commented");
    const target = { feedbackId: item.id };
    await addPublicComment(db, pub, {
      target,
      workspaceId: owner.workspaceId,
      body: "Love it",
      trackedUserId: visitorId,
      holdForApproval: false,
    });
    const held = await addPublicComment(db, pub, {
      target,
      workspaceId: owner.workspaceId,
      body: "Spam?",
      trackedUserId: visitorId,
      holdForApproval: true,
    });
    await addTeamComment(db, member, {
      target,
      body: "On it",
      internal: false,
    });
    await addTeamComment(db, member, {
      target,
      body: "Secret plan",
      internal: true,
    });

    const shown = await listPublicComments(db, pub, target);
    expect(shown.map((c) => c.body)).toEqual(["Love it", "On it"]);
    expect(shown[0]).toMatchObject({ author: "Vic", team: false });
    expect(shown[1]?.team).toBe(true);
    expect((await getFeedback(db, owner, item.id)).commentCount).toBe(2);

    // The team sees everything, flagged.
    const team = await listTeamComments(db, owner, target);
    expect(team.find((c) => c.body === "Spam?")?.pending).toBe(true);
    expect(team.find((c) => c.body === "Secret plan")?.internal).toBe(true);

    // Approving publishes it and updates the count.
    expect(await pendingCommentCount(db, owner)).toBeGreaterThan(0);
    expect((await listPendingComments(db, owner)).map((c) => c.id)).toContain(
      held.id,
    );
    await approveComment(db, member, held.id);
    expect((await listPublicComments(db, pub, target)).length).toBe(3);
    expect((await getFeedback(db, owner, item.id)).commentCount).toBe(3);

    // Deleting removes it from the public list and the count.
    await deleteComment(db, member, held.id);
    expect((await getFeedback(db, owner, item.id)).commentCount).toBe(2);
  });

  it("authors edit their own; team comments are deleted by the author or an admin", async () => {
    const item = await idea("Edits");
    const target = { feedbackId: item.id };
    const mine = await addTeamComment(db, member, {
      target,
      body: "Draft",
      internal: false,
    });
    await updateTeamComment(db, member, { id: mine.id, body: "Final" });
    await expect(
      updateTeamComment(db, owner, { id: mine.id, body: "Owner edit" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const ownerNote = await addTeamComment(db, owner, {
      target,
      body: "Owner",
      internal: true,
    });
    await expect(
      deleteComment(db, member, ownerNote.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await deleteComment(db, owner, mine.id);
    expect(
      (await listTeamComments(db, owner, target)).map((c) => c.id),
    ).toEqual([ownerNote.id]);
  });

  it("another account can't read, add, approve or delete them", async () => {
    const item = await idea("Private talk");
    const target = { feedbackId: item.id };
    const note = await addTeamComment(db, owner, {
      target,
      body: "Hi",
      internal: false,
    });
    await expect(listTeamComments(db, other, target)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      addTeamComment(db, other, { target, body: "x", internal: false }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(approveComment(db, other, note.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(deleteComment(db, other, note.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(
      await listPublicComments(db, { accountId: other.accountId }, target),
    ).toEqual([]);
  });
});

describe("comments on cards", () => {
  it("work the same way, without a cached count", async () => {
    const [roadmap] = await listRoadmaps(db, owner);
    const [column] = await listColumns(db, owner, roadmap?.id ?? "");
    const card = await createCard(db, owner, {
      roadmapId: roadmap?.id ?? "",
      columnId: column?.id ?? "",
      title: "Card talk",
    });
    const target = { cardId: card.id };
    await addTeamComment(db, owner, { target, body: "Note", internal: true });
    await addPublicComment(db, pub, {
      target,
      workspaceId: owner.workspaceId,
      body: "When?",
      trackedUserId: visitorId,
      holdForApproval: false,
    });
    expect(
      (await listPublicComments(db, pub, target)).map((c) => c.body),
    ).toEqual(["When?"]);
    expect((await listTeamComments(db, owner, target)).length).toBe(2);
  });
});

describe("idea follows", () => {
  it("follows and unfollows, scoped to the account", async () => {
    const item = await idea("Followed");
    await setIdeaFollow(db, pub, item.id, visitorId, true);
    await setIdeaFollow(db, pub, item.id, visitorId, true);
    expect(
      await followedIdeaIds(db, pub, owner.workspaceId, visitorId),
    ).toContain(item.id);
    expect(
      await followedIdeaIds(
        db,
        { accountId: other.accountId },
        owner.workspaceId,
        visitorId,
      ),
    ).toEqual([]);
    await setIdeaFollow(db, pub, item.id, visitorId, false);
    expect(
      await followedIdeaIds(db, pub, owner.workspaceId, visitorId),
    ).not.toContain(item.id);
  });
});
