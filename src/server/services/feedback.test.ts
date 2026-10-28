import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  feedbackBoards,
  feedbackItems,
  feedbackStatuses,
  roadmapCards,
  votes,
  workspaces,
} from "@/server/db/schema";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { listBoardCards, moveCard, setCardCompleted } from "./cards";
import {
  type AccountContext,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import {
  bulkUpdateFeedback,
  createFeedback,
  deleteFeedback,
  duplicateFeedback,
  firstStatusOfKind,
  getFeedback,
  getFeedbackDetail,
  inboxCount,
  listBoards,
  listFeedback,
  listStatuses,
  mergeFeedback,
  reviewFeedback,
  searchFeedback,
  setFeedbackArchived,
  setFeedbackCompleted,
  updateFeedback,
} from "./feedback";
import {
  createBoard,
  createStatus,
  DEFAULT_BOARD,
  DEFAULT_STATUSES,
  deleteBoard,
  deleteStatus,
  moveStatus,
  updateBoard,
} from "./feedback-boards";
import {
  linkCard,
  linkedCards,
  linkedFeedback,
  pushToRoadmap,
  searchCards,
  unlinkCard,
} from "./feedback-links";
import {
  createTag,
  listCategories,
  listColumns,
  listRoadmaps,
} from "./roadmaps";
import { createWorkspace } from "./workspaces";

let ctx: AccountContext;
let workspaceId: string;
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const account = await createTestAccount(db, "fb");
  const owner = await createTestUser(db, "fb-owner");
  accounts.push(account);
  users.push(owner);
  ctx = await addTestMember(db, account, owner, "owner");
  const ws = await createWorkspace(db, ctx, { name: "Feedback", slug: "fb" });
  workspaceId = ws.id;
});

afterAll(async () => {
  await cleanup(db, accounts, users);
});

async function newItem() {
  const [board] = await db
    .select()
    .from(feedbackBoards)
    .where(eq(feedbackBoards.workspaceId, workspaceId));
  const [status] = await db
    .select()
    .from(feedbackStatuses)
    .where(eq(feedbackStatuses.workspaceId, workspaceId));
  const [item] = await db
    .insert(feedbackItems)
    .values({
      accountId: ctx.accountId,
      workspaceId,
      boardId: board?.id as string,
      statusId: status?.id as string,
      slug: `item-${Date.now()}-${Math.random()}`,
      title: "An idea",
    })
    .returning();
  return item as NonNullable<typeof item>;
}

describe("workspace defaults", () => {
  it("seeds one public board and the default statuses", async () => {
    const boards = await db
      .select()
      .from(feedbackBoards)
      .where(eq(feedbackBoards.workspaceId, workspaceId));
    expect(boards).toHaveLength(1);
    expect(boards[0]).toMatchObject({
      ...DEFAULT_BOARD,
      isPublic: true,
      autoPublish: false,
    });

    const statuses = await db
      .select({ name: feedbackStatuses.name, kind: feedbackStatuses.kind })
      .from(feedbackStatuses)
      .where(eq(feedbackStatuses.workspaceId, workspaceId))
      .orderBy(asc(feedbackStatuses.position));
    expect(statuses).toEqual(
      DEFAULT_STATUSES.map(({ name, kind }) => ({ name, kind })),
    );
  });

  it("new items start pending with no votes", async () => {
    const item = await newItem();
    expect(item.review).toBe("pending");
    expect(item.voteCount).toBe(0);
  });
});

describe("votes target", () => {
  it("accepts a feedback vote and rejects both or neither target", async () => {
    const item = await newItem();
    const base = {
      accountId: ctx.accountId,
      workspaceId,
      visitorId: `v-${Math.random()}`,
    };
    await db.insert(votes).values({ ...base, feedbackId: item.id });

    const [card] = await db
      .select({ id: roadmapCards.id })
      .from(roadmapCards)
      .limit(1);
    await expect(db.insert(votes).values({ ...base })).rejects.toThrow();
    if (card) {
      await expect(
        db
          .insert(votes)
          .values({ ...base, cardId: card.id, feedbackId: item.id }),
      ).rejects.toThrow();
    }
  });

  it("one anonymous vote per visitor per feedback item", async () => {
    const item = await newItem();
    const vote = {
      accountId: ctx.accountId,
      workspaceId,
      feedbackId: item.id,
      visitorId: "same-visitor",
    };
    await db.insert(votes).values(vote);
    await expect(db.insert(votes).values(vote)).rejects.toThrow();
  });

  it("impact and effort must be 1–5", async () => {
    const item = await newItem();
    await expect(
      db
        .update(feedbackItems)
        .set({ impact: 6 })
        .where(eq(feedbackItems.id, item.id)),
    ).rejects.toThrow();
  });
});

describe("cleanup", () => {
  it("deleting a workspace removes its boards, statuses and items", async () => {
    const ws = await createWorkspace(db, ctx, { name: "Gone", slug: "gone" });
    const [board] = await db
      .select()
      .from(feedbackBoards)
      .where(eq(feedbackBoards.workspaceId, ws.id));
    const [status] = await db
      .select()
      .from(feedbackStatuses)
      .where(eq(feedbackStatuses.workspaceId, ws.id));
    await db.insert(feedbackItems).values({
      accountId: ctx.accountId,
      workspaceId: ws.id,
      boardId: board?.id as string,
      statusId: status?.id as string,
      slug: "x",
      title: "x",
    });
    await db.delete(workspaces).where(eq(workspaces.id, ws.id));
    const left = await db
      .select()
      .from(feedbackItems)
      .where(
        and(
          eq(feedbackItems.accountId, ctx.accountId),
          eq(feedbackItems.workspaceId, ws.id),
        ),
      );
    expect(left).toHaveLength(0);
  });
});

describe("feedback service", () => {
  let wsA: WorkspaceContext;
  let wsB: WorkspaceContext;
  let boardA: string;

  beforeAll(async () => {
    wsA = { ...ctx, workspaceId, workspaceSlug: "fb" };
    const accountB = await createTestAccount(db, "fb-b");
    const ownerB = await createTestUser(db, "fb-b-owner");
    accounts.push(accountB);
    users.push(ownerB);
    const ctxB = await addTestMember(db, accountB, ownerB, "owner");
    const ws = await createWorkspace(db, ctxB, {
      name: "Board B",
      slug: "fb-b",
    });
    wsB = { ...ctxB, workspaceId: ws.id, workspaceSlug: ws.slug };
    boardA = (await listBoards(db, wsA))[0]?.id as string;
  });

  it("creates approved items with the first status and a unique slug", async () => {
    const a = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "Dark mode",
    });
    const b = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "Dark mode",
    });
    const [first] = await listStatuses(db, wsA);
    expect(a.review).toBe("approved");
    expect(a.statusId).toBe(first?.id);
    expect(a.authorUserId).toBe(wsA.userId);
    expect(b.slug).toBe(`${a.slug}-2`);
  });

  it("another account can't read, change, list or delete the item", async () => {
    const item = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "Secret",
    });
    await expect(getFeedback(db, wsB, item.id)).rejects.toThrow(NotFoundError);
    await expect(
      updateFeedback(db, wsB, { id: item.id, title: "Hacked" }),
    ).rejects.toThrow(NotFoundError);
    await expect(deleteFeedback(db, wsB, item.id)).rejects.toThrow(
      NotFoundError,
    );
    await expect(setFeedbackArchived(db, wsB, item.id, true)).rejects.toThrow(
      NotFoundError,
    );
    expect((await listFeedback(db, wsB)).map((r) => r.id)).not.toContain(
      item.id,
    );
    await expect(
      createFeedback(db, wsB, { boardId: boardA, title: "x" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects another workspace's board, status, category and tags", async () => {
    const item = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "Mine",
    });
    const [boardB] = await listBoards(db, wsB);
    const [statusB] = await listStatuses(db, wsB);
    const [categoryB] = await listCategories(db, wsB);
    const tagB = await createTag(db, wsB, { name: "b-tag" });
    await expect(
      updateFeedback(db, wsA, { id: item.id, boardId: boardB?.id }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      updateFeedback(db, wsA, { id: item.id, statusId: statusB?.id }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      updateFeedback(db, wsA, { id: item.id, categoryId: categoryB?.id }),
    ).rejects.toThrow(NotFoundError);
    await updateFeedback(db, wsA, { id: item.id, tagIds: [tagB.id] });
    expect((await getFeedbackDetail(db, wsA, item.id)).tagIds).toEqual([]);
  });

  it("a done status completes the item; reopen goes back to the first open status", async () => {
    const item = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "Ship it",
    });
    const done = await firstStatusOfKind(db, wsA, "done");
    const row = await updateFeedback(db, wsA, {
      id: item.id,
      statusId: done?.id,
    });
    expect(row.completedAt).not.toBeNull();

    const reopened = await setFeedbackCompleted(db, wsA, item.id, false);
    expect(reopened.completedAt).toBeNull();
    expect(reopened.statusId).toBe(
      (await firstStatusOfKind(db, wsA, "open"))?.id,
    );

    const completed = await setFeedbackCompleted(db, wsA, item.id, true);
    expect(completed.statusId).toBe(done?.id);
    const open = await listFeedback(db, wsA, { state: "open" });
    expect(open.map((r) => r.id)).not.toContain(item.id);
    const finished = await listFeedback(db, wsA, { state: "completed" });
    expect(finished.map((r) => r.id)).toContain(item.id);
  });

  it("filters by search, priority and archive state, and sorts by priority", async () => {
    const quick = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "Zebra export",
    });
    const sink = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "Rewrite everything",
    });
    await updateFeedback(db, wsA, { id: quick.id, impact: 5, effort: 1 });
    await updateFeedback(db, wsA, { id: sink.id, impact: 1, effort: 5 });

    expect(
      (await listFeedback(db, wsA, { q: "zebra" })).map((r) => r.id),
    ).toEqual([quick.id]);
    const quickWins = await listFeedback(db, wsA, { priority: "quick_wins" });
    expect(quickWins.map((r) => r.id)).toEqual([quick.id]);
    expect(quickWins[0]?.priority).toBe(10);
    const sinks = await listFeedback(db, wsA, { priority: "time_sinks" });
    expect(sinks.map((r) => r.id)).toEqual([sink.id]);

    const sorted = await listFeedback(db, wsA, { sort: "priority" });
    expect(sorted.findIndex((r) => r.id === quick.id)).toBeLessThan(
      sorted.findIndex((r) => r.id === sink.id),
    );

    await setFeedbackArchived(db, wsA, sink.id, true);
    expect((await listFeedback(db, wsA)).map((r) => r.id)).not.toContain(
      sink.id,
    );
    expect(
      (await listFeedback(db, wsA, { state: "archived" })).map((r) => r.id),
    ).toContain(sink.id);
  });
});

describe("triage, bulk edits, boards and statuses", () => {
  let wsA: WorkspaceContext;
  let wsB: WorkspaceContext;
  let memberA: WorkspaceContext;
  let boardA: string;

  beforeAll(async () => {
    wsA = { ...ctx, workspaceId, workspaceSlug: "fb" };
    const accountB = await createTestAccount(db, "fb-tri-b");
    const ownerB = await createTestUser(db, "fb-tri-b-owner");
    const mate = await createTestUser(db, "fb-tri-member");
    accounts.push(accountB);
    users.push(ownerB, mate);
    const ctxB = await addTestMember(db, accountB, ownerB, "owner");
    const ws = await createWorkspace(db, ctxB, {
      name: "Tri B",
      slug: "tri-b",
    });
    wsB = { ...ctxB, workspaceId: ws.id, workspaceSlug: ws.slug };
    const m = await addTestMember(db, ctx.accountId, mate, "member");
    memberA = { ...m, workspaceId, workspaceSlug: "fb" };
    boardA = (await listBoards(db, wsA))[0]?.id as string;
  });

  async function pending(title: string) {
    const item = await createFeedback(db, wsA, { boardId: boardA, title });
    await db
      .update(feedbackItems)
      .set({ review: "pending" })
      .where(eq(feedbackItems.id, item.id));
    return item;
  }

  it("counts the inbox and approves, keeps private or rejects in bulk", async () => {
    const before = await inboxCount(db, wsA);
    const [a, b, c] = [
      await pending("A"),
      await pending("B"),
      await pending("C"),
    ];
    expect(await inboxCount(db, wsA)).toBe(before + 3);
    const inbox = await listFeedback(db, wsA, {
      review: "pending",
      state: "all",
    });
    expect(inbox.map((r) => r.id)).toEqual(
      expect.arrayContaining([a.id, b.id, c.id]),
    );

    expect(await reviewFeedback(db, wsA, [a.id], "approve")).toBe(1);
    expect(await reviewFeedback(db, wsA, [b.id], "keep_private")).toBe(1);
    expect(await reviewFeedback(db, wsA, [c.id], "reject")).toBe(1);
    expect(await inboxCount(db, wsA)).toBe(before);

    const [ra, rb, rc] = await Promise.all(
      [a, b, c].map((i) => getFeedback(db, wsA, i.id)),
    );
    expect(ra).toMatchObject({ review: "approved", isPublic: true });
    expect(rb).toMatchObject({ review: "approved", isPublic: false });
    expect(rc?.review).toBe("rejected");
    expect(rc?.archivedAt).not.toBeNull();
  });

  it("another account can't review, bulk edit or count this inbox", async () => {
    const item = await pending("Not yours");
    expect(await reviewFeedback(db, wsB, [item.id], "approve")).toBe(0);
    expect(
      await bulkUpdateFeedback(db, wsB, { ids: [item.id], categoryId: null }),
    ).toBe(0);
    expect((await getFeedback(db, wsA, item.id)).review).toBe("pending");
    expect(await inboxCount(db, wsB)).toBe(0);
  });

  it("bulk sets status and category and adds tags", async () => {
    const [x, y] = [await pending("X"), await pending("Y")];
    const done = await firstStatusOfKind(db, wsA, "done");
    const [category] = await listCategories(db, wsA);
    const tag = await createTag(db, wsA, { name: "bulk-tag" });
    const n = await bulkUpdateFeedback(db, wsA, {
      ids: [x.id, y.id],
      statusId: done?.id,
      categoryId: category?.id,
      addTagIds: [tag.id],
    });
    expect(n).toBe(2);
    const detail = await getFeedbackDetail(db, wsA, x.id);
    expect(detail).toMatchObject({
      statusId: done?.id,
      categoryId: category?.id,
    });
    expect(detail.completedAt).not.toBeNull();
    expect(detail.tagIds).toContain(tag.id);
    // Adding the same tag again is a no-op, not an error.
    await bulkUpdateFeedback(db, wsA, { ids: [x.id], addTagIds: [tag.id] });
  });

  it("boards: admin-only settings; can't delete a board with items or the last one", async () => {
    await expect(
      createBoard(db, memberA, { name: "Members can't" }),
    ).rejects.toThrow(ForbiddenError);
    const board = await createBoard(db, wsA, { name: "Bug reports" });
    expect(board.slug).toBe("bug-reports");
    await expect(createBoard(db, wsA, { name: "Bug reports" })).rejects.toThrow(
      ConflictError,
    );
    const updated = await updateBoard(db, wsA, {
      id: board.id,
      name: "Bugs",
      slug: "bugs",
      description: null,
      isPublic: false,
      autoPublish: true,
    });
    expect(updated).toMatchObject({
      slug: "bugs",
      isPublic: false,
      autoPublish: true,
    });
    await expect(
      updateBoard(db, wsB, { ...updated, description: null }),
    ).rejects.toThrow(NotFoundError);

    await createFeedback(db, wsA, { boardId: board.id, title: "Crash" });
    await expect(deleteBoard(db, wsA, board.id)).rejects.toThrow(ConflictError);
    const [onlyB] = await listBoards(db, wsB);
    await expect(deleteBoard(db, wsB, onlyB?.id as string)).rejects.toThrow(
      ConflictError,
    );
  });

  it("statuses: create, reorder, and only delete unused ones", async () => {
    const status = await createStatus(db, wsA, {
      name: "Needs info",
      color: "#f59e0b",
      kind: "open",
    });
    const first = (await listStatuses(db, wsA))[0];
    await moveStatus(db, wsA, {
      id: status.id,
      prevId: null,
      nextId: first?.id ?? null,
    });
    expect((await listStatuses(db, wsA))[0]?.id).toBe(status.id);

    const item = await createFeedback(db, wsA, { boardId: boardA, title: "Q" });
    await updateFeedback(db, wsA, { id: item.id, statusId: status.id });
    await expect(deleteStatus(db, wsA, status.id)).rejects.toThrow(
      ConflictError,
    );
    await updateFeedback(db, wsA, { id: item.id, statusId: first?.id });
    await deleteStatus(db, wsA, status.id);
    await expect(deleteStatus(db, wsB, first?.id as string)).rejects.toThrow(
      NotFoundError,
    );
    await expect(
      createStatus(db, memberA, {
        name: "Nope",
        color: "#000000",
        kind: "open",
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("roadmap links, status sync, merge and duplicate", () => {
  let wsA: WorkspaceContext;
  let wsB: WorkspaceContext;
  let boardA: string;
  let columns: Awaited<ReturnType<typeof listColumns>>;

  beforeAll(async () => {
    wsA = { ...ctx, workspaceId, workspaceSlug: "fb" };
    const accountB = await createTestAccount(db, "fb-link-b");
    const ownerB = await createTestUser(db, "fb-link-b-owner");
    accounts.push(accountB);
    users.push(ownerB);
    const ctxB = await addTestMember(db, accountB, ownerB, "owner");
    const ws = await createWorkspace(db, ctxB, {
      name: "Link B",
      slug: "link-b",
    });
    wsB = { ...ctxB, workspaceId: ws.id, workspaceSlug: ws.slug };
    boardA = (await listBoards(db, wsA))[0]?.id as string;
    const [roadmap] = await listRoadmaps(db, wsA);
    columns = await listColumns(db, wsA, roadmap?.id as string);
  });

  const column = (name: string) =>
    columns.find((c) => c.name === name)?.id as string;
  const kindOf = async (statusId: string) =>
    (await listStatuses(db, wsA)).find((s) => s.id === statusId)?.kind;

  it("push to roadmap creates one linked card and plans the feedback", async () => {
    const item = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "Webhooks",
    });
    await updateFeedback(db, wsA, {
      id: item.id,
      summaryJson: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Please" }] },
        ],
      },
    });
    const card = await pushToRoadmap(db, wsA, {
      feedbackId: item.id,
      columnId: column("Up next"),
      title: "Outgoing webhooks",
    });
    expect(card).toMatchObject({
      title: "Outgoing webhooks",
      summaryText: "Please",
    });
    expect((await linkedCards(db, wsA, item.id)).map((c) => c.id)).toEqual([
      card.id,
    ]);
    expect((await linkedFeedback(db, wsA, card.id)).map((f) => f.id)).toEqual([
      item.id,
    ]);
    expect(await kindOf((await getFeedback(db, wsA, item.id)).statusId)).toBe(
      "planned",
    );
    const board = await listBoardCards(db, wsA, card.roadmapId);
    expect(board.find((c) => c.id === card.id)?.ideas).toBe(1);
  });

  it("moving the card to done completes linked feedback; moving back reopens it", async () => {
    const item = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "SSO",
    });
    const card = await pushToRoadmap(db, wsA, {
      feedbackId: item.id,
      columnId: column("Up next"),
      title: "SSO",
    });
    await moveCard(db, wsA, {
      id: card.id,
      columnId: column("Done"),
      prevId: null,
      nextId: null,
    });
    let row = await getFeedback(db, wsA, item.id);
    expect(await kindOf(row.statusId)).toBe("done");
    expect(row.completedAt).not.toBeNull();

    await moveCard(db, wsA, {
      id: card.id,
      columnId: column("In progress"),
      prevId: null,
      nextId: null,
    });
    row = await getFeedback(db, wsA, item.id);
    expect(await kindOf(row.statusId)).toBe("in_progress");
    expect(row.completedAt).toBeNull();

    await setCardCompleted(db, wsA, card.id, true);
    expect(await kindOf((await getFeedback(db, wsA, item.id)).statusId)).toBe(
      "done",
    );
  });

  it("linking keeps a manual status; linking twice is a no-op; unlink works", async () => {
    const item = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "Manual",
    });
    const inProgress = await firstStatusOfKind(db, wsA, "in_progress");
    await updateFeedback(db, wsA, { id: item.id, statusId: inProgress?.id });
    const [card] = await searchCards(db, wsA, "Outgoing");
    await linkCard(db, wsA, item.id, card?.id as string);
    await linkCard(db, wsA, item.id, card?.id as string);
    expect((await getFeedback(db, wsA, item.id)).statusId).toBe(inProgress?.id);
    expect(await linkedCards(db, wsA, item.id)).toHaveLength(1);
    await unlinkCard(db, wsA, item.id, card?.id as string);
    expect(await linkedCards(db, wsA, item.id)).toHaveLength(0);
  });

  it("another account can't push, link, list or merge across accounts", async () => {
    const item = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "Mine only",
    });
    const [cardB] = await searchCards(db, wsB, "");
    await expect(
      pushToRoadmap(db, wsB, {
        feedbackId: item.id,
        columnId: column("Up next"),
        title: "x",
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      pushToRoadmap(db, wsA, {
        feedbackId: item.id,
        columnId: (
          await listColumns(
            db,
            wsB,
            (
              await listRoadmaps(db, wsB)
            )[0]?.id as string,
          )
        )[0]?.id as string,
        title: "x",
      }),
    ).rejects.toThrow(NotFoundError);
    if (cardB) {
      await expect(linkCard(db, wsA, item.id, cardB.id)).rejects.toThrow(
        NotFoundError,
      );
    }
    const [cardA] = await searchCards(db, wsA, "Outgoing");
    expect(await linkedFeedback(db, wsB, cardA?.id as string)).toEqual([]);
    expect(await searchCards(db, wsB, "Outgoing")).toEqual([]);
    const other = await createFeedback(db, wsB, {
      boardId: (await listBoards(db, wsB))[0]?.id as string,
      title: "B",
    });
    await expect(mergeFeedback(db, wsA, item.id, other.id)).rejects.toThrow(
      NotFoundError,
    );
    expect(
      (await searchFeedback(db, wsB, "Mine only")).map((r) => r.id),
    ).toEqual([]);
  });

  it("merge moves votes without duplicates, sums imported votes and archives the source", async () => {
    const source = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "Dup A",
    });
    const target = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "Dup B",
    });
    await db
      .update(feedbackItems)
      .set({ importedVotes: 4 })
      .where(eq(feedbackItems.id, source.id));
    const vote = (feedbackId: string, visitorId: string) => ({
      accountId: ctx.accountId,
      workspaceId,
      feedbackId,
      visitorId,
    });
    await db
      .insert(votes)
      .values([
        vote(source.id, "v-shared"),
        vote(source.id, "v-only-source"),
        vote(target.id, "v-shared"),
      ]);
    await db
      .update(feedbackItems)
      .set({ voteCount: 2 })
      .where(eq(feedbackItems.id, source.id));
    await db
      .update(feedbackItems)
      .set({ voteCount: 1 })
      .where(eq(feedbackItems.id, target.id));
    const [card] = await searchCards(db, wsA, "Outgoing");
    await linkCard(db, wsA, source.id, card?.id as string);

    const merged = await mergeFeedback(db, wsA, source.id, target.id);
    expect(merged.voteCount).toBe(2);
    expect(merged.importedVotes).toBe(4);
    const rows = await db
      .select()
      .from(votes)
      .where(eq(votes.feedbackId, target.id));
    expect(rows.map((r) => r.visitorId).sort()).toEqual([
      "v-only-source",
      "v-shared",
    ]);
    const gone = await getFeedback(db, wsA, source.id);
    expect(gone).toMatchObject({
      mergedIntoId: target.id,
      voteCount: 0,
      importedVotes: 0,
    });
    expect(gone.archivedAt).not.toBeNull();
    expect((await linkedCards(db, wsA, target.id)).map((c) => c.id)).toContain(
      card?.id,
    );
    expect(await linkedCards(db, wsA, source.id)).toEqual([]);

    await expect(mergeFeedback(db, wsA, target.id, target.id)).rejects.toThrow(
      ConflictError,
    );
    await expect(mergeFeedback(db, wsA, target.id, source.id)).rejects.toThrow(
      ConflictError,
    );
    expect((await searchFeedback(db, wsA, "Dup")).map((r) => r.id)).toEqual([
      target.id,
    ]);
  });

  it("duplicate copies content and tags but not votes", async () => {
    const item = await createFeedback(db, wsA, {
      boardId: boardA,
      title: "Copy me",
    });
    const tag = await createTag(db, wsA, { name: "copy-tag" });
    await updateFeedback(db, wsA, { id: item.id, tagIds: [tag.id], impact: 3 });
    await db
      .update(feedbackItems)
      .set({ voteCount: 7 })
      .where(eq(feedbackItems.id, item.id));
    const copy = await duplicateFeedback(db, wsA, item.id);
    expect(copy).toMatchObject({
      title: "Copy me (copy)",
      voteCount: 0,
      impact: 3,
      review: "approved",
    });
    expect((await getFeedbackDetail(db, wsA, copy.id)).tagIds).toEqual([
      tag.id,
    ]);
    await expect(duplicateFeedback(db, wsB, item.id)).rejects.toThrow(
      NotFoundError,
    );
  });
});
