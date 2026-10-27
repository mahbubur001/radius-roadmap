import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { type AccountContext, ForbiddenError, NotFoundError } from "./context";
import {
  changeRole,
  leaveAccount,
  listMembers,
  removeMember,
  setMemberWorkspaces,
  transferOwnership,
} from "./team";
import { createWorkspace, listWorkspaces } from "./workspaces";

const accounts: string[] = [];
const users: string[] = [];

async function setup() {
  const acct = await createTestAccount(db, "team");
  accounts.push(acct);
  const ctx: Record<"owner" | "admin" | "member", AccountContext> = {
    owner: await addTestMember(db, acct, await user("owner"), "owner"),
    admin: await addTestMember(db, acct, await user("admin"), "admin"),
    member: await addTestMember(db, acct, await user("member"), "member"),
  };
  const members = await listMembers(db, ctx.owner);
  const id = (c: AccountContext) =>
    members.find((m) => m.userId === c.userId)?.memberId ?? "";
  return { acct, ctx, id };
}

async function user(label: string) {
  const id = await createTestUser(db, label);
  users.push(id);
  return id;
}

afterAll(() => cleanup(db, accounts, users));

describe("role rules", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    t = await setup();
  });

  it("members can't change roles or remove people", async () => {
    await expect(
      changeRole(db, t.ctx.member, t.id(t.ctx.admin), "member"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      removeMember(db, t.ctx.member, t.id(t.ctx.admin)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admins can't touch owners or create owners", async () => {
    await expect(
      changeRole(db, t.ctx.admin, t.id(t.ctx.owner), "admin"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      changeRole(db, t.ctx.admin, t.id(t.ctx.member), "owner"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      removeMember(db, t.ctx.admin, t.id(t.ctx.owner)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("the last owner can't be demoted or leave", async () => {
    await expect(
      changeRole(db, t.ctx.owner, t.id(t.ctx.owner), "admin"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(leaveAccount(db, t.ctx.owner)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("can't act on a member of another account", async () => {
    const other = await setup();
    await expect(
      removeMember(db, t.ctx.owner, other.id(other.ctx.member)),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      changeRole(db, t.ctx.owner, other.id(other.ctx.member), "admin"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("workspace access follows the member", () => {
  it("removing a member deletes their workspace access", async () => {
    const t = await setup();
    const ws = await createWorkspace(db, t.ctx.owner, {
      name: "One",
      slug: "one",
    });
    await setMemberWorkspaces(db, t.ctx.admin, t.id(t.ctx.member), [ws.id]);
    expect(await listWorkspaces(db, t.ctx.member)).toHaveLength(1);

    await removeMember(db, t.ctx.admin, t.id(t.ctx.member));
    const after = await listMembers(db, t.ctx.owner);
    expect(after.map((m) => m.userId)).not.toContain(t.ctx.member.userId);
    // Same user re-added later starts with no access.
    const again = await addTestMember(
      db,
      t.acct,
      t.ctx.member.userId,
      "member",
    );
    expect(await listWorkspaces(db, again)).toEqual([]);
  });

  it("promoting a member drops their grants (admins see everything)", async () => {
    const t = await setup();
    const ws = await createWorkspace(db, t.ctx.owner, {
      name: "Two",
      slug: "two",
    });
    await setMemberWorkspaces(db, t.ctx.owner, t.id(t.ctx.member), [ws.id]);
    await changeRole(db, t.ctx.owner, t.id(t.ctx.member), "admin");
    const row = (await listMembers(db, t.ctx.owner)).find(
      (m) => m.userId === t.ctx.member.userId,
    );
    expect(row?.role).toBe("admin");
    expect(row?.workspaceIds).toEqual([]);
  });
});

describe("ownership", () => {
  it("transfers ownership and demotes the old owner to admin", async () => {
    const t = await setup();
    await transferOwnership(db, t.ctx.owner, t.id(t.ctx.admin));
    const roles = Object.fromEntries(
      (await listMembers(db, t.ctx.owner)).map((m) => [m.userId, m.role]),
    );
    expect(roles[t.ctx.admin.userId]).toBe("owner");
    expect(roles[t.ctx.owner.userId]).toBe("admin");
  });

  it("only owners can transfer", async () => {
    const t = await setup();
    await expect(
      transferOwnership(db, t.ctx.admin, t.id(t.ctx.member)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a second owner lets the first one leave", async () => {
    const t = await setup();
    await changeRole(db, t.ctx.owner, t.id(t.ctx.admin), "owner");
    await leaveAccount(db, t.ctx.owner);
    const left = await listMembers(db, t.ctx.admin);
    expect(left.map((m) => m.userId)).not.toContain(t.ctx.owner.userId);
  });
});
