import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import {
  createArticleCategory,
  deleteArticleCategory,
  listArticleCategories,
  moveArticleCategory,
  updateArticleCategory,
} from "./article-categories";
import {
  articleCounts,
  articleStats,
  createArticle,
  deleteArticle,
  duplicateArticle,
  getArticle,
  listArticles,
  moveArticle,
  patchArticle,
  publishArticle,
  unpublishArticle,
} from "./articles";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import { createWorkspace } from "./workspaces";

// Articles and their categories (doc 25 step 1).

let ws: WorkspaceContext;
let member: WorkspaceContext;
let other: WorkspaceContext;
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "art-a"),
    await createTestAccount(db, "art-b"),
  ];
  const [oA, mA, oB] = [
    await createTestUser(db, "art-owner-a"),
    await createTestUser(db, "art-member-a"),
    await createTestUser(db, "art-owner-b"),
  ];
  accounts.push(a, b);
  users.push(oA, mA, oB);
  const ctxA = await addTestMember(db, a, oA, "owner");
  const ctxB = await addTestMember(db, b, oB, "owner");
  const w = await createWorkspace(db, ctxA, { name: "Art", slug: "art" });
  const wB = await createWorkspace(db, ctxB, { name: "Arb", slug: "arb" });
  ws = { ...ctxA, workspaceId: w.id, workspaceSlug: w.slug };
  other = { ...ctxB, workspaceId: wB.id, workspaceSlug: wB.slug };
  member = {
    ...(await addTestMember(db, a, mA, "member")),
    workspaceId: w.id,
    workspaceSlug: w.slug,
  };
});

afterAll(() => cleanup(db, accounts, users));

const category = (name: string, icon = "📘") =>
  createArticleCategory(db, ws, { name, description: "", icon });

async function article(title: string, categoryId?: string) {
  const row = await createArticle(db, ws, { categoryId });
  return patchArticle(db, ws, { id: row.id, title });
}

describe("categories", () => {
  it("start empty; admins add, rename, reorder and delete them", async () => {
    expect(await listArticleCategories(db, ws)).toEqual([]);
    const start = await category("Getting started", "🚀");
    const billing = await category("Billing");
    expect(start.slug).toBe("getting-started");
    await expect(category("Billing")).rejects.toBeInstanceOf(ConflictError);
    await expect(
      createArticleCategory(db, member, {
        name: "Nope",
        description: "",
        icon: "❌",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await moveArticleCategory(db, ws, {
      id: billing.id,
      prevId: null,
      nextId: start.id,
    });
    expect((await listArticleCategories(db, ws)).map((c) => c.name)).toEqual([
      "Billing",
      "Getting started",
    ]);
    const renamed = await updateArticleCategory(db, ws, {
      id: billing.id,
      name: "Plans & billing",
      description: "Invoices",
      icon: "💳",
    });
    expect(renamed.slug).toBe("plans-billing");

    const temp = await category("Temporary");
    const inTemp = await article("Orphan", temp.id);
    await deleteArticleCategory(db, ws, temp.id);
    expect((await getArticle(db, ws, inTemp.id)).categoryId).toBeNull();
  });
});

describe("articles", () => {
  it("members write and publish; the slug is fixed at the first publish", async () => {
    const [start] = await listArticleCategories(db, ws);
    const draft = await createArticle(db, member, { categoryId: start?.id });
    await patchArticle(db, member, {
      id: draft.id,
      title: "Invite your team",
      bodyJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Go to Team" }],
          },
        ],
      },
    });
    const live = await publishArticle(db, member, draft.id);
    expect(live).toMatchObject({
      slug: "invite-your-team",
      status: "published",
      bodyText: "Go to Team",
    });
    await patchArticle(db, ws, { id: draft.id, title: "Invite teammates" });
    await unpublishArticle(db, ws, draft.id);
    const again = await publishArticle(db, ws, draft.id);
    expect(again.slug).toBe("invite-your-team");
    expect(again.publishedAt).toEqual(live.publishedAt);
  });

  it("keeps embedded video attributes", async () => {
    const row = await createArticle(db, ws, {});
    const saved = await patchArticle(db, ws, {
      id: row.id,
      bodyJson: {
        type: "doc",
        content: [
          { type: "video", attrs: { provider: "youtube", id: "dQw4w9WgXcQ" } },
        ],
      },
    });
    expect(saved.bodyJson).toEqual({
      type: "doc",
      content: [
        { type: "video", attrs: { provider: "youtube", id: "dQw4w9WgXcQ" } },
      ],
    });
    await deleteArticle(db, ws, row.id);
  });

  it("lists by tab, category and search; counts and stats", async () => {
    const cats = await listArticleCategories(db, ws);
    const billing = cats.find((c) => c.name === "Plans & billing");
    const refunds = await article("Refunds", billing?.id);
    await publishArticle(db, ws, refunds.id);
    await article("Draft about invoices", billing?.id);

    const published = await listArticles(db, ws, { tab: "published" });
    expect(published.map((a) => a.title)).toEqual(
      expect.arrayContaining(["Refunds", "Invite teammates"]),
    );
    expect(
      (await listArticles(db, ws, { tab: "draft", category: billing?.id })).map(
        (a) => a.title,
      ),
    ).toEqual(["Draft about invoices"]);
    expect(
      (await listArticles(db, ws, { q: "team" })).map((a) => a.title),
    ).toEqual(["Invite teammates"]);
    expect(
      (await listArticles(db, ws, { tab: "draft", category: "none" })).map(
        (a) => a.title,
      ),
    ).toContain("Orphan");
    expect(await articleCounts(db, ws)).toMatchObject({ published: 2 });
    expect(await articleStats(db, ws)).toMatchObject({
      published: 2,
      likes: 0,
      views: 0,
    });
  });

  it("reorders within a category, moves to the end of a new one, duplicates and deletes", async () => {
    const [, start] = await listArticleCategories(db, ws);
    const one = await article("One", start?.id);
    const two = await article("Two", start?.id);
    await moveArticle(db, ws, {
      id: two.id,
      prevId: null,
      nextId: one.id,
    });
    const order = async () =>
      (await listArticles(db, ws, { tab: "draft", category: start?.id })).map(
        (a) => a.title,
      );
    expect(await order()).toEqual(["Two", "One"]);
    await patchArticle(db, ws, { id: two.id, categoryId: null });
    await patchArticle(db, ws, { id: two.id, categoryId: start?.id ?? null });
    expect(await order()).toEqual(["One", "Two"]);

    const copy = await duplicateArticle(db, ws, one.id);
    expect(copy).toMatchObject({ title: "One (copy)", status: "draft" });
    await deleteArticle(db, ws, copy.id);
    await expect(getArticle(db, ws, copy.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("another account can't read, change or file into this workspace", async () => {
    const mine = await article("Private to A");
    await expect(getArticle(db, other, mine.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      patchArticle(db, other, { id: mine.id, title: "Hacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(publishArticle(db, other, mine.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(deleteArticle(db, other, mine.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const [theirCategory] = await listArticleCategories(db, ws);
    await expect(
      createArticle(db, other, { categoryId: theirCategory?.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      deleteArticleCategory(db, other, theirCategory?.id ?? ""),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await listArticles(db, other, { tab: "draft" })).toEqual([]);
  });
});
