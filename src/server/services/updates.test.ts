import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { newKey, prefixes } from "@/server/storage/keys";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { createCard, setCardCompleted, updateCard } from "./cards";
import {
  ForbiddenError,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import { listColumns, listRoadmaps } from "./roadmaps";
import { listUpdateCategories } from "./update-categories";
import {
  createUpdate,
  deleteUpdate,
  duplicateUpdate,
  getUpdateDetail,
  listUpdates,
  patchUpdate,
  searchCardsForUpdate,
  setUpdateCards,
  updateCounts,
} from "./updates";
import { createWorkspace } from "./workspaces";

// Update posts (doc 23 step 2).

let ws: WorkspaceContext;
let member: WorkspaceContext;
let other: WorkspaceContext;
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "upd-a"),
    await createTestAccount(db, "upd-b"),
  ];
  const [oA, oB, m] = [
    await createTestUser(db, "upd-owner-a"),
    await createTestUser(db, "upd-owner-b"),
    await createTestUser(db, "upd-member"),
  ];
  accounts.push(a, b);
  users.push(oA, oB, m);
  const ctxA = await addTestMember(db, a, oA, "owner");
  const ctxB = await addTestMember(db, b, oB, "owner");
  const ctxM = await addTestMember(db, a, m, "member");
  const w = await createWorkspace(db, ctxA, { name: "Upd", slug: "upd" });
  const wB = await createWorkspace(db, ctxB, { name: "Ups", slug: "ups" });
  ws = { ...ctxA, workspaceId: w.id, workspaceSlug: w.slug };
  member = { ...ctxM, workspaceId: w.id, workspaceSlug: w.slug };
  other = { ...ctxB, workspaceId: wB.id, workspaceSlug: wB.slug };
});

afterAll(() => cleanup(db, accounts, users));

async function doneCard(title: string) {
  const [roadmap] = await listRoadmaps(db, ws);
  const [column] = await listColumns(db, ws, roadmap?.id ?? "");
  const card = await createCard(db, ws, {
    roadmapId: roadmap?.id ?? "",
    columnId: column?.id ?? "",
    title,
  });
  await updateCard(db, ws, {
    id: card.id,
    summaryJson: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
    },
  });
  await setCardCompleted(db, ws, card.id, true);
  return card;
}

describe("update posts", () => {
  it("drafts a post, edits it, and lists it under Drafts", async () => {
    const post = await createUpdate(db, member, {});
    expect(post).toMatchObject({ status: "draft", title: "Untitled post" });
    const [category] = await listUpdateCategories(db, ws);
    await patchUpdate(db, member, {
      id: post.id,
      title: "Dark mode",
      categoryId: category?.id,
      bodyJson: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Night" }] },
        ],
      },
      pinned: true,
    });
    const drafts = await listUpdates(db, ws, { tab: "draft", q: "Night" });
    expect(drafts.map((p) => p.title)).toEqual(["Dark mode"]);
    expect(drafts[0]?.category?.name).toBe(category?.name);
    expect((await updateCounts(db, ws)).draft).toBeGreaterThan(0);
    expect(await listUpdates(db, ws, { tab: "published" })).toEqual([]);
  });

  it("starts from a completed card with its content and link", async () => {
    const card = await doneCard("Exports");
    const post = await createUpdate(db, ws, { cardId: card.id });
    const detail = await getUpdateDetail(db, ws, post.id);
    expect(detail.title).toBe("Exports");
    expect(detail.bodyText).toBe("Hi");
    expect(detail.cards.map((c) => c.id)).toEqual([card.id]);
    expect(detail.cards[0]?.completed).toBe(true);
    expect(
      (await searchCardsForUpdate(db, ws, "Expo")).map((c) => c.id),
    ).toContain(card.id);
  });

  it("only takes this workspace's cards, categories and cover images", async () => {
    const post = await createUpdate(db, ws, {});
    const foreign = await createUpdate(db, other, {});
    const [foreignCategory] = await listUpdateCategories(db, other);
    await expect(
      patchUpdate(db, ws, { id: post.id, categoryId: foreignCategory?.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const otherKey = newKey(
      prefixes.cardImages(other.accountId, other.workspaceId),
      "image/png",
    );
    await expect(
      patchUpdate(db, ws, { id: post.id, cover: otherKey }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const card = await doneCard("Mine");
    expect(
      await setUpdateCards(db, ws, post.id, [card.id, foreign.id]),
    ).toEqual([card.id]);
  });

  it("duplicates as a draft and deletes", async () => {
    const card = await doneCard("Dup card");
    const post = await createUpdate(db, ws, { cardId: card.id });
    const copy = await duplicateUpdate(db, ws, post.id);
    expect(copy.title).toBe("Dup card (copy)");
    expect(copy.status).toBe("draft");
    expect((await getUpdateDetail(db, ws, copy.id)).cards.length).toBe(1);
    await deleteUpdate(db, ws, copy.id);
    await expect(getUpdateDetail(db, ws, copy.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("another account can't read, edit, link or delete posts", async () => {
    const post = await createUpdate(db, ws, {});
    await expect(getUpdateDetail(db, other, post.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      patchUpdate(db, other, { id: post.id, title: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(setUpdateCards(db, other, post.id, [])).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(deleteUpdate(db, other, post.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      createUpdate(db, other, { cardId: (await doneCard("Theirs")).id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
