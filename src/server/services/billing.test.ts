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
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import {
  billingNotice,
  getBillingOverview,
  handleStripeEvent,
  type SubscriptionSnapshot,
  syncSubscription,
} from "./billing";
import { ForbiddenError, type WorkspaceContext } from "./context";
import { createBoard } from "./feedback-boards";
import {
  billing,
  gateSettings,
  getAccountPlan,
  PlanLimitError,
} from "./plan-limits";
import { getPublicWorkspace } from "./public-site";
import { createRoadmap } from "./roadmaps";
import { createWorkspace, updatePublicSite } from "./workspaces";

let wsA: WorkspaceContext; // owner, account A
let wsB: WorkspaceContext; // owner, account B
let memberA: WorkspaceContext;
const accounts: string[] = [];
const users: string[] = [];

const publicSite = {
  showRoadmap: true,
  showIdeas: true,
  showUpdates: true,
  commentsEnabled: false,
  approveComments: false,
  followsEnabled: false,
  termsUrl: "",
  privacyUrl: "",
};

function snapshot(
  accountId: string,
  over: Partial<SubscriptionSnapshot> = {},
): SubscriptionSnapshot {
  return {
    id: `sub_${accountId}`,
    customerId: `cus_${accountId}`,
    accountId,
    status: "active",
    lookupKey: "pro_monthly",
    currentPeriodEnd: new Date("2027-01-01"),
    cancelAtPeriodEnd: false,
    ...over,
  };
}

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "bill-a"),
    await createTestAccount(db, "bill-b"),
  ];
  const [ownerA, ownerB, mA] = [
    await createTestUser(db, "owner-a"),
    await createTestUser(db, "owner-b"),
    await createTestUser(db, "member-a"),
  ];
  accounts.push(a, b);
  users.push(ownerA, ownerB, mA);
  const ctxA = await addTestMember(db, a, ownerA, "owner");
  const ctxB = await addTestMember(db, b, ownerB, "owner");
  const ctxM = await addTestMember(db, a, mA, "member");
  const alpha = await createWorkspace(db, ctxA, {
    name: "Alpha",
    slug: "alpha",
  });
  const beta = await createWorkspace(db, ctxB, { name: "Beta", slug: "beta" });
  wsA = { ...ctxA, workspaceId: alpha.id, workspaceSlug: alpha.slug };
  wsB = { ...ctxB, workspaceId: beta.id, workspaceSlug: beta.slug };
  memberA = { ...ctxM, workspaceId: alpha.id, workspaceSlug: alpha.slug };
});

afterAll(() => cleanup(db, accounts, users));

afterEach(() => {
  vi.restoreAllMocks();
});

function billingOn() {
  vi.spyOn(billing, "enabled").mockReturnValue(true);
}

describe("billing off (no Stripe keys)", () => {
  it("every account is unlimited", async () => {
    expect(await getAccountPlan(db, wsA.accountId)).toBe("enterprise");
    await expect(
      createRoadmap(db, wsA, { title: "Extra" }),
    ).resolves.toBeTruthy();
  });
});

describe("Free plan limits", () => {
  it("blocks a second workspace, roadmap and board", async () => {
    billingOn();
    expect(await getAccountPlan(db, wsB.accountId)).toBe("free");
    await expect(
      createWorkspace(db, wsB, { name: "Gamma", slug: "gamma" }),
    ).rejects.toBeInstanceOf(PlanLimitError);
    await expect(
      createRoadmap(db, wsB, { title: "Second" }),
    ).rejects.toBeInstanceOf(PlanLimitError);
    await expect(
      createBoard(db, wsB, { name: "Second board" }),
    ).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("can't turn on comments or follows; saved switches are ignored publicly", async () => {
    billingOn();
    await expect(
      updatePublicSite(db, wsB, { ...publicSite, commentsEnabled: true }),
    ).rejects.toBeInstanceOf(PlanLimitError);
    expect(
      await gateSettings(db, wsB.accountId, {
        commentsEnabled: true,
        followsEnabled: true,
        showRoadmap: true,
      }),
    ).toEqual({
      commentsEnabled: false,
      followsEnabled: false,
      showRoadmap: true,
    });
  });
});

describe("subscriptions from Stripe", () => {
  it("an active Pro subscription lifts the limits and gates", async () => {
    billingOn();
    expect(await syncSubscription(db, snapshot(wsB.accountId))).toBe(
      wsB.accountId,
    );
    expect(await getAccountPlan(db, wsB.accountId)).toBe("pro");
    await expect(
      createRoadmap(db, wsB, { title: "Second" }),
    ).resolves.toBeTruthy();
    await updatePublicSite(db, wsB, { ...publicSite, commentsEnabled: true });
    const ws = await getPublicWorkspace(
      db,
      { accountId: wsB.accountId },
      "beta",
    );
    expect(ws?.settings.commentsEnabled).toBe(true);
  });

  it("past_due keeps the plan; canceled falls back to Free", async () => {
    billingOn();
    await syncSubscription(db, snapshot(wsB.accountId, { status: "past_due" }));
    expect(await getAccountPlan(db, wsB.accountId)).toBe("pro");
    await syncSubscription(db, snapshot(wsB.accountId, { status: "canceled" }));
    expect(await getAccountPlan(db, wsB.accountId)).toBe("free");
    // Existing extras stay; public comments switch off (doc 26 P6).
    const ws = await getPublicWorkspace(
      db,
      { accountId: wsB.accountId },
      "beta",
    );
    expect(ws?.settings.commentsEnabled).toBe(false);
  });

  it("finds the account by customer id when metadata is missing", async () => {
    billingOn();
    expect(
      await syncSubscription(
        db,
        snapshot(wsB.accountId, {
          accountId: null,
          lookupKey: "startup_yearly",
        }),
      ),
    ).toBe(wsB.accountId);
    expect(await getAccountPlan(db, wsB.accountId)).toBe("startup");
    expect(
      await syncSubscription(db, {
        ...snapshot("nobody"),
        accountId: null,
        customerId: "cus_unknown",
      }),
    ).toBeNull();
  });

  it("ignores unknown prices", async () => {
    billingOn();
    expect(
      await syncSubscription(
        db,
        snapshot(wsA.accountId, { lookupKey: "something_else" }),
      ),
    ).toBeNull();
    expect(await getAccountPlan(db, wsA.accountId)).toBe("free");
  });

  it("applies each webhook event once, using Stripe's current copy", async () => {
    billingOn();
    const fetch = vi.fn(async () =>
      snapshot(wsA.accountId, { lookupKey: "pro_yearly" }),
    );
    const event = {
      id: `evt_${wsA.accountId}`,
      type: "customer.subscription.updated" as const,
      data: { object: { id: `sub_${wsA.accountId}` } },
    } as Parameters<typeof handleStripeEvent>[1];
    expect(await handleStripeEvent(db, event, fetch)).toBe(wsA.accountId);
    expect(await handleStripeEvent(db, event, fetch)).toBeNull();
    expect(fetch).toHaveBeenCalledWith(`sub_${wsA.accountId}`);
    expect(await getAccountPlan(db, wsA.accountId)).toBe("pro");
    // Account B is untouched by A's subscription.
    expect(await getAccountPlan(db, wsB.accountId)).toBe("startup");
  });

  it("ignores unrelated events", async () => {
    const fetch = vi.fn();
    const event = {
      id: "evt_other",
      type: "invoice.paid",
      data: { object: { id: "in_1" } },
    } as unknown as Parameters<typeof handleStripeEvent>[1];
    expect(await handleStripeEvent(db, event, fetch)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("billing overview", () => {
  it("shows usage against the plan; members can't see it", async () => {
    billingOn();
    const overview = await getBillingOverview(db, wsA);
    expect(overview.plan).toBe("pro");
    expect(overview.interval).toBe("year");
    expect(overview.usage.find((u) => u.key === "roadmaps")).toMatchObject({
      used: 2,
      limit: 5,
    });
    await expect(getBillingOverview(db, memberA)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("billing notices", () => {
  it("finds the owners of the account behind a Stripe customer", async () => {
    const notice = await billingNotice(db, `cus_${wsA.accountId}`);
    expect(notice).toMatchObject({
      accountId: wsA.accountId,
      planName: "Pro",
      billingPath: "/dashboard/alpha/settings/billing",
    });
    expect(notice?.owners).toHaveLength(1);
    expect(notice?.owners[0]).toContain("owner-a");
    expect(await billingNotice(db, "cus_unknown")).toBeNull();
  });
});
