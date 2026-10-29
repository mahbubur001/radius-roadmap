import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { currentSettings } from "@/test/roadmap-settings";
import { setCardFollow } from "./card-activity";
import { completionSweep } from "./card-completion-emails";
import { createCard, moveCard, setCardArchived } from "./cards";
import type { WorkspaceContext } from "./context";
import { listColumns, listRoadmaps, saveRoadmapSettings } from "./roadmaps";
import { createWorkspace } from "./workspaces";

// Completion emails to card followers (doc 24 R4).

let ws: WorkspaceContext;
let member: WorkspaceContext;
let roadmapId: string;
let firstColumn: string;
let doneColumn: string;
const accounts: string[] = [];
const users: string[] = [];

beforeAll(async () => {
  const a = await createTestAccount(db, "done-a");
  const [o, m] = [
    await createTestUser(db, "done-owner"),
    await createTestUser(db, "done-member"),
  ];
  accounts.push(a);
  users.push(o, m);
  const ctx = await addTestMember(db, a, o, "owner");
  const w = await createWorkspace(db, ctx, { name: "Done", slug: "done" });
  ws = { ...ctx, workspaceId: w.id, workspaceSlug: w.slug };
  member = {
    ...(await addTestMember(db, a, m, "admin")),
    workspaceId: w.id,
    workspaceSlug: w.slug,
  };
  const [roadmap] = await listRoadmaps(db, ws);
  roadmapId = roadmap?.id ?? "";
  const columns = await listColumns(db, ws, roadmapId);
  firstColumn = columns[0]?.id ?? "";
  doneColumn = columns.find((c) => c.isDone)?.id ?? "";
});

afterAll(() => cleanup(db, accounts, users));

async function followedCard(title: string) {
  const card = await createCard(db, ws, {
    roadmapId,
    columnId: firstColumn,
    title,
  });
  await setCardFollow(db, member, card.id, true);
  return card;
}

const complete = (id: string) =>
  moveCard(db, ws, { id, columnId: doneColumn, prevId: null, nextId: null });

describe("completion emails", () => {
  it("emails each follower once when a card is completed", async () => {
    const card = await followedCard("Bulk import");
    expect(await completionSweep(db, ws.workspaceId)).toEqual([]);
    await complete(card.id);
    const emails = await completionSweep(db, ws.workspaceId);
    expect(emails).toHaveLength(1);
    expect(emails[0]?.email).toMatchObject({
      template: "card-completed",
      to: `${users[1]}@example.test`,
      props: { cardTitle: "Bulk import", workspaceName: "Done" },
    });
    expect(emails[0]?.email.props).toMatchObject({
      url: expect.stringContaining(`card=${card.id}`),
    });
    expect(await completionSweep(db, ws.workspaceId)).toEqual([]);
  });

  it("a card moved back out before the sweep sends nothing", async () => {
    const card = await followedCard("Undo");
    await complete(card.id);
    await moveCard(db, ws, {
      id: card.id,
      columnId: firstColumn,
      prevId: null,
      nextId: null,
    });
    expect(await completionSweep(db, ws.workspaceId)).toEqual([]);
  });

  it("nothing when the roadmap's switch is off or the card is archived; never later", async () => {
    const quiet = await followedCard("Quiet");
    const archived = await followedCard("Archived");
    await saveRoadmapSettings(db, ws, {
      ...(await currentSettings(db, ws, roadmapId)),
      notifyOnComplete: false,
    });
    await complete(quiet.id);
    await complete(archived.id);
    await setCardArchived(db, ws, archived.id, true);
    expect(await completionSweep(db, ws.workspaceId)).toEqual([]);
    await saveRoadmapSettings(db, ws, {
      ...(await currentSettings(db, ws, roadmapId)),
      notifyOnComplete: true,
    });
    expect(await completionSweep(db, ws.workspaceId)).toEqual([]);
  });
});
