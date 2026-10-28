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
import type { AccountContext } from "./context";
import { DEFAULT_BOARD, DEFAULT_STATUSES } from "./feedback-boards";
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
