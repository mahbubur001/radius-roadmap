import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import {
  addFeature,
  createCard,
  deleteCard,
  duplicateCard,
  getCardDetail,
  listBoardCards,
  listFeatures,
  moveCard,
  transferCard,
  updateCard,
} from "./cards";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import {
  createCategory,
  createColumn,
  createRoadmap,
  createTag,
  deleteColumn,
  deleteRoadmap,
  listCategories,
  listColumns,
  listRoadmaps,
  listTags,
  moveColumn,
  updateRoadmap,
} from "./roadmaps";
import { createWorkspace } from "./workspaces";

let wsA: WorkspaceContext; // owner, account A
let wsB: WorkspaceContext; // owner, account B
let memberA: WorkspaceContext; // member of account A, same workspace
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "a"),
    await createTestAccount(db, "b"),
  ];
  const [ownerA, ownerB, mA] = [
    await createTestUser(db, "owner-a"),
    await createTestUser(db, "owner-b"),
    await createTestUser(db, "member-a"),
  ];
  accounts.push(a, b);
  users.push(ownerA, ownerB, mA);
  const ctxA = await addTestMember(db, a, ownerA, "owner");
  const ctxB = await addTestMember(db, b, ownerB, "owner");
  const ctxM = await addTestMember(db, a, mA, "member");
  const alpha = await createWorkspace(db, ctxA, {
    name: "Alpha",
    slug: "alpha",
  });
  const beta = await createWorkspace(db, ctxB, { name: "Beta", slug: "beta" });
  wsA = { ...ctxA, workspaceId: alpha.id, workspaceSlug: alpha.slug };
  wsB = { ...ctxB, workspaceId: beta.id, workspaceSlug: beta.slug };
  memberA = { ...ctxM, workspaceId: alpha.id, workspaceSlug: alpha.slug };
});

afterAll(() => cleanup(db, accounts, users));

async function firstRoadmap(ctx: WorkspaceContext) {
  const [roadmap] = await listRoadmaps(db, ctx);
  if (!roadmap) throw new Error("no roadmap");
  const columns = await listColumns(db, ctx, roadmap.id);
  return { roadmap, columns };
}

describe("workspace defaults", () => {
  it("seeds a roadmap with four columns and LoopedIn's categories", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    expect(roadmap.slug).toBe("roadmap");
    expect(columns.map((c) => c.name)).toEqual([
      "In progress",
      "Up next",
      "Future",
      "Done",
    ]);
    expect(columns.at(-1)?.isDone).toBe(true);
    const cats = await listCategories(db, wsA);
    expect(cats.map((c) => c.name)).toContain("Revenue Growth");
  });
});

describe("roadmap tenant isolation", () => {
  it("never lists or reads another account's roadmaps, columns or cards", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    const card = await createCard(db, wsA, {
      roadmapId: roadmap.id,
      columnId: columns[0]?.id ?? "",
      title: "Secret plan",
    });

    expect((await listRoadmaps(db, wsB)).map((r) => r.id)).not.toContain(
      roadmap.id,
    );
    await expect(listColumns(db, wsB, roadmap.id)).resolves.toEqual([]);
    await expect(listBoardCards(db, wsB, roadmap.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getCardDetail(db, wsB, card.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      updateCard(db, wsB, { id: card.id, title: "Hacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteCard(db, wsB, card.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      addFeature(db, wsB, { cardId: card.id, title: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("can't create a card in another account's column", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    await expect(
      createCard(db, wsB, {
        roadmapId: roadmap.id,
        columnId: columns[0]?.id ?? "",
        title: "Sneaky",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ignores tags and categories from another account", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    const card = await createCard(db, wsA, {
      roadmapId: roadmap.id,
      columnId: columns[0]?.id ?? "",
      title: "Tagged",
    });
    const foreignTag = await createTag(db, wsB, { name: "foreign" });
    const ownTag = await createTag(db, wsA, { name: "own" });
    await updateCard(db, wsA, {
      id: card.id,
      tagIds: [foreignTag.id, ownTag.id],
    });
    expect((await getCardDetail(db, wsA, card.id)).tagIds).toEqual([ownTag.id]);
    const [foreignCat] = await listCategories(db, wsB);
    await expect(
      updateCard(db, wsA, { id: card.id, categoryId: foreignCat?.id ?? null }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("roles", () => {
  it("members edit cards but not roadmap settings, columns or categories", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    const card = await createCard(db, memberA, {
      roadmapId: roadmap.id,
      columnId: columns[0]?.id ?? "",
      title: "By a member",
    });
    await updateCard(db, memberA, { id: card.id, title: "Edited" });
    await expect(
      createColumn(db, memberA, { roadmapId: roadmap.id, name: "Nope" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createCategory(db, memberA, { name: "Nope", color: "#000000" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateRoadmap(db, memberA, {
        id: roadmap.id,
        internalTitle: "Nope",
        publicTitle: null,
        internalSummary: null,
        publicSummary: null,
        isPublic: true,
        display: {
          showVotes: true,
          showCategories: true,
          showTags: true,
          showDates: true,
          showDescriptions: true,
          showCompleted: true,
          showFeatures: true,
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("cards", () => {
  it("gives every card a unique slug within the workspace", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    const columnId = columns[1]?.id ?? "";
    const one = await createCard(db, wsA, {
      roadmapId: roadmap.id,
      columnId,
      title: "Dark mode",
    });
    const two = await createCard(db, wsA, {
      roadmapId: roadmap.id,
      columnId,
      title: "Dark mode",
    });
    expect(one.slug).toBe("dark-mode");
    expect(two.slug).toBe("dark-mode-2");
  });

  it("keeps a stable order across many moves", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    const col = columns[2]?.id ?? "";
    const cards = [];
    for (const title of ["A", "B", "C", "D"]) {
      cards.push(
        await createCard(db, wsA, {
          roadmapId: roadmap.id,
          columnId: col,
          title,
        }),
      );
    }
    const order = async () =>
      (await listBoardCards(db, wsA, roadmap.id))
        .filter((c) => c.columnId === col)
        .map((c) => c.title);
    const [a, b, c, d] = cards.map((x) => x.id);

    // Repeatedly move the last card to the front: A B C D → D A B C → …
    let current = ["A", "B", "C", "D"];
    for (let i = 0; i < 20; i++) {
      const ids = { A: a, B: b, C: c, D: d } as Record<string, string>;
      const last = current.at(-1) ?? "";
      await moveCard(db, wsA, {
        id: ids[last] ?? "",
        columnId: col,
        prevId: null,
        nextId: ids[current[0] ?? ""] ?? null,
      });
      current = [last, ...current.slice(0, -1)];
      expect(await order()).toEqual(current);
    }
  });

  it("completes a card moved into a done column and reopens it when moved out", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    const [first, , , done] = columns;
    const card = await createCard(db, wsA, {
      roadmapId: roadmap.id,
      columnId: first?.id ?? "",
      title: "Ship it",
    });
    const moved = await moveCard(db, wsA, {
      id: card.id,
      columnId: done?.id ?? "",
      prevId: null,
      nextId: null,
    });
    expect(moved?.completedAt).not.toBeNull();
    const back = await moveCard(db, wsA, {
      id: card.id,
      columnId: first?.id ?? "",
      prevId: null,
      nextId: null,
    });
    expect(back?.completedAt).toBeNull();
  });

  it("derives the plain-text summary on the server and finds it by search", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    const card = await createCard(db, wsA, {
      roadmapId: roadmap.id,
      columnId: columns[0]?.id ?? "",
      title: "Auctions",
    });
    await updateCard(db, wsA, {
      id: card.id,
      summaryJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Bidding on listings" }],
          },
        ],
      },
    });
    const detail = await getCardDetail(db, wsA, card.id);
    expect(detail.summaryText).toBe("Bidding on listings");
    const found = await listBoardCards(db, wsA, roadmap.id, { q: "bidding" });
    expect(found.map((c) => c.id)).toContain(card.id);
  });

  it("refuses to delete a column that still has cards", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    await expect(
      deleteColumn(db, wsA, columns[0]?.id ?? ""),
    ).rejects.toBeInstanceOf(ConflictError);
    const empty = await createColumn(db, wsA, {
      roadmapId: roadmap.id,
      name: "Empty",
    });
    await deleteColumn(db, wsA, empty?.id ?? "");
  });

  it("reorders columns", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    const done = columns.at(-1);
    await moveColumn(db, wsA, {
      id: done?.id ?? "",
      prevId: null,
      nextId: columns[0]?.id ?? null,
    });
    const after = await listColumns(db, wsA, roadmap.id);
    expect(after[0]?.name).toBe("Done");
  });

  it("creates tags idempotently", async () => {
    const one = await createTag(db, wsA, { name: "mobile" });
    const two = await createTag(db, wsA, { name: "mobile" });
    expect(one.id).toBe(two.id);
    expect(
      (await listTags(db, wsA)).filter((t) => t.name === "mobile"),
    ).toHaveLength(1);
  });

  it("deletes a whole roadmap with its columns and cards", async () => {
    const { roadmap } = await firstRoadmap(wsB);
    const [column] = await listColumns(db, wsB, roadmap.id);
    await createCard(db, wsB, {
      roadmapId: roadmap.id,
      columnId: column?.id ?? "",
      title: "Gone soon",
    });
    await deleteRoadmap(db, wsB, roadmap.id);
    expect(await listRoadmaps(db, wsB)).toEqual([]);
  });
});

describe("duplicate, move to and copy to", () => {
  it("duplicates content, tags and features but not votes", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    const card = await createCard(db, wsA, {
      roadmapId: roadmap.id,
      columnId: columns[0]?.id ?? "",
      title: "Original",
    });
    const tag = await createTag(db, wsA, { name: "dup-tag" });
    await updateCard(db, wsA, { id: card.id, tagIds: [tag.id] });
    await addFeature(db, wsA, { cardId: card.id, title: "Part one" });

    const copy = await duplicateCard(db, wsA, card.id);
    expect(copy.title).toBe("Original (copy)");
    expect(copy.columnId).toBe(card.columnId);
    expect(copy.slug).not.toBe(card.slug);
    expect(copy.voteCount).toBe(0);
    const detail = await getCardDetail(db, wsA, copy.id);
    expect(detail.tagIds).toEqual([tag.id]);
    expect((await listFeatures(db, wsA, copy.id)).map((f) => f.title)).toEqual([
      "Part one",
    ]);
  });

  it("moves a card to another roadmap and copies it into a done column", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    const other = await createRoadmap(db, wsA, { title: "Second" });
    const target = await listColumns(db, wsA, other.id);
    const done = target.find((c) => c.isDone);
    const card = await createCard(db, wsA, {
      roadmapId: roadmap.id,
      columnId: columns[0]?.id ?? "",
      title: "Travels",
    });

    const moved = await transferCard(db, wsA, {
      id: card.id,
      columnId: target[0]?.id ?? "",
      mode: "move",
    });
    expect(moved.id).toBe(card.id);
    expect(moved.roadmapId).toBe(other.id);
    expect(
      (await listBoardCards(db, wsA, roadmap.id)).map((c) => c.id),
    ).not.toContain(card.id);

    const copied = await transferCard(db, wsA, {
      id: card.id,
      columnId: done?.id ?? "",
      mode: "copy",
    });
    expect(copied.id).not.toBe(card.id);
    expect(copied.title).toBe("Travels");
    expect(copied.completedAt).not.toBeNull();
  });

  it("another account can't duplicate, move into or copy into its columns", async () => {
    const { roadmap, columns } = await firstRoadmap(wsA);
    const card = await createCard(db, wsA, {
      roadmapId: roadmap.id,
      columnId: columns[0]?.id ?? "",
      title: "Mine",
    });
    const foreign = await createRoadmap(db, wsB, { title: "Foreign" });
    const [foreignColumn] = await listColumns(db, wsB, foreign.id);
    await expect(duplicateCard(db, wsB, card.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    for (const mode of ["move", "copy"] as const) {
      await expect(
        transferCard(db, wsA, {
          id: card.id,
          columnId: foreignColumn?.id ?? "",
          mode,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        transferCard(db, wsB, {
          id: card.id,
          columnId: foreignColumn?.id ?? "",
          mode,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    }
  });
});
