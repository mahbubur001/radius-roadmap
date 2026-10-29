import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { createArticleCategory } from "./article-categories";
import { myArticleRatings, rateArticle } from "./article-ratings";
import {
  createArticle,
  getArticle,
  patchArticle,
  publishArticle,
} from "./articles";
import type { PublicContext, WorkspaceContext } from "./context";
import {
  getPublicArticle,
  getPublicArticleCategory,
  getPublicKnowledgeBase,
  getRateableArticle,
  searchPublicArticles,
} from "./public-articles";
import { getPublicWorkspace, publicPathStatus } from "./public-site";
import { createWorkspace, updatePublicSite } from "./workspaces";

// The public Articles pages and ratings (doc 25 steps 3–4).

let ws: WorkspaceContext;
let other: WorkspaceContext;
let pub: PublicContext;
let categoryId: string;
const accounts: string[] = [];
const users: string[] = [];

const SITE = {
  showRoadmap: true,
  showIdeas: true,
  showUpdates: true,
  commentsEnabled: false,
  approveComments: false,
  followsEnabled: false,
  termsUrl: "",
  privacyUrl: "",
};

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "kb-a"),
    await createTestAccount(db, "kb-b"),
  ];
  const [oA, oB] = [
    await createTestUser(db, "kb-owner-a"),
    await createTestUser(db, "kb-owner-b"),
  ];
  accounts.push(a, b);
  users.push(oA, oB);
  const ctxA = await addTestMember(db, a, oA, "owner");
  const ctxB = await addTestMember(db, b, oB, "owner");
  const w = await createWorkspace(db, ctxA, { name: "Kb", slug: "kb" });
  const wB = await createWorkspace(db, ctxB, { name: "Kc", slug: "kc" });
  ws = { ...ctxA, workspaceId: w.id, workspaceSlug: w.slug };
  other = { ...ctxB, workspaceId: wB.id, workspaceSlug: wB.slug };
  pub = { accountId: a };
  categoryId = (
    await createArticleCategory(db, ws, {
      name: "Getting started",
      description: "Basics",
      icon: "🚀",
    })
  ).id;
});

afterAll(() => cleanup(db, accounts, users));

async function article(
  title: string,
  text: string,
  opts: { publish?: boolean; isPublic?: boolean; featured?: boolean } = {},
) {
  const row = await createArticle(db, ws, { categoryId });
  await patchArticle(db, ws, {
    id: row.id,
    title,
    isPublic: opts.isPublic ?? true,
    featured: opts.featured ?? false,
    bodyJson: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  });
  return opts.publish === false
    ? getArticle(db, ws, row.id)
    : publishArticle(db, ws, row.id);
}

describe("public articles", () => {
  it("no Articles tab until something public is published", async () => {
    expect((await getPublicWorkspace(db, pub, "kb"))?.modules.articles).toBe(
      false,
    );
    expect(await publicPathStatus(db, pub, ["kb", "articles"])).toBe("missing");
    await article("Draft only", "Not yet", { publish: false });
    await article("Team only", "Secret", { isPublic: false });
    expect((await getPublicWorkspace(db, pub, "kb"))?.modules.articles).toBe(
      false,
    );

    const live = await article("Invite your team", "Open the team settings", {
      featured: true,
    });
    await article("Import from CSV", "Upload a spreadsheet of cards");
    expect((await getPublicWorkspace(db, pub, "kb"))?.modules.articles).toBe(
      true,
    );
    expect(await publicPathStatus(db, pub, ["kb", "articles"])).toBe("ok");
    expect(await publicPathStatus(db, pub, ["kb", "articles", live.slug])).toBe(
      "ok",
    );
    expect(
      await publicPathStatus(db, pub, ["kb", "articles", "draft-only"]),
    ).toBe("missing");
    expect(
      await publicPathStatus(db, pub, [
        "kb",
        "articles",
        "category",
        "getting-started",
      ]),
    ).toBe("ok");
    expect(
      await publicPathStatus(db, pub, ["kb", "articles", "category", "nope"]),
    ).toBe("missing");
  });

  it("home, category and article pages show only public published articles", async () => {
    const kb = await getPublicKnowledgeBase(db, pub, ws.workspaceId);
    expect(kb.featured.map((a) => a.title)).toEqual(["Invite your team"]);
    expect(kb.recent.map((a) => a.title).sort()).toEqual([
      "Import from CSV",
      "Invite your team",
    ]);
    expect(kb.categories).toMatchObject([
      { name: "Getting started", icon: "🚀", articles: 2 },
    ]);

    const page = await getPublicArticleCategory(
      db,
      pub,
      ws.workspaceId,
      "getting-started",
    );
    expect(page?.articles.map((a) => a.title)).toEqual([
      "Invite your team",
      "Import from CSV",
    ]);
    const one = await getPublicArticle(
      db,
      pub,
      ws.workspaceId,
      "invite-your-team",
    );
    expect(one).toMatchObject({
      html: "<p>Open the team settings</p>",
      category: { slug: "getting-started" },
    });
    expect(one?.related.map((a) => a.title)).toEqual(["Import from CSV"]);
  });

  it("search matches word prefixes and titles", async () => {
    const hits = async (q: string) =>
      (await searchPublicArticles(db, pub, ws.workspaceId, q)).map(
        (a) => a.title,
      );
    expect(await hits("spread")).toEqual(["Import from CSV"]);
    expect(await hits("team sett")).toEqual(["Invite your team"]);
    expect(await hits("secret")).toEqual([]);
    expect(await hits("!!!")).toEqual([]);
  });

  it("the Articles switch hides everything", async () => {
    await updatePublicSite(db, ws, { ...SITE, showArticles: false });
    expect((await getPublicWorkspace(db, pub, "kb"))?.modules.articles).toBe(
      false,
    );
    expect(
      await getPublicArticle(db, pub, ws.workspaceId, "invite-your-team"),
    ).toBeNull();
    await updatePublicSite(db, ws, { ...SITE, showArticles: true });
  });

  it("another account sees nothing", async () => {
    const theirs = { accountId: other.accountId };
    expect(
      (await getPublicKnowledgeBase(db, theirs, ws.workspaceId)).recent,
    ).toEqual([]);
    expect(
      await getPublicArticle(db, theirs, ws.workspaceId, "invite-your-team"),
    ).toBeNull();
  });
});

describe("ratings", () => {
  it("one changeable rating per visitor, counted on the article", async () => {
    const target = await getRateableArticle(
      db,
      pub,
      (await getPublicArticle(db, pub, ws.workspaceId, "import-from-csv"))
        ?.id ?? "",
    );
    if (!target) throw new Error("not rateable");
    const a = { visitorId: "visitor-a" };
    const b = { visitorId: "visitor-b" };
    expect((await rateArticle(db, pub, target.id, "like", a)).ratings).toEqual({
      like: 1,
      neutral: 0,
      dislike: 0,
    });
    await rateArticle(db, pub, target.id, "like", b);
    // Changing an answer moves the count; repeating it changes nothing.
    expect(
      (await rateArticle(db, pub, target.id, "dislike", a)).ratings,
    ).toEqual({ like: 1, neutral: 0, dislike: 1 });
    expect(
      (await rateArticle(db, pub, target.id, "dislike", a)).ratings,
    ).toEqual({ like: 1, neutral: 0, dislike: 1 });
    expect(await myArticleRatings(db, pub, ws.workspaceId, a)).toEqual({
      [target.id]: "dislike",
    });
    expect((await rateArticle(db, pub, target.id, null, a)).ratings).toEqual({
      like: 1,
      neutral: 0,
      dislike: 0,
    });
    expect(await myArticleRatings(db, pub, ws.workspaceId, a)).toEqual({});

    const draft = await article("Unrated draft", "x", { publish: false });
    expect(await getRateableArticle(db, pub, draft.id)).toBeNull();
    expect(
      await getRateableArticle(db, { accountId: other.accountId }, target.id),
    ).toBeNull();
  });
});
