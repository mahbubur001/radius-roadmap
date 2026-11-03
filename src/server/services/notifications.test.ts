import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { feedbackItems, voteMilestones, votes } from "@/server/db/schema";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { addPublicComment, addTeamComment } from "./comments";
import type { PublicContext, WorkspaceContext } from "./context";
import { digestEmails } from "./digests";
import { createFeedback, listBoards } from "./feedback";
import {
  defaultPrefs,
  getMyPrefs,
  newCommentEmails,
  newFeedbackEmails,
  recipients,
  setMyPrefs,
  voteMilestoneEmails,
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
    expect(await getMyPrefs(db, member)).toEqual(defaultPrefs("member"));
    expect(defaultPrefs("member")).toMatchObject({
      newFeedback: "off",
      votes: "off",
      replies: "instant",
    });
    await setMyPrefs(db, member, {
      ...defaultPrefs("member"),
      newFeedback: "instant",
      newComment: "off",
      newSubscriber: "off",
    });
    expect((await getMyPrefs(db, member)).newFeedback).toBe("instant");
  });

  it("only reaches members who can see the workspace", async () => {
    await setMyPrefs(db, outsider, {
      ...defaultPrefs("member"),
      newFeedback: "instant",
      newComment: "instant",
      newSubscriber: "off",
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

describe("vote milestones (doc 33)", () => {
  it("emails owners and admins once per milestone, never another account", async () => {
    const idea = await visitorIdea("Milestone idea");
    const first = await voteMilestoneEmails(db, { feedbackId: idea.id }, 10);
    expect(first.map((e) => e.userId).sort()).toEqual(
      [owner.userId, admin.userId].sort(),
    );
    expect(first.map((e) => e.userId)).not.toContain(otherOwner);
    expect(first[0]?.props).toMatchObject({
      kind: "idea",
      title: "Milestone idea",
      milestone: 10,
    });
    // A retry within the hour may send again (email job ids dedupe it)…
    expect(
      await voteMilestoneEmails(db, { feedbackId: idea.id }, 10),
    ).toHaveLength(2);
    // …but the same milestone reached again later never emails.
    await db
      .update(voteMilestones)
      .set({ createdAt: new Date(Date.now() - 2 * 3600 * 1000) })
      .where(eq(voteMilestones.feedbackId, idea.id));
    expect(await voteMilestoneEmails(db, { feedbackId: idea.id }, 10)).toEqual(
      [],
    );
    // Off means off.
    await setMyPrefs(db, admin, { ...defaultPrefs("admin"), votes: "off" });
    const next = await voteMilestoneEmails(db, { feedbackId: idea.id }, 25);
    expect(next.map((e) => e.userId)).toEqual([owner.userId]);
    await setMyPrefs(db, admin, defaultPrefs("admin"));
  });
});

describe("daily digest", () => {
  it("collects the day's ideas and comments for daily subscribers", async () => {
    await setMyPrefs(db, admin, {
      ...defaultPrefs("admin"),
      newFeedback: "daily",
      newComment: "daily",
      newSubscriber: "off",
    });
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

describe("replies to you (doc 33)", () => {
  it("a member who commented before gets one reply email, not two", async () => {
    await setMyPrefs(db, member, {
      ...defaultPrefs("member"),
      newComment: "instant",
    });
    const idea = await visitorIdea("Reply idea");
    await addTeamComment(db, member, {
      target: { feedbackId: idea.id },
      body: "Can you say more?",
      internal: false,
    });
    const answer = await addPublicComment(db, pub, {
      target: { feedbackId: idea.id },
      workspaceId: owner.workspaceId,
      body: "Sure: for invoices",
      trackedUserId: visitorId,
      holdForApproval: false,
    });
    const emails = await newCommentEmails(db, answer.id);
    const toMember = emails.filter((e) => e.userId === member.userId);
    expect(toMember).toHaveLength(1);
    expect(toMember[0]?.props).toMatchObject({ reply: true });
    // The owner never commented there: a plain comment email.
    expect(emails.find((e) => e.userId === owner.userId)?.props).toMatchObject({
      reply: false,
    });
    // Replies off, comments off: nothing for the member.
    await setMyPrefs(db, member, { ...defaultPrefs("member"), replies: "off" });
    const again = await addPublicComment(db, pub, {
      target: { feedbackId: idea.id },
      workspaceId: owner.workspaceId,
      body: "And receipts",
      trackedUserId: visitorId,
      holdForApproval: false,
    });
    expect(
      (await newCommentEmails(db, again.id)).map((e) => e.userId),
    ).not.toContain(member.userId);
    await setMyPrefs(db, member, defaultPrefs("member"));
  });
});

describe("digest sections (doc 33)", () => {
  const ours = (list: Awaited<ReturnType<typeof digestEmails>>) =>
    list.filter((d) => d.workspaceId === owner.workspaceId);
  type Props = {
    review?: { total: number; items: { title: string }[] };
    votes?: { total: number; top: { title: string; votes: number }[] };
    replies?: { target: string; excerpt: string }[];
    comments: { excerpt: string }[];
    summary?: { ideas: number; votes: number };
  };
  const propsFor = (
    list: Awaited<ReturnType<typeof digestEmails>>,
    userId: string,
  ) => ours(list).find((d) => d.userId === userId)?.props as Props | undefined;

  it("reminds owners about ideas waiting more than a day", async () => {
    const idea = await visitorIdea("Old waiting idea");
    await db
      .update(feedbackItems)
      .set({ createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) })
      .where(eq(feedbackItems.id, idea.id));
    const list = await digestEmails(db, new Date(Date.now() - 60_000));
    const props = propsFor(list, owner.userId);
    expect(props?.review?.items.map((i) => i.title)).toContain(
      "Old waiting idea",
    );
    // Members don't get it by default; another account never does.
    expect(propsFor(list, member.userId)?.review).toBeUndefined();
    expect(list.map((d) => d.userId)).not.toContain(otherOwner);
  });

  it("puts new votes in the digest of members who chose it", async () => {
    await setMyPrefs(db, member, { ...defaultPrefs("member"), votes: "daily" });
    const idea = await visitorIdea("Voted idea");
    await db.insert(votes).values(
      ["v1", "v2", "v3"].map((v) => ({
        accountId: owner.accountId,
        workspaceId: owner.workspaceId,
        feedbackId: idea.id,
        visitorId: `${v}-${idea.id}`,
      })),
    );
    const list = await digestEmails(db, new Date(Date.now() - 60_000));
    const props = propsFor(list, member.userId);
    expect(props?.votes?.total).toBeGreaterThanOrEqual(3);
    expect(props?.votes?.top[0]).toMatchObject({
      title: "Voted idea",
      votes: 3,
    });
    await setMyPrefs(db, member, defaultPrefs("member"));
  });

  it("lists replies to your comments once, not also as new comments", async () => {
    await setMyPrefs(db, admin, {
      ...defaultPrefs("admin"),
      newComment: "daily",
      replies: "daily",
    });
    const idea = await visitorIdea("Thread idea");
    await addTeamComment(db, admin, {
      target: { feedbackId: idea.id },
      body: "We're on it",
      internal: false,
    });
    const since = new Date(Date.now() - 60_000);
    await addPublicComment(db, pub, {
      target: { feedbackId: idea.id },
      workspaceId: owner.workspaceId,
      body: "Thanks, any date?",
      trackedUserId: visitorId,
      holdForApproval: false,
    });
    const props = propsFor(await digestEmails(db, since), admin.userId);
    expect(props?.replies?.map((r) => r.excerpt)).toContain(
      "Thanks, any date?",
    );
    expect(props?.comments.map((c) => c.excerpt)).not.toContain(
      "Thanks, any date?",
    );
    await setMyPrefs(db, admin, defaultPrefs("admin"));
  });

  it("sends the weekly summary to owners and admins", async () => {
    const list = await digestEmails(
      db,
      new Date(Date.now() - 7 * 24 * 3600 * 1000),
      "weekly",
    );
    const props = propsFor(list, owner.userId);
    expect(props?.summary?.ideas).toBeGreaterThan(0);
    expect(propsFor(list, member.userId)?.summary).toBeUndefined();
  });
});
