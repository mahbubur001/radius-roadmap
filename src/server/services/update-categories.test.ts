import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import {
  createUpdateCategory,
  DEFAULT_UPDATE_CATEGORIES,
  deleteUpdateCategory,
  editUpdateCategory,
  listUpdateCategories,
} from "./update-categories";
import { createWorkspace } from "./workspaces";

// Update categories (doc 23 step 1).

let owner: WorkspaceContext;
let member: WorkspaceContext;
let other: WorkspaceContext;
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "upc-a"),
    await createTestAccount(db, "upc-b"),
  ];
  const [oA, oB, m] = [
    await createTestUser(db, "upc-owner-a"),
    await createTestUser(db, "upc-owner-b"),
    await createTestUser(db, "upc-member"),
  ];
  accounts.push(a, b);
  users.push(oA, oB, m);
  const ctxA = await addTestMember(db, a, oA, "owner");
  const ctxB = await addTestMember(db, b, oB, "owner");
  const ctxM = await addTestMember(db, a, m, "member");
  const ws = await createWorkspace(db, ctxA, { name: "Upc", slug: "upc" });
  const wsB = await createWorkspace(db, ctxB, { name: "Upd", slug: "upd" });
  owner = { ...ctxA, workspaceId: ws.id, workspaceSlug: ws.slug };
  member = { ...ctxM, workspaceId: ws.id, workspaceSlug: ws.slug };
  other = { ...ctxB, workspaceId: wsB.id, workspaceSlug: wsB.slug };
});

afterAll(() => cleanup(db, accounts, users));

describe("update categories", () => {
  it("seeds the six defaults in order", async () => {
    expect((await listUpdateCategories(db, owner)).map((c) => c.name)).toEqual(
      DEFAULT_UPDATE_CATEGORIES.map((c) => c.name),
    );
  });

  it("admins add, rename and delete; names are unique; members can't", async () => {
    const row = await createUpdateCategory(db, owner, {
      name: "Security",
      color: "#000000",
    });
    await expect(
      createUpdateCategory(db, owner, { name: "Security", color: "#111111" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await editUpdateCategory(db, owner, {
      id: row.id,
      name: "Security fix",
      color: "#222222",
    });
    await expect(
      createUpdateCategory(db, member, { name: "Nope", color: "#000000" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await deleteUpdateCategory(db, owner, row.id);
    expect(
      (await listUpdateCategories(db, owner)).map((c) => c.name),
    ).not.toContain("Security fix");
  });

  it("another account can't see or change them", async () => {
    const [first] = await listUpdateCategories(db, owner);
    expect(
      (await listUpdateCategories(db, other)).map((c) => c.id),
    ).not.toContain(first?.id);
    await expect(
      editUpdateCategory(db, other, {
        id: first?.id ?? "",
        name: "Hacked",
        color: "#000000",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      deleteUpdateCategory(db, other, first?.id ?? ""),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
