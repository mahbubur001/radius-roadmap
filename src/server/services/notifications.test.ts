import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { addPublicComment, addTeamComment } from "./comments";
import type { PublicContext, WorkspaceContext } from "./context";
import { createFeedback, listBoards } from "./feedback";
import {
  defaultPrefs,
  digestEmails,
  getMyPrefs,
  newCommentEmails,
  newFeedbackEmails,
  recipients,
  setMyPrefs,
} from "./notifications";
import { submitIdea } from "./public-ideas";
import { guestSignIn } from "./voter-auth";
import { createWorkspace, setWorkspaceAccess } from "./workspaces";

// Team email alerts (doc 20 step 8).

let owner: WorkspaceContext;
let admin: WorkspaceContext;
let member: WorkspaceContext; // granted the workspace
let outsider: WorkspaceContext; // member of the account, not granted
let otherOwner: string;
let pub: PublicContext;
let boardSlug: string;
let boardId: string;
let visitorId: string;
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "ntf-a"),
    await createTestAccount(db, "ntf-b"),
  ];
  const ids = {
    owner: await createTestUser(db, "ntf-owner"),
    admin: await createTestUser(db, "ntf-admin"),
    member: await createTestUser(db, "ntf-member"),
    outsider: await createTestUser(db, "ntf-outsider"),
    other: await createTestUser(db, "ntf-other"),
  };
  accounts.push(a, b);
  users.push(...Object.values(ids));
  const ctxO = await addTestMember(db, a, ids.owner, "owner");
  const ctxA = await addTestMember(db, a, ids.admin, "admin");
  const ctxM = await addTestMember(db, a, ids.member, "member");
  const ctxX = await addTestMember(db, a, ids.outsider, "member");
  await addTestMember(db, b, ids.other, "owner");
  otherOwner = ids.other;
  const ws = await createWorkspace(db, ctxO, { name: "Ntf", slug: "ntf" });
  await setWorkspaceAccess(db, ctxO, ids.member, [ws.id]);
  const scope = { workspaceId: ws.id, workspaceSlug: ws.slug };
  owner = { ...ctxO, ...scope };
  admin = { ...ctxA, ...scope };
  member = { ...ctxM, ...scope };
  outsider = { ...ctxX, ...scope };
  pub = { accountId: a };
  const [board] = await listBoards(db, owner);
  boardSlug = board?.slug ?? "";
  boardId = board?.id ?? "";
  visitorId = (await guestSignIn(db, pub, { name: "Nia", email: "nia@x.test" }))
    .id;
});

afterAll(() => cleanup(db, accounts, users));

async function visitorIdea(title: string) {
  return submitIdea(db, pub, {
    workspaceId: owner.workspaceId,
    board: boardSlug,
    title,
    details: "Details here",
    trackedUserId: visitorId,
    source: "public",
  });
}

describe("preferences", () => {
  it("defaults by role and saves per member", async () => {
    expect(await getMyPrefs(db, owner)).toEqual(defaultPrefs("owner"));
    expect(await getMyPrefs(db, member)).toEqual({
      newFeedback: "off",
      newComment: "off",
    });
    await setMyPrefs(db, member, { newFeedback: "instant", newComment: "off" });
    expect((await getMyPrefs(db, member)).newFeedback).toBe("instant");
  });

  it("only reaches members who can see the workspace", async () => {
    await setMyPrefs(db, outsider, {
      newFeedback: "instant",
      newComment: "instant",
    });
    const to = (
      await recipients(
        db,
        { accountId: owner.accountId, workspaceId: owner.workspaceId },
        "newFeedback",
        "instant",
      )
    ).map((r) => r.userId);
    expect(to).toEqual(
      expect.arrayContaining([owner.userId, admin.userId, member.userId]),
    );
    expect(to).not.toContain(outsider.userId);
    expect(to).not.toContain(otherOwner);
  });
});

describe("instant alerts", () => {
  it("emails the team about a visitor's idea, not about the team's own", async () => {
    const idea = await visitorIdea("Calendar sync");
    const emails = await newFeedbackEmails(db, idea.id);
    expect(emails.map((e) => e.userId)).toEqual(
      expect.arrayContaining([owner.userId, admin.userId, member.userId]),
    );
    expect(emails[0]).toMatchObject({
      template: "new-feedback",
      props: { title: "Calendar sync", author: "Nia", pending: true },
    });
    expect(emails[0]?.props).toHaveProperty(
      "url",
      expect.stringContaining("/feedback/inbox?feedback="),
    );

    const own = await createFeedback(db, owner, { boardId, title: "Ours" });
    expect(await newFeedbackEmails(db, own.id)).toEqual([]);
  });

  it("emails about comments, never to their author", async () => {
    const idea = await createFeedback(db, owner, { boardId, title: "Talk" });
    const team = await addTeamComment(db, admin, {
      target: { feedbackId: idea.id },
      body: "Looking into it",
      internal: true,
    });
    const toTeam = (await newCommentEmails(db, team.id)).map((e) => e.userId);
    expect(toTeam).toContain(owner.userId);
    expect(toTeam).not.toContain(admin.userId);

    const visitor = await addPublicComment(db, pub, {
      target: { feedbackId: idea.id },
      workspaceId: owner.workspaceId,
      body: "Me too",
      trackedUserId: visitorId,
      holdForApproval: true,
    });
    const [email] = await newCommentEmails(db, visitor.id);
    expect(email).toMatchObject({
      template: "new-comment",
      props: { author: "Nia", pending: true, targetTitle: "Talk" },
    });
  });
});

describe("daily digest", () => {
  it("collects the day's ideas and comments for daily subscribers", async () => {
    await setMyPrefs(db, admin, { newFeedback: "daily", newComment: "daily" });
    const since = new Date(Date.now() - 60_000);
    await visitorIdea("Digest me");
    const digests = (await digestEmails(db, since)).filter(
      (d) => d.workspaceId === owner.workspaceId,
    );
    expect(digests.map((d) => d.userId)).toEqual([admin.userId]);
    const props = digests[0]?.props as { ideas: { title: string }[] };
    expect(props.ideas.map((i) => i.title)).toContain("Digest me");
  });
});
