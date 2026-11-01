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
  invitation,
  organization,
  planOverrides,
  workspaces,
} from "@/server/db/schema";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { createApiKey, verifyApiKey } from "../api-keys";
import type { AccountContext } from "../context";
import { ConflictError } from "../context";
import { billing, getAccountPlan } from "../plan-limits";
import { isSuspendedSlug, resolveSite } from "../public-site";
import { accountDetail, listAccounts, platformStats } from "./accounts";
import { type AdminActor, listAudit } from "./audit";
import {
  cancelCustomerInvite,
  inviteCustomer,
  resendCustomerInvite,
} from "./customers";
import {
  endOverride,
  markReminder,
  overrideReminders,
  setOverride,
} from "./overrides";
import { isSuspended, suspendAccount, unsuspendAccount } from "./suspension";

// Platform admin (doc 28).

let owner: AccountContext; // account A
let other: AccountContext; // account B
let admin: AdminActor;
const accounts: string[] = [];
const users: string[] = [];
const APP = "https://app.example.com";

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "plat-a"),
    await createTestAccount(db, "plat-b"),
  ];
  const ids = [
    await createTestUser(db, "plat-owner"),
    await createTestUser(db, "plat-other"),
    await createTestUser(db, "plat-admin"),
  ];
  accounts.push(a, b);
  users.push(...ids);
  owner = await addTestMember(db, a, ids[0] as string, "owner");
  other = await addTestMember(db, b, ids[1] as string, "owner");
  admin = { userId: ids[2] as string, email: "plat-admin@example.test" };
  await db.insert(workspaces).values({ accountId: a, name: "A", slug: "a-ws" });
});

afterAll(async () => {
  // Accounts made by inviteCustomer have no test prefix: find them by slug.
  const made = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, "plat-invited-co"));
  await cleanup(db, [...accounts, ...made.map((m) => m.id)], users);
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const id of accounts) {
    await db.delete(planOverrides).where(eq(planOverrides.accountId, id));
  }
});

function billingOn() {
  vi.spyOn(billing, "enabled").mockReturnValue(true);
}

describe("plan overrides", () => {
  it("beat Free and Stripe while they run, then fall back", async () => {
    billingOn();
    expect(await getAccountPlan(db, owner.accountId)).toBe("free");
    await setOverride(db, admin, {
      accountId: owner.accountId,
      plan: "pro",
      endsOn: "2099-01-31",
      note: "Partner",
    });
    expect(await getAccountPlan(db, owner.accountId)).toBe("pro");

    // Also paying through Stripe: the override still wins (C6), even an
    // override to Free.
    await db
      .insert(accountBilling)
      .values({ accountId: owner.accountId, plan: "pro", status: "active" })
      .onConflictDoUpdate({
        target: accountBilling.accountId,
        set: { plan: "pro", status: "active" },
      });
    expect((await accountDetail(db, owner.accountId)).doubleBilled).toBe(true);
    await setOverride(db, admin, {
      accountId: owner.accountId,
      plan: "free",
      endsOn: "2099-01-31",
      note: "Paused",
    });
    expect(await getAccountPlan(db, owner.accountId)).toBe("free");

    // After the end date: back to Stripe's plan.
    const after = new Date("2099-02-01T00:00:00Z");
    expect(await getAccountPlan(db, owner.accountId, after)).toBe("pro");
    await endOverride(db, admin, owner.accountId);
    expect(await getAccountPlan(db, owner.accountId)).toBe("pro");
    await db
      .delete(accountBilling)
      .where(eq(accountBilling.accountId, owner.accountId));
    expect(await getAccountPlan(db, owner.accountId)).toBe("free");

    const log = await listAudit(db, { accountId: owner.accountId });
    expect(log.map((l) => l.action)).toEqual(
      expect.arrayContaining(["plan_override.set", "plan_override.ended"]),
    );
  });

  it("an end date runs to the end of that day (UTC)", async () => {
    billingOn();
    await setOverride(db, admin, {
      accountId: owner.accountId,
      plan: "pro",
      endsOn: "2099-03-01",
      note: "",
    });
    expect(
      await getAccountPlan(
        db,
        owner.accountId,
        new Date("2099-03-01T23:00:00Z"),
      ),
    ).toBe("pro");
    expect(
      await getAccountPlan(
        db,
        owner.accountId,
        new Date("2099-03-02T00:00:01Z"),
      ),
    ).toBe("free");
  });

  it("reminds owners 7 days and 1 day before, and when it ended, once each", async () => {
    const ends = new Date(Date.now() + 5 * 24 * 3600 * 1000);
    await setOverride(db, admin, {
      accountId: owner.accountId,
      plan: "pro",
      endsOn: ends.toISOString().slice(0, 10),
      note: "",
    });
    const mine = (list: Awaited<ReturnType<typeof overrideReminders>>) =>
      list.filter((r) => r.accountId === owner.accountId);

    const week = mine(await overrideReminders(db));
    expect(week.map((r) => r.kind)).toEqual(["7d"]);
    expect(week[0]?.emails[0]).toMatchObject({
      template: "plan-override-ending",
    });
    await markReminder(db, owner.accountId, "7d");
    expect(mine(await overrideReminders(db))).toEqual([]);

    const dayBefore = new Date(
      ends.getTime() + 20 * 3600 * 1000 - 24 * 3600 * 1000 + 3600 * 1000 * 4,
    );
    expect(
      mine(await overrideReminders(db, dayBefore)).map((r) => r.kind),
    ).toEqual(["1d"]);
    await markReminder(db, owner.accountId, "1d");

    const later = new Date(ends.getTime() + 2 * 24 * 3600 * 1000);
    const ended = mine(await overrideReminders(db, later));
    expect(ended.map((r) => r.kind)).toEqual(["ended"]);
    expect(ended[0]?.emails[0]).toMatchObject({
      template: "plan-override-ended",
    });
    await markReminder(db, owner.accountId, "ended");
    expect(mine(await overrideReminders(db, later))).toEqual([]);
  });
});

describe("inviting a customer", () => {
  it("creates the account, its workspace, a plan and an owner invitation", async () => {
    billingOn();
    const { accountId, email } = await inviteCustomer(
      db,
      admin,
      {
        accountName: "Invited Co",
        accountSlug: "plat-invited-co",
        workspaceName: "Invited App",
        workspaceSlug: "invited-app",
        ownerEmail: "Founder@Invited.test",
        plan: "pro",
        endsOn: "",
        note: "Launch partner",
      },
      APP,
    );
    expect(email).toMatchObject({
      template: "customer-invite",
      to: "founder@invited.test",
      props: { accountName: "Invited Co", planName: "Pro" },
    });
    expect((email.props as { url: string }).url).toMatch(
      new RegExp(`^${APP}/accept-invite/[0-9a-f-]{36}$`),
    );
    expect(await getAccountPlan(db, accountId)).toBe("pro");
    const detail = await accountDetail(db, accountId);
    expect(detail.workspaces.map((w) => w.slug)).toEqual(["invited-app"]);
    expect(detail.members).toEqual([]);
    expect(detail.invitations).toMatchObject([
      { email: "founder@invited.test", role: "owner" },
    ]);
    // Seeded like any new workspace (a roadmap and a feedback board).
    expect(detail.usage).toMatchObject({
      workspaces: 1,
      roadmaps: 1,
      boards: 1,
    });

    // Listed as waiting for its owner; found by the invited email.
    const waiting = await listAccounts(db, {
      status: "awaiting_owner",
      q: "founder@invited",
    });
    expect(waiting.accounts.map((a) => a.id)).toEqual([accountId]);
    expect(waiting.accounts[0]).toMatchObject({
      planSource: "manual",
      plan: "pro",
    });

    await expect(
      inviteCustomer(
        db,
        admin,
        {
          accountName: "Dup",
          accountSlug: "plat-invited-co",
          workspaceName: "Dup App",
          workspaceSlug: "dup-app",
          ownerEmail: "x@invited.test",
          plan: "",
          endsOn: "",
          note: "",
        },
        APP,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const resent = await resendCustomerInvite(db, admin, accountId, APP);
    expect(resent.to).toBe("founder@invited.test");

    // Cancelling while nobody joined removes the account it was made for.
    expect(await cancelCustomerInvite(db, admin, accountId)).toEqual({
      accountDeleted: true,
    });
    const [gone] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, accountId));
    expect(gone).toBeUndefined();
    const left = await db
      .select()
      .from(invitation)
      .where(eq(invitation.organizationId, accountId));
    expect(left).toEqual([]);
    const log = await listAudit(db, { limit: 20 });
    expect(log.map((l) => l.action)).toEqual(
      expect.arrayContaining([
        "customer.invited",
        "customer.invite_resent",
        "customer.invite_cancelled",
      ]),
    );
  });
});

describe("suspension", () => {
  it("hides the public site, stops API keys, and is reversible", async () => {
    const [{ slug } = { slug: "" }] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, other.accountId));
    const { key } = await createApiKey(db, other, {
      name: "k",
      permission: "read",
    });
    expect(await resolveSite(db, slug)).not.toBeNull();
    expect(await verifyApiKey(db, key)).not.toBeNull();

    await suspendAccount(db, admin, other.accountId, "Spam");
    expect(await isSuspended(db, other.accountId)).toBe(true);
    expect(await resolveSite(db, slug)).toBeNull();
    expect(await isSuspendedSlug(db, slug)).toBe(true);
    expect(await verifyApiKey(db, key)).toBeNull();
    expect(
      (await listAccounts(db, { status: "suspended" })).accounts.map(
        (a) => a.id,
      ),
    ).toContain(other.accountId);
    expect((await platformStats(db)).suspended).toBeGreaterThanOrEqual(1);

    await unsuspendAccount(db, admin, other.accountId);
    expect(await resolveSite(db, slug)).not.toBeNull();
    expect(await verifyApiKey(db, key)).not.toBeNull();
    const log = await listAudit(db, { accountId: other.accountId });
    expect(log[0]).toMatchObject({
      action: "account.unsuspended",
      adminEmail: admin.email,
    });
    expect(log[1]).toMatchObject({
      action: "account.suspended",
      details: { reason: "Spam" },
    });
  });
});
