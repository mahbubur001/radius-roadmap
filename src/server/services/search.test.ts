import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { updateCards, updates } from "@/server/db/schema";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { createArticle } from "./articles";
import { createCard, setCardCompleted } from "./cards";
import type { WorkspaceContext } from "./context";
import { createFeedback, listBoards } from "./feedback";
import { listColumns, listRoadmaps } from "./roadmaps";
import { quickSearch } from "./search";
import { createWorkspace } from "./workspaces";

const accounts: string[] = [];
const users: string[] = [];

/** An account with one workspace holding an idea, a card and an article. */
async function seeded(label: string): Promise<WorkspaceContext> {
  const account = await createTestAccount(db, label);
  const owner = await createTestUser(db, `${label}-owner`);
  accounts.push(account);
  users.push(owner);
  const ctx = await addTestMember(db, account, owner, "owner");
  const ws = await createWorkspace(db, ctx, { name: label, slug: label });
  const wctx = { ...ctx, workspaceId: ws.id, workspaceSlug: ws.slug };
  const [board] = await listBoards(db, wctx);
  await createFeedback(db, wctx, {
    boardId: board?.id as string,
    title: "Dark mode for the widget",
  });
  const [roadmap] = await listRoadmaps(db, wctx);
  const [column] = await listColumns(db, wctx, roadmap?.id as string);
  await createCard(db, wctx, {
    roadmapId: roadmap?.id as string,
    columnId: column?.id as string,
    title: "Dark mode everywhere",
  });
  await createArticle(db, wctx, {});
  return wctx;
}

let mine: WorkspaceContext;

beforeAll(async () => {
  mine = await seeded("search-a");
  await seeded("search-b");
});

afterAll(async () => {
  await cleanup(db, accounts, users);
});

describe("quickSearch", () => {
  it("finds ideas, cards and articles by words and title fragments", async () => {
    const dark = await quickSearch(db, mine, "dark");
    expect(dark.ideas.map((i) => i.title)).toEqual([
      "Dark mode for the widget",
    ]);
    expect(dark.cards.map((c) => c.title)).toEqual(["Dark mode everywhere"]);
    expect(dark.cards[0]?.roadmapSlug).toBeTruthy();
    const untitled = await quickSearch(db, mine, "untit");
    expect(untitled.articles).toHaveLength(1);
  });

  it("gives each result its stage; a card in a published update is announced", async () => {
    const before = await quickSearch(db, mine, "dark");
    expect(before.ideas[0]?.stage).toBe("review"); // team ideas skip the inbox
    expect(before.cards[0]?.stage).toBe("in_progress");
    const card = before.cards[0]?.id as string;
    await setCardCompleted(db, mine, card, true);
    expect((await quickSearch(db, mine, "dark")).cards[0]?.stage).toBe(
      "shipped",
    );
    const [post] = await db
      .insert(updates)
      .values({
        accountId: mine.accountId,
        workspaceId: mine.workspaceId,
        slug: "dark-mode-is-here",
        title: "Dark mode is here",
        status: "published",
        publishedAt: new Date(),
      })
      .returning();
    await db
      .insert(updateCards)
      .values({ updateId: post?.id as string, cardId: card });
    expect((await quickSearch(db, mine, "dark")).cards[0]?.stage).toBe(
      "announced",
    );
  });

  it("never returns another account's data", async () => {
    const result = await quickSearch(db, mine, "dark");
    expect(result.ideas).toHaveLength(1);
    expect(result.cards).toHaveLength(1);
    const other = { ...mine, accountId: accounts[1] as string };
    const leaked = await quickSearch(db, other, "dark");
    expect(leaked.ideas).toHaveLength(0);
    expect(leaked.cards).toHaveLength(0);
  });
});
