import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { organization } from "@/server/db/schema";
import { type AccountContext, ForbiddenError, NotFoundError } from "./context";
import {
  createWorkspace,
  getWorkspaceBySlug,
  listWorkspaces,
} from "./workspaces";

const accountA = `test-a-${randomUUID()}`;
const accountB = `test-b-${randomUUID()}`;
const ctxA: AccountContext = {
  accountId: accountA,
  userId: "u-a",
  role: "owner",
};
const ctxB: AccountContext = {
  accountId: accountB,
  userId: "u-b",
  role: "owner",
};

beforeAll(async () => {
  await db.insert(organization).values([
    { id: accountA, name: "A", slug: accountA, createdAt: new Date() },
    { id: accountB, name: "B", slug: accountB, createdAt: new Date() },
  ]);
  await createWorkspace(db, ctxA, { name: "Alpha", slug: "alpha" });
  await createWorkspace(db, ctxB, { name: "Beta", slug: "beta" });
});

afterAll(async () => {
  // Workspaces cascade-delete with their account.
  await db
    .delete(organization)
    .where(inArray(organization.id, [accountA, accountB]));
});

describe("workspace tenant isolation", () => {
  it("lists only the caller's workspaces", async () => {
    const rows = await listWorkspaces(db, ctxA);
    expect(rows.map((w) => w.slug)).toEqual(["alpha"]);
  });

  it("cannot read another account's workspace by slug", async () => {
    await expect(getWorkspaceBySlug(db, ctxA, "beta")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("allows the same slug in different accounts", async () => {
    const ws = await createWorkspace(db, ctxB, {
      name: "Alpha too",
      slug: "alpha",
    });
    expect(ws.accountId).toBe(accountB);
  });

  it("forbids members from creating workspaces", async () => {
    await expect(
      createWorkspace(
        db,
        { ...ctxA, role: "member" },
        { name: "Nope", slug: "nope" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
