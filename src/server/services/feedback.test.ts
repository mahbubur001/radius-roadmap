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
import {
  type AccountContext,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import {
  createFeedback,
  deleteFeedback,
  firstStatusOfKind,
  getFeedback,
  getFeedbackDetail,
  listBoards,
  listFeedback,
  listStatuses,
  setFeedbackArchived,
  setFeedbackCompleted,
  updateFeedback,
} from "./feedback";
import { DEFAULT_BOARD, DEFAULT_STATUSES } from "./feedback-boards";
import { createTag, listCategories } from "./roadmaps";
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
