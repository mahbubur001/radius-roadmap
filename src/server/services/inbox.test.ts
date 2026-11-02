import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { feedbackItems } from "@/server/db/schema";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import type { WorkspaceContext } from "./context";
import {
  createFeedback,
  inboxCount,
  listBoards,
  listFeedback,
  setFeedbackCompleted,
} from "./feedback";
import { createWorkspace } from "./workspaces";

const accounts: string[] = [];
const users: string[] = [];
let ws: WorkspaceContext;

beforeAll(async () => {
  const a = await createTestAccount(db, "inbox");
  const o = await createTestUser(db, "inbox-owner");
  accounts.push(a);
  users.push(o);
  const ctx = await addTestMember(db, a, o, "owner");
  const w = await createWorkspace(db, ctx, { name: "Inbox", slug: "inbox" });
  ws = { ...ctx, workspaceId: w.id, workspaceSlug: w.slug };
});

afterAll(() => cleanup(db, accounts, users));

describe("inbox", () => {
  it("lists every item its count includes, also ones completed before review", async () => {
    const [board] = await listBoards(db, ws);
    const idea = await createFeedback(db, ws, {
      boardId: board?.id as string,
      title: "Shipped before review",
    });
    // As if a visitor submitted it: waiting for review.
    await db
      .update(feedbackItems)
      .set({ review: "pending" })
      .where(eq(feedbackItems.id, idea.id));
    await setFeedbackCompleted(db, ws, idea.id, true);

    const inbox = await listFeedback(db, ws, {
      review: "pending",
      sort: "oldest",
    });
    expect(inbox.map((i) => i.id)).toEqual([idea.id]);
    expect(await inboxCount(db, ws)).toBe(1);
  });
});
