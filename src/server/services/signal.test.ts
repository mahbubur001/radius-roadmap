import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { roadmapCards, updateCards, updates, votes } from "@/server/db/schema";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { createCard, setCardCompleted } from "./cards";
import type { WorkspaceContext } from "./context";
import { createFeedback, listBoards } from "./feedback";
import { listColumns, listRoadmaps } from "./roadmaps";
import {
  loudest,
  needsYou,
  outcomes,
  recentActivity,
  shippedNotAnnounced,
  signalCounts,
} from "./signal";
import { createWorkspace } from "./workspaces";

const accounts: string[] = [];
const users: string[] = [];
let mine: WorkspaceContext;
let other: WorkspaceContext;
let loudCard: string;
let shippedCard: string;

async function workspace(label: string): Promise<WorkspaceContext> {
  const account = await createTestAccount(db, label);
  const owner = await createTestUser(db, `${label}-owner`);
  accounts.push(account);
  users.push(owner);
  const ctx = await addTestMember(db, account, owner, "owner");
  const ws = await createWorkspace(db, ctx, { name: label, slug: label });
  return { ...ctx, workspaceId: ws.id, workspaceSlug: ws.slug };
}

beforeAll(async () => {
  mine = await workspace("signal-a");
  other = await workspace("signal-b");

  const [board] = await listBoards(db, mine);
  await createFeedback(db, mine, {
    boardId: board?.id as string,
    title: "Export to CSV",
  });
  const [roadmap] = await listRoadmaps(db, mine);
  // Default columns: In progress (in_progress), Up next (planned), …
  const [inProgress, upNext] = await listColumns(
    db,
    mine,
    roadmap?.id as string,
  );
  const card = (columnId: string, title: string) =>
    createCard(db, mine, {
      roadmapId: roadmap?.id as string,
      columnId,
      title,
    });
  loudCard = (await card(upNext?.id as string, "Mobile app")).id;
  await card(inProgress?.id as string, "Public API");
  shippedCard = (await card(inProgress?.id as string, "Dark mode")).id;
  const told = (await card(inProgress?.id as string, "Slack alerts")).id;
  await setCardCompleted(db, mine, shippedCard, true);
  await setCardCompleted(db, mine, told, true);

  const [post] = await db
    .insert(updates)
    .values({
      accountId: mine.accountId,
      workspaceId: mine.workspaceId,
      slug: "slack-alerts",
      title: "Slack alerts",
      status: "published",
      publishedAt: new Date(),
    })
    .returning();
  await db
    .insert(updateCards)
    .values({ updateId: post?.id as string, cardId: told });

  await db.insert(votes).values(
    ["v1", "v2"].map((visitorId) => ({
      accountId: mine.accountId,
      workspaceId: mine.workspaceId,
      cardId: loudCard,
      visitorId,
    })),
  );
  await db
    .update(roadmapCards)
    .set({ voteCount: 2 })
    .where(eq(roadmapCards.id, loudCard));
});

afterAll(async () => {
  await cleanup(db, accounts, users);
});

describe("signalCounts", () => {
  it("counts each stage", async () => {
    const s = await signalCounts(db, mine, "1m");
    expect(s.new.count).toBe(1);
    expect(s.review.count).toBe(1); // team ideas skip the inbox
    expect(s.planned.count).toBe(1);
    expect(s.in_progress.count).toBe(1);
    expect(s.shipped.count).toBe(2);
    expect(s.announced).toEqual({ count: 1, waiting: 1 });
  });

  it("sees nothing of another account", async () => {
    const s = await signalCounts(db, other, "1m");
    expect(s.new.count).toBe(0);
    expect(s.shipped.count).toBe(0);
    expect(s.planned.count).toBe(0);
  });
});

describe("Home lists", () => {
  it("lists shipped cards nobody announced", async () => {
    const rows = await shippedNotAnnounced(db, mine);
    expect(rows.map((r) => r.id)).toEqual([shippedCard]);
    expect(await shippedNotAnnounced(db, other)).toEqual([]);
  });

  it("ranks the loudest requests with votes per week", async () => {
    const [top] = await loudest(db, mine);
    expect(top).toMatchObject({
      kind: "card",
      id: loudCard,
      votes: 2,
      stage: "planned",
    });
    expect(top?.weeks).toHaveLength(8);
    expect(top?.weeks[7]).toBe(2);
    expect(await loudest(db, other)).toEqual([]);
  });

  it("needs-you queue, outcomes and activity stay in the workspace", async () => {
    const queue = await needsYou(db, mine);
    expect(queue.inbox.count).toBe(0);
    expect(queue.scheduled).toBeNull();
    const o = await outcomes(db, mine, "1m");
    expect(o).toMatchObject({
      shipped: 2,
      announced: 1,
      loopClosed: 50,
      voters: 2,
    });
    expect((await outcomes(db, other, "1m")).voters).toBe(0);
    expect((await recentActivity(db, mine)).map((a) => a.title)).toEqual([
      "Mobile app",
      "Mobile app",
    ]);
    expect(await recentActivity(db, other)).toEqual([]);
  });
});
