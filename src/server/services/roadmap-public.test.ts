import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import {
  ForbiddenError,
  NotFoundError,
  type WorkspaceContext,
} from "./context";
import { listRoadmaps, setRoadmapPublic } from "./roadmaps";
import { createWorkspace } from "./workspaces";

const accounts: string[] = [];
const users: string[] = [];
let owner: WorkspaceContext;
let member: WorkspaceContext;
let stranger: WorkspaceContext;

beforeAll(async () => {
  const a = await createTestAccount(db, "rmpub-a");
  const b = await createTestAccount(db, "rmpub-b");
  const o = await createTestUser(db, "rmpub-owner");
  const m = await createTestUser(db, "rmpub-member");
  const s = await createTestUser(db, "rmpub-stranger");
  accounts.push(a, b);
  users.push(o, m, s);
  const octx = await addTestMember(db, a, o, "owner");
  const ws = await createWorkspace(db, octx, { name: "Pub", slug: "pub" });
  owner = { ...octx, workspaceId: ws.id, workspaceSlug: ws.slug };
  member = {
    ...(await addTestMember(db, a, m, "member")),
    workspaceId: ws.id,
    workspaceSlug: ws.slug,
  };
  const sctx = await addTestMember(db, b, s, "owner");
  const other = await createWorkspace(db, sctx, {
    name: "Other",
    slug: "other",
  });
  stranger = { ...sctx, workspaceId: other.id, workspaceSlug: other.slug };
});

afterAll(() => cleanup(db, accounts, users));

describe("setRoadmapPublic", () => {
  it("hides and shows a roadmap; members and other accounts can't", async () => {
    const [roadmap] = await listRoadmaps(db, owner);
    const id = roadmap?.id as string;
    await setRoadmapPublic(db, owner, id, false);
    expect((await listRoadmaps(db, owner))[0]?.isPublic).toBe(false);
    await expect(setRoadmapPublic(db, member, id, true)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(setRoadmapPublic(db, stranger, id, true)).rejects.toThrow(
      NotFoundError,
    );
    await setRoadmapPublic(db, owner, id, true);
    expect((await listRoadmaps(db, owner))[0]?.isPublic).toBe(true);
  });
});
