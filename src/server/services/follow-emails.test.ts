import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { db } from "@/server/db/client";
import { emailSuppressions, trackedUsers } from "@/server/db/schema";
import { verifyLink } from "@/server/internal-signature";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { createCard } from "./cards";
import { setIdeaFollow } from "./comments";
import type { PublicContext, WorkspaceContext } from "./context";
import {
  createFeedback,
  listBoards,
  listStatuses,
  updateFeedback,
} from "./feedback";
import { linkCard } from "./feedback-links";
import { shippedEmails, statusSweep } from "./follow-emails";
import { listColumns, listRoadmaps } from "./roadmaps";
import { suppress } from "./subscribers";
import { createUpdate, publishUpdate, setUpdateCards } from "./updates";
import { guestSignIn } from "./voter-auth";
import { createWorkspace, updatePublicSite } from "./workspaces";

// Emails to idea followers (doc 23 step 6).

let ws: WorkspaceContext;
let pub: PublicContext;
let boardId: string;
let verifiedId: string;
let guestId: string;
const accounts: string[] = [];
const users: string[] = [];

const SITE = {
  showRoadmap: true,
  showIdeas: true,
  showUpdates: true,
  commentsEnabled: false,
  approveComments: false,
  followsEnabled: true,
  termsUrl: "",
  privacyUrl: "",
};

beforeAll(async () => {
  const a = await createTestAccount(db, "fol-a");
  const o = await createTestUser(db, "fol-owner");
  accounts.push(a);
  users.push(o);
  const ctx = await addTestMember(db, a, o, "owner");
  const w = await createWorkspace(db, ctx, { name: "Fol", slug: "fol" });
  ws = { ...ctx, workspaceId: w.id, workspaceSlug: w.slug };
  pub = { accountId: a };
  await updatePublicSite(db, ws, SITE);
  boardId = (await listBoards(db, ws))[0]?.id ?? "";
  verifiedId = (
    await guestSignIn(db, pub, { name: "Vee", email: "vee@x.test" })
  ).id;
  await db
    .update(trackedUsers)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(trackedUsers.id, verifiedId));
  guestId = (await guestSignIn(db, pub, { name: "Gus", email: "gus@x.test" }))
    .id;
});

afterAll(() => cleanup(db, accounts, users));

async function followedIdea(title: string) {
  const idea = await createFeedback(db, ws, { boardId, title });
  await setIdeaFollow(db, pub, idea.id, verifiedId, true);
  await setIdeaFollow(db, pub, idea.id, guestId, true);
  return idea;
}

async function statusNamed(name: string) {
  const s = (await listStatuses(db, ws)).find((x) => x.name === name);
  if (!s) throw new Error(`no status ${name}`);
  return s.id;
}

describe("status changed", () => {
  it("emails verified followers once, with a signed unfollow link", async () => {
    const idea = await followedIdea("Calendar sync");
    expect(await statusSweep(db, ws.workspaceId)).toEqual([]);

    await updateFeedback(db, ws, {
      id: idea.id,
      statusId: await statusNamed("Planned"),
    });
    const emails = await statusSweep(db, ws.workspaceId);
    expect(emails.map((e) => e.email.to)).toEqual(["vee@x.test"]);
    expect(emails[0]?.email.props).toMatchObject({
      ideaTitle: "Calendar sync",
      status: { name: "Planned" },
    });
    const url = new URL(
      (emails[0]?.email.props as { unfollowUrl: string }).unfollowUrl,
    );
    expect(
      verifyLink(
        env.BETTER_AUTH_SECRET,
        `unfollow:${url.searchParams.get("u")}:${url.searchParams.get("f")}`,
        url.searchParams.get("sig") ?? "",
      ),
    ).toBe(true);
    // Recorded: a second sweep sends nothing.
    expect(await statusSweep(db, ws.workspaceId)).toEqual([]);
  });

  it("a change and change back before the sweep sends nothing", async () => {
    const idea = await followedIdea("Undo me");
    const first = (await listStatuses(db, ws))[0]?.id ?? "";
    await updateFeedback(db, ws, {
      id: idea.id,
      statusId: await statusNamed("Planned"),
    });
    await updateFeedback(db, ws, { id: idea.id, statusId: first });
    expect(await statusSweep(db, ws.workspaceId)).toEqual([]);
  });

  it("nothing when follows are off or the address is suppressed", async () => {
    const idea = await followedIdea("Quiet");
    await updatePublicSite(db, ws, { ...SITE, followsEnabled: false });
    await updateFeedback(db, ws, {
      id: idea.id,
      statusId: await statusNamed("Planned"),
    });
    expect(await statusSweep(db, ws.workspaceId)).toEqual([]);
    await updatePublicSite(db, ws, SITE);

    await suppress(db, pub, "vee@x.test", "unsubscribed_all");
    await updateFeedback(db, ws, {
      id: idea.id,
      statusId: await statusNamed("In progress"),
    });
    expect(await statusSweep(db, ws.workspaceId)).toEqual([]);
  });
});

describe("shipped", () => {
  it("emails followers of ideas linked to the post's cards", async () => {
    // Lift the suppression from the previous test.
    await db
      .delete(emailSuppressions)
      .where(eq(emailSuppressions.email, "vee@x.test"));
    const idea = await followedIdea("Dark mode");
    const [roadmap] = await listRoadmaps(db, ws);
    const [column] = await listColumns(db, ws, roadmap?.id ?? "");
    const card = await createCard(db, ws, {
      roadmapId: roadmap?.id ?? "",
      columnId: column?.id ?? "",
      title: "Dark mode card",
    });
    await linkCard(db, ws, idea.id, card.id);
    const post = await createUpdate(db, ws, {});
    await setUpdateCards(db, ws, post.id, [card.id]);
    expect(await shippedEmails(db, post.id)).toEqual([]); // still a draft
    await publishUpdate(db, ws, post.id);
    const emails = await shippedEmails(db, post.id);
    expect(emails.map((e) => e.email.to)).toEqual(["vee@x.test"]);
    expect(emails[0]?.email.template).toBe("idea-shipped");
  });
});
