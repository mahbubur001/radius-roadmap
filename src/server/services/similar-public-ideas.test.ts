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
import { createFeedback, listBoards } from "./feedback";
import { similarPublicIdeas } from "./public-ideas";
import { createWorkspace } from "./workspaces";

const accounts: string[] = [];
const users: string[] = [];
let mine: WorkspaceContext;
let other: WorkspaceContext;

async function workspace(label: string): Promise<WorkspaceContext> {
  const account = await createTestAccount(db, label);
  const owner = await createTestUser(db, `${label}-owner`);
  accounts.push(account);
  users.push(owner);
  const ctx = await addTestMember(db, account, owner, "owner");
  const ws = await createWorkspace(db, ctx, { name: label, slug: label });
  return { ...ctx, workspaceId: ws.id, workspaceSlug: ws.slug };
}

async function idea(ctx: WorkspaceContext, title: string) {
  const [board] = await listBoards(db, ctx);
  return createFeedback(db, ctx, { boardId: board?.id as string, title });
}

beforeAll(async () => {
  mine = await workspace("simpub-a");
  other = await workspace("simpub-b");
  await idea(mine, "Download the board as a spreadsheet");
  await idea(mine, "Dark mode");
  const hidden = await idea(mine, "Spreadsheet import (private)");
  await db
    .update(feedbackItems)
    .set({ isPublic: false })
    .where(eq(feedbackItems.id, hidden.id));
  await idea(other, "Spreadsheet export for everyone");
});

afterAll(() => cleanup(db, accounts, users));

describe("similarPublicIdeas", () => {
  it("finds visible ideas sharing a word, never private ones or another account's", async () => {
    const found = await similarPublicIdeas(
      db,
      { accountId: mine.accountId },
      mine.workspaceId,
      "Export to spreadsheet",
    );
    expect(found.map((f) => f.title)).toEqual([
      "Download the board as a spreadsheet",
    ]);
  });

  it("waits for a few letters", async () => {
    expect(
      await similarPublicIdeas(
        db,
        { accountId: mine.accountId },
        mine.workspaceId,
        "dar",
      ),
    ).toEqual([]);
  });
});
