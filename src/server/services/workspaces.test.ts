import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import {
  type AccountContext,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "./context";
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspaceBySlug,
  listWorkspaces,
  setWorkspaceAccess,
  updateWorkspace,
} from "./workspaces";

const settings = {
  requireVoterLogin: false,
  darkModeDefault: false,
  indexPublicPages: true,
};

let ctxA: AccountContext; // owner of account A
let ctxB: AccountContext; // owner of account B
let memberA: AccountContext; // plain member of account A
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
  ctxA = await addTestMember(db, a, ownerA, "owner");
  ctxB = await addTestMember(db, b, ownerB, "owner");
  memberA = await addTestMember(db, a, mA, "member");

  await createWorkspace(db, ctxA, { name: "Alpha", slug: "alpha" });
  await createWorkspace(db, ctxA, { name: "Gamma", slug: "gamma" });
  await createWorkspace(db, ctxB, { name: "Beta", slug: "beta" });
});

afterAll(() => cleanup(db, accounts, users));

describe("workspace tenant isolation", () => {
  it("lists only the caller's workspaces", async () => {
    const rows = await listWorkspaces(db, ctxA);
    expect(rows.map((w) => w.slug)).toEqual(["alpha", "gamma"]);
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
    expect(ws.accountId).toBe(ctxB.accountId);
  });

  it("rejects a duplicate slug in the same account", async () => {
    await expect(
      createWorkspace(db, ctxA, { name: "Again", slug: "alpha" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("cannot update or delete another account's workspace", async () => {
    const beta = await getWorkspaceBySlug(db, ctxB, "beta");
    await expect(
      updateWorkspace(db, ctxA, beta.id, {
        name: "Hacked",
        slug: "beta",
        settings,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteWorkspace(db, ctxA, beta.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("member workspace access", () => {
  it("members see nothing until granted", async () => {
    expect(await listWorkspaces(db, memberA)).toEqual([]);
    await expect(
      getWorkspaceBySlug(db, memberA, "alpha"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("members see only granted workspaces", async () => {
    const alpha = await getWorkspaceBySlug(db, ctxA, "alpha");
    await setWorkspaceAccess(db, ctxA, memberA.userId, [alpha.id]);
    const rows = await listWorkspaces(db, memberA);
    expect(rows.map((w) => w.slug)).toEqual(["alpha"]);
    await expect(
      getWorkspaceBySlug(db, memberA, "gamma"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("ignores workspace ids from another account", async () => {
    const beta = await getWorkspaceBySlug(db, ctxB, "beta");
    const alpha = await getWorkspaceBySlug(db, ctxA, "alpha");
    await setWorkspaceAccess(db, ctxA, memberA.userId, [alpha.id, beta.id]);
    const rows = await listWorkspaces(db, memberA);
    expect(rows.map((w) => w.slug)).toEqual(["alpha"]);
  });

  it("forbids members from creating, editing or granting", async () => {
    const alpha = await getWorkspaceBySlug(db, ctxA, "alpha");
    await expect(
      createWorkspace(db, memberA, { name: "Nope", slug: "nope" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateWorkspace(db, memberA, alpha.id, {
        name: "X",
        slug: "alpha",
        settings,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      setWorkspaceAccess(db, memberA, memberA.userId, [alpha.id]),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("update and delete", () => {
  it("renames and merges settings", async () => {
    const gamma = await getWorkspaceBySlug(db, ctxA, "gamma");
    const row = await updateWorkspace(db, ctxA, gamma.id, {
      name: "Gamma 2",
      slug: "gamma-2",
      settings: { ...settings, darkModeDefault: true },
    });
    expect(row.slug).toBe("gamma-2");
    expect(row.settings.darkModeDefault).toBe(true);
  });

  it("deletes a workspace but never the last one", async () => {
    const gamma = await getWorkspaceBySlug(db, ctxA, "gamma-2");
    await deleteWorkspace(db, ctxA, gamma.id);
    const alpha = await getWorkspaceBySlug(db, ctxA, "alpha");
    await expect(deleteWorkspace(db, ctxA, alpha.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
