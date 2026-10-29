import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { cardAttachments } from "@/server/db/schema";
import { prefixes } from "@/server/storage/keys";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { currentSettings } from "@/test/roadmap-settings";
import {
  addFeature,
  createCard,
  getCardDetail,
  listBoardCards,
  updateCard,
} from "./cards";
import {
  ForbiddenError,
  type PublicContext,
  type WorkspaceContext,
} from "./context";
import { getPublicCard, getPublicRoadmap } from "./public-site";
import { listColumns, listRoadmaps, saveRoadmapSettings } from "./roadmaps";
import { createWorkspace } from "./workspaces";

// Internal/public display toggles, summaries and header images (doc 24).

let ws: WorkspaceContext;
let other: WorkspaceContext;
let pub: PublicContext;
let roadmapId: string;
let cardId: string;
let cardSlug: string;
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "disp-a"),
    await createTestAccount(db, "disp-b"),
  ];
  const [oA, oB] = [
    await createTestUser(db, "disp-owner-a"),
    await createTestUser(db, "disp-owner-b"),
  ];
  accounts.push(a, b);
  users.push(oA, oB);
  const ctxA = await addTestMember(db, a, oA, "owner");
  const ctxB = await addTestMember(db, b, oB, "owner");
  const w = await createWorkspace(db, ctxA, { name: "Disp", slug: "disp" });
  const wB = await createWorkspace(db, ctxB, { name: "Disq", slug: "disq" });
  ws = { ...ctxA, workspaceId: w.id, workspaceSlug: w.slug };
  other = { ...ctxB, workspaceId: wB.id, workspaceSlug: wB.slug };
  pub = { accountId: a };

  const [roadmap] = await listRoadmaps(db, ws);
  roadmapId = roadmap?.id ?? "";
  const [column] = await listColumns(db, ws, roadmapId);
  const card = await createCard(db, ws, {
    roadmapId,
    columnId: column?.id ?? "",
    title: "Saved searches",
  });
  cardId = card.id;
  cardSlug = card.slug;
  const feature = await addFeature(db, ws, { cardId, title: "Alerts" });
  await addFeature(db, ws, { cardId, title: "Digest" });
  if (!feature) throw new Error("no feature");
  await db.insert(cardAttachments).values({
    accountId: ws.accountId,
    workspaceId: ws.workspaceId,
    cardId,
    key: `${prefixes.cardAttachments(ws.accountId, ws.workspaceId)}/${randomUUID()}.pdf`,
    name: "spec.pdf",
    size: 10,
    contentType: "application/pdf",
  });
});

afterAll(() => cleanup(db, accounts, users));

const imageKey = (ctx: WorkspaceContext) =>
  `${prefixes.cardImages(ctx.accountId, ctx.workspaceId)}/${randomUUID()}.png`;

describe("header images", () => {
  it("accept only this workspace's image keys and show on both sides", async () => {
    await expect(
      updateCard(db, ws, { id: cardId, headerImageKey: imageKey(other) }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const key = imageKey(ws);
    await updateCard(db, ws, { id: cardId, headerImageKey: key });
    expect((await getCardDetail(db, ws, cardId)).headerImageUrl).toContain(key);
    const [onBoard] = await listBoardCards(db, ws, roadmapId);
    expect(onBoard?.headerImageUrl).toContain(key);
    const shown = await getPublicCard(db, pub, ws.workspaceId, cardSlug);
    expect(shown?.card.image).toContain(key);
  });
});

describe("public display", () => {
  it("defaults: progress on, attachments off, summary rendered", async () => {
    await saveRoadmapSettings(db, ws, {
      ...(await currentSettings(db, ws, roadmapId)),
      publicSummaryJson: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        ],
      },
    });
    const board = await getPublicRoadmap(db, pub, ws.workspaceId);
    expect(board?.summaryHtml).toBe("<p>Hello</p>");
    const card = board?.cards.find((c) => c.id === cardId);
    expect(card?.progress).toEqual({ done: 0, total: 2 });
    expect(card?.attachments).toBeNull();
  });

  it("each public toggle only changes the public side", async () => {
    const settings = await currentSettings(db, ws, roadmapId);
    await saveRoadmapSettings(db, ws, {
      ...settings,
      display: {
        ...settings.display,
        showSummary: false,
        showFeatures: false,
        showFeatureProgress: false,
        showImageHeaders: false,
        showAttachments: true,
      },
    });
    const board = await getPublicRoadmap(db, pub, ws.workspaceId);
    expect(board?.summaryHtml).toBeNull();
    const shown = await getPublicCard(db, pub, ws.workspaceId, cardSlug);
    expect(shown?.card).toMatchObject({
      progress: null,
      features: null,
      image: null,
    });
    expect(shown?.card.attachments?.map((a) => a.name)).toEqual(["spec.pdf"]);
    // The dashboard still has the image.
    const [onBoard] = await listBoardCards(db, ws, roadmapId);
    expect(onBoard?.headerImageUrl).not.toBeNull();
  });
});
