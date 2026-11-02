import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import type { WorkspaceContext } from "./context";
import { createFeedback, listBoards, similarFeedback } from "./feedback";
import { createWorkspace } from "./workspaces";

const accounts: string[] = [];
const users: string[] = [];

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

let mine: WorkspaceContext;
let csv: string;
let spreadsheet: string;

beforeAll(async () => {
  mine = await workspace("similar-a");
  const other = await workspace("similar-b");
  csv = (await idea(mine, "Export the board to CSV")).id;
  spreadsheet = (await idea(mine, "Export board data as CSV file")).id;
  await idea(mine, "Dark mode for the widget");
  await idea(mine, "Export invoices"); // one shared word only
  await idea(other, "Export board to CSV please");
});

afterAll(async () => {
  await cleanup(db, accounts, users);
});

describe("similarFeedback", () => {
  it("finds items sharing most title words, never another account's", async () => {
    const found = await similarFeedback(db, mine, csv);
    expect(found.map((f) => f.id)).toEqual([spreadsheet]);
  });

  it("returns nothing for an item with no look-alikes", async () => {
    const lonely = await idea(mine, "Keyboard shortcuts everywhere");
    expect(await similarFeedback(db, mine, lonely.id)).toEqual([]);
  });
});
