import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/server/db/client";
import {
  accountBilling,
  webhookDeliveries,
  webhookEndpoints,
} from "@/server/db/schema";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { type AccountContext, ConflictError, ForbiddenError } from "./context";
import { createFeedback, listBoards } from "./feedback";
import { billing, PlanLimitError } from "./plan-limits";
import {
  assertPublicUrl,
  createDeliveries,
  createEndpoint,
  deliver,
  isPrivateAddress,
  listDeliveries,
  listEndpoints,
  type PostResult,
  postJson,
  resendDelivery,
  revealSecret,
  SIGNATURE_HEADER,
  setEndpointEnabled,
  signPayload,
  testDelivery,
} from "./webhooks";
import { createWorkspace } from "./workspaces";

// Outgoing webhooks (doc 27 step 4).

let owner: AccountContext; // account A
let mate: AccountContext; // member, account A
let other: AccountContext; // owner, account B
let workspaceId: string;
const accounts: string[] = [];
const users: string[] = [];
/** A public address literal, so saving needs no DNS in tests. */
const URL_OK = "https://93.184.216.34/hooks";

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "hook-a"),
    await createTestAccount(db, "hook-b"),
  ];
  const ids = [
    await createTestUser(db, "hook-owner"),
    await createTestUser(db, "hook-member"),
    await createTestUser(db, "hook-other"),
  ];
  accounts.push(a, b);
  users.push(...ids);
  owner = await addTestMember(db, a, ids[0] as string, "owner");
  mate = await addTestMember(db, a, ids[1] as string, "member");
  other = await addTestMember(db, b, ids[2] as string, "owner");
  workspaceId = (await createWorkspace(db, owner, { name: "Hk", slug: "hk" }))
    .id;
});

afterAll(() => cleanup(db, accounts, users));

afterEach(async () => {
  vi.restoreAllMocks();
  for (const accountId of [owner.accountId, other.accountId]) {
    await db
      .delete(webhookEndpoints)
      .where(eq(webhookEndpoints.accountId, accountId));
  }
});

const fakeLookup =
  (address: string) =>
  (
    _host: string,
    _o: { all: true },
    cb: (e: Error | null, a: { address: string; family: number }[]) => void,
  ) =>
    cb(null, [{ address, family: address.includes(":") ? 6 : 4 }]);

describe("SSRF guard", () => {
  it("knows private and reserved addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "224.0.0.1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["93.184.216.34", "1.1.1.1", "2606:4700::1111"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("refuses http, credentials, private literals and names that resolve privately", async () => {
    await expect(
      assertPublicUrl("http://93.184.216.34/x", false),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      assertPublicUrl("https://u:p@93.184.216.34/x", false),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      assertPublicUrl("https://169.254.169.254/latest", false),
    ).rejects.toThrow(/private/);
    await expect(
      assertPublicUrl("https://evil.example/x", false, fakeLookup("127.0.0.1")),
    ).rejects.toThrow(/private/);
    await expect(
      assertPublicUrl(
        "https://ok.example/x",
        false,
        fakeLookup("93.184.216.34"),
      ),
    ).resolves.toBeUndefined();
  });
});

describe("postJson", () => {
  let server: Server;
  let port = 0;
  let received: { headers: Record<string, unknown>; body: string } | null =
    null;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => {
        body += c;
      });
      req.on("end", () => {
        received = { headers: req.headers, body };
        res.writeHead(req.url === "/fail" ? 500 : 200).end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("posts JSON when private addresses are allowed (development)", async () => {
    const res = await postJson(
      `http://localhost:${port}/hook`,
      '{"a":1}',
      { "x-test": "1" },
      true,
    );
    expect(res.status).toBe(200);
    expect(received?.body).toBe('{"a":1}');
    expect(received?.headers["x-test"]).toBe("1");
    expect(
      (await postJson(`http://127.0.0.1:${port}/fail`, "{}", {}, true)).status,
    ).toBe(500);
  });

  it("never connects to a private address in production, by name or literal", async () => {
    received = null;
    const byName = await postJson(
      `http://localhost:${port}/hook`,
      "{}",
      {},
      false,
    );
    const literal = await postJson(
      `http://127.0.0.1:${port}/hook`,
      "{}",
      {},
      false,
    );
    for (const res of [byName, literal]) {
      expect(res.status).toBeNull();
      expect(res.snippet).toMatch(/private/);
    }
    expect(received).toBeNull();
  });
});

describe("endpoints", () => {
  it("are for owners and admins, per account, with a secret", async () => {
    await expect(
      createEndpoint(db, mate, {
        url: URL_OK,
        description: "",
        events: ["feedback.created"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const id = await createEndpoint(db, owner, {
      url: URL_OK,
      description: "Slack bridge",
      events: ["feedback.created"],
    });
    expect((await listEndpoints(db, owner)).map((e) => e.id)).toEqual([id]);
    expect(await listEndpoints(db, other)).toEqual([]);
    expect(await revealSecret(db, owner, id)).toMatch(/^whsec_/);
    await expect(revealSecret(db, other, id)).rejects.toThrow();
  });

  it("refuse private URLs and need Pro when billing is on", async () => {
    await expect(
      createEndpoint(db, owner, {
        url: "https://10.0.0.5/hook",
        description: "",
        events: ["feedback.created"],
      }),
    ).rejects.toThrow(/private/);
    vi.spyOn(billing, "enabled").mockReturnValue(true);
    await db
      .insert(accountBilling)
      .values({ accountId: other.accountId, plan: "startup", status: "active" })
      .onConflictDoNothing();
    await expect(
      createEndpoint(db, other, {
        url: URL_OK,
        description: "",
        events: ["feedback.created"],
      }),
    ).rejects.toBeInstanceOf(PlanLimitError);
  });
});

describe("deliveries", () => {
  async function setup(events: string[] = ["feedback.created"]) {
    const endpointId = await createEndpoint(db, owner, {
      url: URL_OK,
      description: "",
      events: events as ["feedback.created"],
    });
    const ws = { ...owner, workspaceId, workspaceSlug: "hk" };
    const [board] = await listBoards(db, ws);
    const item = await createFeedback(db, ws, {
      boardId: board?.id ?? "",
      title: "Webhooked",
    });
    return { endpointId, item };
  }

  it("go only to enabled endpoints that want the event, with the API shape", async () => {
    const { endpointId, item } = await setup();
    const muted = await createEndpoint(db, owner, {
      url: URL_OK,
      description: "",
      events: ["roadmap_card.created"],
    });
    const off = await createEndpoint(db, owner, {
      url: URL_OK,
      description: "",
      events: ["feedback.created"],
    });
    await setEndpointEnabled(db, owner, off, false);
    const theirs = await createEndpoint(db, other, {
      url: URL_OK,
      description: "",
      events: ["feedback.created"],
    });

    const ids = await createDeliveries(db, {
      accountId: owner.accountId,
      event: "feedback.created",
      entityId: item.id,
      at: new Date().toISOString(),
    });
    expect(ids).toHaveLength(1);
    const [row] = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.endpointId, endpointId));
    expect(row?.payload).toMatchObject({
      event: "feedback.created",
      account_id: owner.accountId,
      data: { id: item.id, title: "Webhooked", workspace_id: workspaceId },
    });
    for (const id of [muted, off, theirs]) {
      const rows = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.endpointId, id));
      expect(rows).toEqual([]);
    }
  });

  it("are signed, logged, retried, and switch the endpoint off after 3 days", async () => {
    const { endpointId, item } = await setup();
    const [deliveryId] = await createDeliveries(db, {
      accountId: owner.accountId,
      event: "feedback.created",
      entityId: item.id,
      at: new Date().toISOString(),
    });
    const secret = await revealSecret(db, owner, endpointId);

    let headers: Record<string, string> = {};
    let body = "";
    const send = (status: number | null) =>
      vi.fn(
        async (
          _url: string,
          b: string,
          h: Record<string, string>,
        ): Promise<PostResult> => {
          headers = h;
          body = b;
          return {
            status,
            snippet: status ? "resp" : "ECONNREFUSED",
            durationMs: 5,
          };
        },
      );

    // Fails: retried, endpoint marked failing.
    expect(await deliver(db, deliveryId ?? "", false, send(500))).toEqual({
      result: "retry",
      error: "HTTP 500",
    });
    const [t, v1] = (headers[SIGNATURE_HEADER] ?? "")
      .split(",")
      .map((p) => p.split("=")[1]);
    expect(v1).toBe(
      createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"),
    );
    expect(signPayload(secret, body, Number(t))).toBe(
      headers[SIGNATURE_HEADER],
    );
    expect((await listEndpoints(db, owner))[0]?.failingSince).not.toBeNull();

    // Succeeds: logged, failure cleared.
    expect(await deliver(db, deliveryId ?? "", false, send(204))).toEqual({
      result: "success",
    });
    expect((await listDeliveries(db, owner, endpointId))[0]).toMatchObject({
      status: "success",
      attempts: 2,
      responseStatus: 204,
    });
    expect((await listEndpoints(db, owner))[0]?.failingSince).toBeNull();

    // Failing for 3 days: switched off.
    const resent = await resendDelivery(db, owner, deliveryId ?? "");
    await deliver(db, resent ?? "", false, send(null));
    const later = new Date(Date.now() + 3 * 24 * 3600 * 1000 + 1000);
    expect(
      await deliver(db, resent ?? "", false, send(null), later),
    ).toMatchObject({
      result: "failed",
      disabled: true,
    });
    const [endpoint] = await listEndpoints(db, owner);
    expect(endpoint).toMatchObject({ enabled: false });
    expect(endpoint?.disabledReason).toMatch(/3 days/);

    // While off, new deliveries are skipped; a test ping can be queued after re-enabling.
    const ping = await testDelivery(db, owner, endpointId);
    expect(await deliver(db, ping ?? "", false, send(200))).toEqual({
      result: "skipped",
    });
    await setEndpointEnabled(db, owner, endpointId, true);
    expect((await listEndpoints(db, owner))[0]).toMatchObject({
      enabled: true,
      disabledReason: null,
    });
  });

  it("the last attempt marks the delivery failed", async () => {
    const { item } = await setup();
    const [id] = await createDeliveries(db, {
      accountId: owner.accountId,
      event: "feedback.created",
      entityId: item.id,
      at: new Date().toISOString(),
    });
    const send = vi.fn(
      async (): Promise<PostResult> => ({
        status: 503,
        snippet: "",
        durationMs: 1,
      }),
    );
    expect(await deliver(db, id ?? "", true, send)).toMatchObject({
      result: "failed",
      disabled: false,
    });
  });
});
