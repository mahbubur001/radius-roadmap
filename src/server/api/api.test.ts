import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { GET as getAccount } from "@/app/api/v1/account/route";
import {
  DELETE as deleteFeedback,
  GET as getFeedback,
  PATCH as patchFeedback,
} from "@/app/api/v1/feedback/[id]/route";
import {
  POST as createFeedback,
  GET as listFeedback,
} from "@/app/api/v1/feedback/route";
import { PATCH as patchCard } from "@/app/api/v1/roadmap-cards/[id]/route";
import {
  POST as createCardRoute,
  GET as listCards,
} from "@/app/api/v1/roadmap-cards/route";
import { GET as listRoadmaps } from "@/app/api/v1/roadmaps/route";
import { PATCH as patchUpdateRoute } from "@/app/api/v1/updates/[id]/route";
import {
  POST as createUpdateRoute,
  GET as listUpdates,
} from "@/app/api/v1/updates/route";
import { GET as listWorkspaces } from "@/app/api/v1/workspaces/route";
import { db } from "@/server/db/client";
import { createApiKey } from "@/server/services/api-keys";
import { createCard } from "@/server/services/cards";
import type { WorkspaceContext } from "@/server/services/context";
import { listBoards, listStatuses } from "@/server/services/feedback";
import { billing } from "@/server/services/plan-limits";
import {
  listColumns,
  listRoadmaps as roadmapsOf,
} from "@/server/services/roadmaps";
import { createWorkspace } from "@/server/services/workspaces";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { openApiDocument } from "./openapi";
import {
  accountSchema,
  cardSchema,
  feedbackSchema,
  listOf,
  one,
  roadmapSchema,
  updateSchema,
  workspaceSchema,
} from "./schemas";

// Public REST API v1 (doc 27 steps 2–3): routes called directly, responses
// checked against the schemas the OpenAPI document is built from.

vi.mock("@/server/public-cache", () => ({
  invalidatePublic: vi.fn(),
  invalidateSite: vi.fn(),
  publicTag: (id: string) => `ws:${id}`,
  siteTag: (id: string) => `site:${id}`,
}));
vi.mock("@/server/queue/notifications", () => ({
  notify: vi.fn(),
  queueStatusSweep: vi.fn(),
  schedulePublish: vi.fn(),
}));

let ws: WorkspaceContext; // account A
let wsB: WorkspaceContext; // account B
let readKey: string;
let writeKey: string;
let keyB: string;
let roadmapId: string;
let columnIds: string[];
let boardId: string;
const accounts: string[] = [];
const users: string[] = [];
const BASE = "http://localhost:3000/api/v1";

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "api-a"),
    await createTestAccount(db, "api-b"),
  ];
  const [oA, oB] = [
    await createTestUser(db, "api-owner-a"),
    await createTestUser(db, "api-owner-b"),
  ];
  accounts.push(a, b);
  users.push(oA, oB);
  const ctxA = await addTestMember(db, a, oA, "owner");
  const ctxB = await addTestMember(db, b, oB, "owner");
  const w = await createWorkspace(db, ctxA, { name: "Apix", slug: "apix" });
  const w2 = await createWorkspace(db, ctxB, { name: "Bpi", slug: "bpi" });
  ws = { ...ctxA, workspaceId: w.id, workspaceSlug: w.slug };
  wsB = { ...ctxB, workspaceId: w2.id, workspaceSlug: w2.slug };
  readKey = (await createApiKey(db, ctxA, { name: "r", permission: "read" }))
    .key;
  writeKey = (await createApiKey(db, ctxA, { name: "w", permission: "write" }))
    .key;
  keyB = (await createApiKey(db, ctxB, { name: "b", permission: "write" })).key;
  const [roadmap] = await roadmapsOf(db, ws);
  roadmapId = roadmap?.id ?? "";
  columnIds = (await listColumns(db, ws, roadmapId)).map((c) => c.id);
  boardId = (await listBoards(db, ws))[0]?.id ?? "";
  for (const title of ["One", "Two", "Three"]) {
    await createCard(db, ws, {
      roadmapId,
      columnId: columnIds[0] ?? "",
      title,
    });
  }
});

afterAll(() => cleanup(db, accounts, users));

afterEach(() => {
  vi.restoreAllMocks();
});

type Handler<P> = (
  req: NextRequest,
  ctx: { params: Promise<P> },
) => Promise<Response>;

async function call<P = Record<string, never>>(
  handler: Handler<P>,
  path: string,
  init: { key?: string; method?: string; body?: unknown; params?: P } = {},
) {
  const headers = new Headers();
  if (init.key) headers.set("authorization", `Bearer ${init.key}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const res = await handler(
    new NextRequest(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    { params: Promise.resolve((init.params ?? {}) as P) },
  );
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

describe("auth", () => {
  it("needs a valid bearer key", async () => {
    expect((await call(getAccount, "/account")).status).toBe(401);
    expect(
      (await call(getAccount, "/account", { key: "rr_live_nope" })).status,
    ).toBe(401);
    const ok = await call(getAccount, "/account", { key: readKey });
    expect(ok.status).toBe(200);
    expect(one(accountSchema).parse(ok.json).data.id).toBe(ws.accountId);
  });

  it("needs the Enterprise plan when billing is on", async () => {
    vi.spyOn(billing, "enabled").mockReturnValue(true);
    expect((await call(getAccount, "/account", { key: readKey })).status).toBe(
      401,
    );
  });

  it("read-only keys can't write", async () => {
    const res = await call(createFeedback, "/feedback", {
      key: readKey,
      method: "POST",
      body: { board_id: boardId, title: "Nope" },
    });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("forbidden");
  });
});

describe("reads", () => {
  it("lists only the key's account, in the documented shapes", async () => {
    const wsList = listOf(workspaceSchema).parse(
      (await call(listWorkspaces, "/workspaces", { key: readKey })).json,
    );
    expect(wsList.data.map((w) => w.id)).toEqual([ws.workspaceId]);

    const roadmaps = listOf(roadmapSchema).parse(
      (await call(listRoadmaps, "/roadmaps", { key: readKey })).json,
    );
    expect(roadmaps.data).toHaveLength(1);
    expect(roadmaps.data[0]?.columns.length).toBeGreaterThan(0);

    const cards = listOf(cardSchema).parse(
      (await call(listCards, "/roadmap-cards", { key: readKey })).json,
    );
    expect(cards.data.map((c) => c.title)).toEqual(["Three", "Two", "One"]);

    // Account B's key sees none of it.
    const other = await call(listCards, "/roadmap-cards", { key: keyB });
    expect(other.json.data).toEqual([]);
    const filtered = await call(
      listCards,
      `/roadmap-cards?workspace_id=${ws.workspaceId}`,
      { key: keyB },
    );
    expect(filtered.json.data).toEqual([]);
  });

  it("pages with a cursor", async () => {
    const first = await call(listCards, "/roadmap-cards?limit=2", {
      key: readKey,
    });
    expect(first.json.data).toHaveLength(2);
    expect(first.json.next_cursor).toEqual(expect.any(String));
    const second = await call(
      listCards,
      `/roadmap-cards?limit=2&cursor=${first.json.next_cursor}`,
      { key: readKey },
    );
    expect(second.json.data.map((c: { title: string }) => c.title)).toEqual([
      "One",
    ]);
    expect(second.json.next_cursor).toBeNull();
  });

  it("rejects bad query parameters and unknown ids", async () => {
    const bad = await call(listCards, "/roadmap-cards?limit=1000", {
      key: readKey,
    });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("invalid_request");
    for (const id of ["not-a-uuid", "00000000-0000-4000-8000-000000000000"]) {
      const res = await call(getFeedback, `/feedback/${id}`, {
        key: readKey,
        params: { id },
      });
      expect(res.status).toBe(404);
    }
  });
});

describe("writes", () => {
  it("creates, updates and deletes feedback", async () => {
    const [, second] = await listStatuses(db, ws);
    const created = await call(createFeedback, "/feedback", {
      key: writeKey,
      method: "POST",
      body: {
        board_id: boardId,
        title: "Dark mode",
        details: "Please\nThanks",
      },
    });
    expect(created.status).toBe(201);
    const item = one(feedbackSchema).parse(created.json).data;
    expect(item).toMatchObject({
      title: "Dark mode",
      details: "Please\nThanks",
      source: "admin",
    });

    const patched = await call(patchFeedback, `/feedback/${item.id}`, {
      key: writeKey,
      method: "PATCH",
      body: { status_id: second?.id, title: "Dark mode v2" },
      params: { id: item.id },
    });
    expect(patched.json.data).toMatchObject({
      title: "Dark mode v2",
      status_id: second?.id,
    });

    const invalid = await call(patchFeedback, `/feedback/${item.id}`, {
      key: writeKey,
      method: "PATCH",
      body: { title: "" },
      params: { id: item.id },
    });
    expect(invalid.status).toBe(422);

    // Another account can't touch it.
    const foreign = await call(patchFeedback, `/feedback/${item.id}`, {
      key: keyB,
      method: "PATCH",
      body: { title: "Mine now" },
      params: { id: item.id },
    });
    expect(foreign.status).toBe(404);

    const gone = await call(deleteFeedback, `/feedback/${item.id}`, {
      key: writeKey,
      method: "DELETE",
      params: { id: item.id },
    });
    expect(gone.status).toBe(204);
    const list = await call(listFeedback, "/feedback", { key: readKey });
    expect(list.json.data.map((f: { id: string }) => f.id)).not.toContain(
      item.id,
    );
  });

  it("creates a card and moves it; refuses another account's roadmap", async () => {
    const created = await call(createCardRoute, "/roadmap-cards", {
      key: writeKey,
      method: "POST",
      body: {
        roadmap_id: roadmapId,
        column_id: columnIds[0],
        title: "From the API",
        description: "Hello",
        planned_for: "2026-12-01",
      },
    });
    expect(created.status).toBe(201);
    const card = one(cardSchema).parse(created.json).data;
    expect(card).toMatchObject({
      description: "Hello",
      planned_for: "2026-12-01",
    });

    const moved = await call(patchCard, `/roadmap-cards/${card.id}`, {
      key: writeKey,
      method: "PATCH",
      body: { column_id: columnIds[1], completed: true },
      params: { id: card.id },
    });
    expect(moved.json.data).toMatchObject({
      column_id: columnIds[1],
      completed: true,
    });

    const foreign = await call(createCardRoute, "/roadmap-cards", {
      key: keyB,
      method: "POST",
      body: { roadmap_id: roadmapId, column_id: columnIds[0], title: "x" },
    });
    expect(foreign.status).toBe(404);
  });

  it("creates and publishes an update", async () => {
    const created = await call(createUpdateRoute, "/updates", {
      key: writeKey,
      method: "POST",
      body: {
        workspace_id: ws.workspaceId,
        title: "v2 is out",
        content: "Big release",
      },
    });
    expect(created.status).toBe(201);
    const post = one(updateSchema).parse(created.json).data;
    expect(post.status).toBe("draft");
    const published = await call(patchUpdateRoute, `/updates/${post.id}`, {
      key: writeKey,
      method: "PATCH",
      body: { status: "published" },
      params: { id: post.id },
    });
    expect(published.json.data).toMatchObject({ status: "published" });
    const list = listOf(updateSchema).parse(
      (await call(listUpdates, "/updates?status=published", { key: readKey }))
        .json,
    );
    expect(list.data.map((u) => u.title)).toContain("v2 is out");
    // Account B's workspace id is refused.
    const foreign = await call(createUpdateRoute, "/updates", {
      key: writeKey,
      method: "POST",
      body: { workspace_id: wsB.workspaceId, title: "x" },
    });
    expect(foreign.status).toBe(404);
  });
});

describe("OpenAPI", () => {
  it("documents every route with its schemas", () => {
    const doc = openApiDocument("https://app.example.com");
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining([
        "RoadmapCard",
        "Feedback",
        "CreateFeedback",
        "Error",
      ]),
    );
    expect(Object.keys(doc.paths["/feedback/{id}"] ?? {}).sort()).toEqual([
      "delete",
      "get",
      "patch",
    ]);
    // Every $ref points at a defined component.
    const refs =
      JSON.stringify(doc).match(/#\/components\/schemas\/\w+/g) ?? [];
    for (const r of new Set(refs)) {
      expect(doc.components.schemas).toHaveProperty(r.split("/").pop() ?? "");
    }
  });
});
