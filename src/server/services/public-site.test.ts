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
  type PublicContext,
  type WorkspaceContext,
} from "./context";
import {
  getPublicWorkspace,
  listPublicWorkspaces,
  publicPathStatus,
} from "./public-site";
import { createWorkspace, updatePublicSite } from "./workspaces";

// Public site modules (doc 22 step 2): switching the Roadmap off hides it
// everywhere (pages, 404s, workspace list), only for that workspace.

let owner: WorkspaceContext;
let member: WorkspaceContext;
let other: WorkspaceContext;
let pub: PublicContext;
const accounts: string[] = [];
const users: string[] = [];

const ON = {
  showRoadmap: true,
  showIdeas: true,
  showUpdates: true,
  commentsEnabled: false,
  approveComments: false,
  followsEnabled: false,
  termsUrl: "",
  privacyUrl: "",
};

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "mod-a"),
    await createTestAccount(db, "mod-b"),
  ];
  const [oA, oB, m] = [
    await createTestUser(db, "mod-owner-a"),
    await createTestUser(db, "mod-owner-b"),
    await createTestUser(db, "mod-member"),
  ];
  accounts.push(a, b);
  users.push(oA, oB, m);
  const ctxA = await addTestMember(db, a, oA, "owner");
  const ctxB = await addTestMember(db, b, oB, "owner");
  const ctxM = await addTestMember(db, a, m, "member");
  const ws = await createWorkspace(db, ctxA, { name: "Mod", slug: "mod" });
  const wsB = await createWorkspace(db, ctxB, { name: "Other", slug: "other" });
  owner = { ...ctxA, workspaceId: ws.id, workspaceSlug: ws.slug };
  member = { ...ctxM, workspaceId: ws.id, workspaceSlug: ws.slug };
  other = { ...ctxB, workspaceId: wsB.id, workspaceSlug: wsB.slug };
  pub = { accountId: a };
});

afterAll(() => cleanup(db, accounts, users));

describe("public site modules", () => {
  it("shows the roadmap by default", async () => {
    const ws = await getPublicWorkspace(db, pub, "mod");
    // New workspaces also get a public ideas board.
    expect(ws?.modules).toEqual({
      roadmap: true,
      updates: false,
      ideas: true,
      articles: false,
    });
    expect(await publicPathStatus(db, pub, ["mod", "roadmap"])).toBe("ok");
  });

  it("hides the roadmap everywhere when switched off, and back on", async () => {
    await updatePublicSite(db, owner, { ...ON, showRoadmap: false });
    expect((await getPublicWorkspace(db, pub, "mod"))?.modules).toEqual({
      roadmap: false,
      updates: false,
      ideas: true,
      articles: false,
    });
    expect(await publicPathStatus(db, pub, ["mod", "roadmap"])).toBe("missing");
    // The workspace root now opens Ideas.
    expect(await publicPathStatus(db, pub, ["mod"])).toEqual({
      redirect: "/mod/ideas",
    });

    // With Ideas off too, the workspace isn't public at all.
    await updatePublicSite(db, owner, {
      ...ON,
      showRoadmap: false,
      showIdeas: false,
      showUpdates: true,
    });
    expect(await getPublicWorkspace(db, pub, "mod")).toBeNull();
    expect(
      (await listPublicWorkspaces(db, pub)).map((w) => w.slug),
    ).not.toContain("mod");

    await updatePublicSite(db, owner, ON);
    expect(await publicPathStatus(db, pub, ["mod", "roadmap"])).toBe("ok");
  });

  it("stores legal links and keeps other settings", async () => {
    const settings = await updatePublicSite(db, owner, {
      ...ON,
      termsUrl: "https://example.com/terms",
    });
    expect(settings).toMatchObject({
      termsUrl: "https://example.com/terms",
      privacyUrl: null,
      showRoadmap: true,
    });
    await expect(
      updatePublicSite(db, owner, { ...ON, termsUrl: "javascript:alert(1)" }),
    ).rejects.toThrow();
  });

  it("only owners and admins of this account change it", async () => {
    await expect(updatePublicSite(db, member, ON)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      updatePublicSite(db, { ...other, workspaceId: owner.workspaceId }, ON),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
