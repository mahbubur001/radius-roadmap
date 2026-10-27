import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultDisplay } from "@/lib/schemas/roadmap";
import { db } from "@/server/db/client";
import { roadmapCards, voterLoginCodes, votes } from "@/server/db/schema";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { createCard, updateCard } from "./cards";
import {
  ConflictError,
  ForbiddenError,
  type PublicContext,
  type WorkspaceContext,
} from "./context";
import { recentVotes, summary, topCards, trackEvent } from "./events";
import {
  getPublicCard,
  getPublicRoadmap,
  getVotableCard,
  isSiteWorkspace,
  resolveSite,
} from "./public-site";
import {
  createRoadmap,
  listColumns,
  updateColumn,
  updateRoadmap,
} from "./roadmaps";
import {
  guestSignIn,
  MAX_CODE_ATTEMPTS,
  startEmailCode,
  verifyEmailCode,
  verifyEmailLink,
} from "./voter-auth";
import { claimVisitorVotes, listVoters, toggleVote } from "./votes";
import { createWorkspace } from "./workspaces";

const meta = {
  ipHash: null,
  country: "BD",
  city: "Dhaka",
  source: "public",
} as const;

let wsA: WorkspaceContext;
let wsB: WorkspaceContext;
let pubA: PublicContext;
let pubB: PublicContext;
let boardSlug: string;
let card: { id: string; workspaceId: string; slug: string };
let hidden: { id: string; slug: string };
const accounts: string[] = [];
const users: string[] = [];

async function voteCount(cardId: string) {
  const [row] = await db
    .select({ n: roadmapCards.voteCount })
    .from(roadmapCards)
    .where(eq(roadmapCards.id, cardId));
  const rows = await db.select().from(votes).where(eq(votes.cardId, cardId));
  return { counter: row?.n ?? -1, rows: rows.length };
}

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "va"),
    await createTestAccount(db, "vb"),
  ];
  const [oa, ob] = [
    await createTestUser(db, "owner-va"),
    await createTestUser(db, "owner-vb"),
  ];
  accounts.push(a, b);
  users.push(oa, ob);
  const ctxA = await addTestMember(db, a, oa, "owner");
  const ctxB = await addTestMember(db, b, ob, "owner");
  const alpha = await createWorkspace(db, ctxA, {
    name: "Alpha",
    slug: "alpha",
  });
  const beta = await createWorkspace(db, ctxB, { name: "Beta", slug: "beta" });
  wsA = { ...ctxA, workspaceId: alpha.id, workspaceSlug: alpha.slug };
  wsB = { ...ctxB, workspaceId: beta.id, workspaceSlug: beta.slug };
  pubA = { accountId: a };
  pubB = { accountId: b };

  const roadmap = await createRoadmap(db, wsA, { title: "Public board" });
  boardSlug = roadmap.slug;
  const columns = await listColumns(db, wsA, roadmap.id);
  const first = columns[0];
  if (!first) throw new Error("no columns");
  const c = await createCard(db, wsA, {
    roadmapId: roadmap.id,
    columnId: first.id,
    title: "Dark mode",
  });
  card = { id: c.id, workspaceId: alpha.id, slug: c.slug };
  const h = await createCard(db, wsA, {
    roadmapId: roadmap.id,
    columnId: first.id,
    title: "Internal only",
  });
  await updateCard(db, wsA, { id: h.id, isPublic: false });
  hidden = { id: h.id, slug: h.slug };
});

afterAll(() => cleanup(db, accounts, users));

describe("public site visibility", () => {
  it("resolves the account from its subdomain only", async () => {
    const [slug] = accounts;
    expect(
      (await resolveSite(db, `${slug}.localhost:3000`, "localhost:3000"))
        ?.accountId,
    ).toBe(slug);
    expect(
      await resolveSite(db, "evil.example.com", "localhost:3000"),
    ).toBeNull();
    expect(
      await resolveSite(db, "nope-nope.localhost:3000", "localhost:3000"),
    ).toBeNull();
  });

  it("shows public cards and hides private ones", async () => {
    const board = await getPublicRoadmap(db, pubA, wsA.workspaceId, {
      slug: boardSlug,
    });
    const ids = board?.cards.map((c) => c.id) ?? [];
    expect(ids).toContain(card.id);
    expect(ids).not.toContain(hidden.id);
    expect(
      await getPublicCard(db, pubA, wsA.workspaceId, hidden.slug),
    ).toBeNull();
    expect(await getVotableCard(db, pubA, hidden.id)).toBeNull();
  });

  it("hides cards in a private column", async () => {
    const [column] = await listColumns(
      db,
      wsA,
      (await getPublicRoadmap(db, pubA, wsA.workspaceId, { slug: boardSlug }))
        ?.id ?? "",
    );
    if (!column) throw new Error("no column");
    await updateColumn(db, wsA, {
      id: column.id,
      name: column.name,
      isPublic: false,
      isDone: column.isDone,
    });
    expect(await getVotableCard(db, pubA, card.id)).toBeNull();
    await updateColumn(db, wsA, {
      id: column.id,
      name: column.name,
      isPublic: true,
      isDone: column.isDone,
    });
    expect(await getVotableCard(db, pubA, card.id)).not.toBeNull();
  });

  it("hides a private roadmap entirely", async () => {
    const roadmap = await createRoadmap(db, wsA, { title: "Secret board" });
    const board = await getPublicRoadmap(db, pubA, wsA.workspaceId, {
      slug: roadmap.slug,
    });
    expect(board?.id).toBe(roadmap.id);
    await updateRoadmap(db, wsA, {
      id: roadmap.id,
      internalTitle: roadmap.internalTitle,
      publicTitle: "",
      internalSummary: "",
      publicSummary: "",
      isPublic: false,
      display: { ...defaultDisplay, ...roadmap.display },
    });
    expect(
      await getPublicRoadmap(db, pubA, wsA.workspaceId, { slug: roadmap.slug }),
    ).toBeNull();
  });

  it("never serves another account's data", async () => {
    expect(
      await getPublicRoadmap(db, pubB, wsA.workspaceId, { slug: boardSlug }),
    ).toBeNull();
    expect(
      await getPublicCard(db, pubB, wsA.workspaceId, card.slug),
    ).toBeNull();
    expect(await getVotableCard(db, pubB, card.id)).toBeNull();
    expect(await isSiteWorkspace(db, pubB, wsA.workspaceId)).toBe(false);
    expect(await isSiteWorkspace(db, pubA, wsA.workspaceId)).toBe(true);
  });
});

describe("votes", () => {
  it("toggles an anonymous vote and keeps the counter equal to the rows", async () => {
    const visitorId = randomUUID();
    expect(await toggleVote(db, pubA, card, { visitorId }, meta)).toMatchObject(
      { voted: true, total: 1 },
    );
    expect(await voteCount(card.id)).toEqual({ counter: 1, rows: 1 });
    expect(await toggleVote(db, pubA, card, { visitorId }, meta)).toMatchObject(
      { voted: false, total: 0 },
    );
    expect(await voteCount(card.id)).toEqual({ counter: 0, rows: 0 });
  });

  it("claims anonymous votes on sign-in without duplicates", async () => {
    const visitorId = randomUUID();
    const user = await guestSignIn(db, pubA, {
      name: "Ada",
      email: "ada@example.test",
    });
    // Voted the same card both anonymously and signed in.
    await toggleVote(db, pubA, card, { visitorId }, meta);
    await toggleVote(db, pubA, card, { trackedUserId: user.id }, meta);
    expect(await voteCount(card.id)).toEqual({ counter: 2, rows: 2 });

    await claimVisitorVotes(db, pubA, visitorId, user.id);
    expect(await voteCount(card.id)).toEqual({ counter: 1, rows: 1 });

    const voters = await listVoters(db, wsA, card.id);
    expect(voters.named.map((v) => v.name)).toEqual(["Ada"]);
    expect(voters.anonymous).toBe(0);

    await toggleVote(db, pubA, card, { trackedUserId: user.id }, meta);
    expect(await voteCount(card.id)).toEqual({ counter: 0, rows: 0 });
  });

  it("can't remove another account's votes", async () => {
    const visitorId = randomUUID();
    await toggleVote(db, pubA, card, { visitorId }, meta);
    // Same visitor id from another account's site: nothing is claimed.
    await claimVisitorVotes(db, pubB, visitorId, randomUUID());
    expect(await voteCount(card.id)).toEqual({ counter: 1, rows: 1 });
    await toggleVote(db, pubA, card, { visitorId }, meta);
  });
});

describe("voter sign-in", () => {
  it("signs in with the right code once", async () => {
    const { code } = await startEmailCode(db, pubA, "Bob@Example.test");
    const user = await verifyEmailCode(db, pubA, "bob@example.test", code);
    expect(user.emailVerifiedAt).not.toBeNull();
    await expect(
      verifyEmailCode(db, pubA, "bob@example.test", code),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("stores only hashes", async () => {
    const { code, token } = await startEmailCode(db, pubA, "hash@example.test");
    const rows = await db
      .select()
      .from(voterLoginCodes)
      .where(eq(voterLoginCodes.email, "hash@example.test"));
    for (const row of rows) {
      expect(row.codeHash).not.toContain(code);
      expect(row.tokenHash).not.toBe(token);
    }
  });

  it("burns the code after too many wrong tries", async () => {
    const { code } = await startEmailCode(db, pubA, "carol@example.test");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      await expect(
        verifyEmailCode(db, pubA, "carol@example.test", wrong),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(
      verifyEmailCode(db, pubA, "carol@example.test", code),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects expired codes and earlier codes", async () => {
    const first = await startEmailCode(db, pubA, "dan@example.test");
    const second = await startEmailCode(db, pubA, "dan@example.test");
    await expect(
      verifyEmailCode(db, pubA, "dan@example.test", first.code),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await db
      .update(voterLoginCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(voterLoginCodes.email, "dan@example.test"));
    await expect(
      verifyEmailLink(db, pubA, second.token),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("uses a link once and only on its own account", async () => {
    const { token } = await startEmailCode(db, pubA, "erin@example.test");
    await expect(verifyEmailLink(db, pubB, token)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const user = await verifyEmailLink(db, pubA, token);
    expect(user.email).toBe("erin@example.test");
    await expect(verifyEmailLink(db, pubA, token)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("won't let a guest take a verified email", async () => {
    const { code } = await startEmailCode(db, pubA, "fay@example.test");
    await verifyEmailCode(db, pubA, "fay@example.test", code);
    await expect(
      guestSignIn(db, pubA, { name: "Fake", email: "fay@example.test" }),
    ).rejects.toBeInstanceOf(ConflictError);
    // A different account has its own voters.
    const other = await guestSignIn(db, pubB, {
      name: "Fay B",
      email: "fay@example.test",
    });
    expect(other.accountId).toBe(pubB.accountId);
  });
});

describe("analytics", () => {
  it("counts views and votes per workspace", async () => {
    await trackEvent(db, pubA, {
      workspaceId: wsA.workspaceId,
      type: "page_view",
      visitorId: "v1",
    });
    await trackEvent(db, pubA, {
      workspaceId: wsA.workspaceId,
      type: "card_view",
      visitorId: "v1",
      subjectId: card.id,
    });
    await trackEvent(db, pubA, {
      workspaceId: wsA.workspaceId,
      type: "page_view",
      visitorId: "v2",
    });
    await toggleVote(db, pubA, card, { visitorId: "v2" }, meta);

    expect(await summary(db, wsA, "7d")).toEqual({
      views: 3,
      visitors: 2,
      votes: 1,
    });
    expect(await summary(db, wsB, "7d")).toEqual({
      views: 0,
      visitors: 0,
      votes: 0,
    });
    expect((await recentVotes(db, wsA))[0]).toMatchObject({
      cardTitle: "Dark mode",
      city: "Dhaka",
    });
    expect(await recentVotes(db, wsB)).toEqual([]);
    expect((await topCards(db, wsA))[0]).toMatchObject({
      id: card.id,
      votes: 1,
    });
  });
});
