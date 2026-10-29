import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { fileSize, writeLocalFile } from "@/server/storage";
import { newKey, prefixes } from "@/server/storage/keys";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import {
  addAttachment,
  attachmentPrefix,
  cardFollowers,
  deleteAttachment,
  listAttachments,
  setCardFollow,
} from "./card-activity";
import { createCard, deleteCard, listBoardCards } from "./cards";
import {
  ForbiddenError,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import { exportRoadmapCsv } from "./roadmap-export";
import { listColumns, listRoadmaps } from "./roadmaps";
import { createWorkspace } from "./workspaces";

let wsA: WorkspaceContext; // owner, account A
let mateA: WorkspaceContext; // member, account A
let wsB: WorkspaceContext; // owner, account B
let roadmapId: string;
let columnId: string;
const accounts: string[] = [];
const users: string[] = [];

const PDF = new TextEncoder().encode("%PDF-1.4\n%test\n");

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "act-a"),
    await createTestAccount(db, "act-b"),
  ];
  const [ownerA, ownerB, mate] = [
    await createTestUser(db, "act-owner-a"),
    await createTestUser(db, "act-owner-b"),
    await createTestUser(db, "act-mate"),
  ];
  accounts.push(a, b);
  users.push(ownerA, ownerB, mate);
  const ctxA = await addTestMember(db, a, ownerA, "owner");
  const ctxB = await addTestMember(db, b, ownerB, "owner");
  const ctxM = await addTestMember(db, a, mate, "member");
  const alpha = await createWorkspace(db, ctxA, {
    name: "Act A",
    slug: "act-a",
  });
  const beta = await createWorkspace(db, ctxB, {
    name: "Act B",
    slug: "act-b",
  });
  wsA = { ...ctxA, workspaceId: alpha.id, workspaceSlug: alpha.slug };
  mateA = { ...ctxM, workspaceId: alpha.id, workspaceSlug: alpha.slug };
  wsB = { ...ctxB, workspaceId: beta.id, workspaceSlug: beta.slug };
  const [roadmap] = await listRoadmaps(db, wsA);
  roadmapId = roadmap?.id ?? "";
  columnId = (await listColumns(db, wsA, roadmapId))[0]?.id ?? "";
});

afterAll(() => cleanup(db, accounts, users));

async function card(title: string) {
  return createCard(db, wsA, { roadmapId, columnId, title });
}

async function uploaded(ctx: WorkspaceContext) {
  const key = newKey(attachmentPrefix(ctx), "application/pdf");
  await writeLocalFile(key, PDF);
  return key;
}

describe("card attachments", () => {
  it("records an uploaded file, lists it, and deletes the file with it", async () => {
    const c = await card("With files");
    const key = await uploaded(wsA);
    const row = await addAttachment(db, wsA, {
      cardId: c.id,
      key,
      name: "spec.pdf",
    });
    expect(row).toMatchObject({
      contentType: "application/pdf",
      size: PDF.length,
    });
    expect((await listAttachments(db, wsA, c.id)).map((r) => r.id)).toEqual([
      row.id,
    ]);
    const [board] = (await listBoardCards(db, wsA, roadmapId)).filter(
      (b) => b.id === c.id,
    );
    expect(board?.attachments).toBe(1);

    await deleteAttachment(db, wsA, row.id);
    expect(await fileSize(key)).toBeNull();
    expect(await listAttachments(db, wsA, c.id)).toEqual([]);
  });

  it("deleting a card removes its files", async () => {
    const c = await card("Doomed");
    const key = await uploaded(wsA);
    await addAttachment(db, wsA, { cardId: c.id, key, name: "a.pdf" });
    await deleteCard(db, wsA, c.id);
    expect(await fileSize(key)).toBeNull();
  });

  it("rejects keys outside the workspace prefix and other accounts", async () => {
    const c = await card("Guarded");
    const foreignKey = await uploaded(wsB);
    await expect(
      addAttachment(db, wsA, { cardId: c.id, key: foreignKey, name: "x.pdf" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const avatarKey = newKey(prefixes.avatar("someone"), "image/png");
    await expect(
      addAttachment(db, wsA, { cardId: c.id, key: avatarKey, name: "x.png" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // A key that was never uploaded.
    await expect(
      addAttachment(db, wsA, {
        cardId: c.id,
        key: newKey(attachmentPrefix(wsA), "application/pdf"),
        name: "ghost.pdf",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const key = await uploaded(wsA);
    const row = await addAttachment(db, wsA, { cardId: c.id, key, name: "a" });
    await expect(listAttachments(db, wsB, c.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(deleteAttachment(db, wsB, row.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      addAttachment(db, wsB, { cardId: c.id, key: foreignKey, name: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("card follows", () => {
  it("follows and unfollows per team member, scoped to the account", async () => {
    const c = await card("Watched");
    await setCardFollow(db, mateA, c.id, true);
    await setCardFollow(db, mateA, c.id, true);
    expect(await cardFollowers(db, mateA, c.id)).toEqual({
      count: 1,
      following: true,
    });
    expect(await cardFollowers(db, wsA, c.id)).toEqual({
      count: 1,
      following: false,
    });
    await setCardFollow(db, mateA, c.id, false);
    expect((await cardFollowers(db, wsA, c.id)).count).toBe(0);
    await expect(setCardFollow(db, wsB, c.id, true)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("roadmap CSV export", () => {
  it("exports this workspace's cards, neutralising formulas", async () => {
    await card("=HYPERLINK(evil)");
    const { csv, filename } = await exportRoadmapCsv(db, wsA, roadmapId);
    expect(filename).toMatch(/\.csv$/);
    expect(csv.split("\r\n")[0]).toContain("Title,Public title,Column");
    expect(csv).toContain("'=HYPERLINK(evil)");
    expect(csv).toContain("Watched");
    await expect(exportRoadmapCsv(db, wsB, roadmapId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
