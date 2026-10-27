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
  cancelInvitation,
  grantInvitedWorkspaces,
  invitationEmail,
  invite,
  listInvitations,
} from "./invitations";
import { createWorkspace, listWorkspaces } from "./workspaces";

const accounts: string[] = [];
const users: string[] = [];
let owner: AccountContext;
let admin: AccountContext;
let member: AccountContext;
let otherOwner: AccountContext;
let wsA: string;
let wsOther: string;

beforeAll(async () => {
  const a = await createTestAccount(db, "inv-a");
  const b = await createTestAccount(db, "inv-b");
  accounts.push(a, b);
  const mk = async (label: string) => {
    const id = await createTestUser(db, label);
    users.push(id);
    return id;
  };
  owner = await addTestMember(db, a, await mk("owner"), "owner");
  admin = await addTestMember(db, a, await mk("admin"), "admin");
  member = await addTestMember(db, a, await mk("member"), "member");
  otherOwner = await addTestMember(db, b, await mk("other"), "owner");
  wsA = (await createWorkspace(db, owner, { name: "Alpha", slug: "alpha" })).id;
  wsOther = (
    await createWorkspace(db, otherOwner, { name: "Bravo", slug: "bravo" })
  ).id;
});

afterAll(() => cleanup(db, accounts, users));

describe("invite", () => {
  it("admins invite members; ids from another account are dropped", async () => {
    const inv = await invite(db, admin, {
      email: "New@Example.test",
      role: "member",
      workspaceIds: [wsA, wsOther],
    });
    expect(inv.email).toBe("new@example.test");
    expect(inv.workspaceIds).toEqual([wsA]);
  });

  it("refuses duplicates and existing members", async () => {
    await expect(
      invite(db, admin, {
        email: "new@example.test",
        role: "member",
        workspaceIds: [],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    const [existing] = await db.query.user.findMany({
      where: (u, { eq }) => eq(u.id, member.userId),
    });
    await expect(
      invite(db, admin, {
        email: existing?.email ?? "",
        role: "member",
        workspaceIds: [],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("only owners invite owners; members can't invite", async () => {
    await expect(
      invite(db, admin, {
        email: "boss@example.test",
        role: "owner",
        workspaceIds: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      invite(db, member, {
        email: "x@example.test",
        role: "member",
        workspaceIds: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("another account can't see or cancel the invitation", async () => {
    const [inv] = await listInvitations(db, owner);
    expect(await listInvitations(db, otherOwner)).toEqual([]);
    await expect(
      cancelInvitation(db, otherOwner, inv?.id ?? ""),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      invitationEmail(db, otherOwner, inv?.id ?? "", "http://x"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("builds the email with workspace names", async () => {
    const [inv] = await listInvitations(db, owner);
    const job = await invitationEmail(db, owner, inv?.id ?? "", "http://app");
    expect(job.template).toBe("invitation");
    expect(job.props).toMatchObject({
      workspaceNames: ["Alpha"],
      role: "member",
    });
  });

  it("cancels", async () => {
    const [inv] = await listInvitations(db, owner);
    await cancelInvitation(db, admin, inv?.id ?? "");
    expect(await listInvitations(db, owner)).toEqual([]);
  });
});

describe("grantInvitedWorkspaces (accept hook)", () => {
  it("grants only the inviting account's workspaces", async () => {
    const userId = await createTestUser(db, "joiner");
    users.push(userId);
    const ctx = await addTestMember(db, owner.accountId, userId, "member");
    await grantInvitedWorkspaces(
      db,
      {
        organizationId: owner.accountId,
        role: "member",
        workspaceIds: [wsA, wsOther],
      },
      userId,
    );
    const rows = await listWorkspaces(db, ctx);
    expect(rows.map((w) => w.id)).toEqual([wsA]);
  });
});
