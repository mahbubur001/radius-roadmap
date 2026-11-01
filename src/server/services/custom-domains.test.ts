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
import { isCustomHostname, normalizeHostname } from "@/lib/schemas/domain";
import { db } from "@/server/db/client";
import { accountBilling, customDomains } from "@/server/db/schema";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import { type AccountContext, ForbiddenError } from "./context";
import {
  customDomainsConfig,
  type DnsResolver,
  dnsRecords,
  domainNotice,
  domainsDue,
  getDomain,
  isOurDomain,
  publicSiteBase,
  removeDomain,
  setDomain,
  siteForHost,
  verifyDomain,
  verifyOwnDomain,
} from "./custom-domains";
import { billing, PlanLimitError } from "./plan-limits";

// Customer-owned domains (doc 26 6D).

let owner: AccountContext; // account A
let member: AccountContext; // account A
let other: AccountContext; // owner, account B
const accounts: string[] = [];
const users: string[] = [];
const TARGET = "domains.app.test";

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "dom-a"),
    await createTestAccount(db, "dom-b"),
  ];
  const [oA, oB, m] = [
    await createTestUser(db, "dom-owner-a"),
    await createTestUser(db, "dom-owner-b"),
    await createTestUser(db, "dom-member"),
  ];
  accounts.push(a, b);
  users.push(oA, oB, m);
  owner = await addTestMember(db, a, oA, "owner");
  other = await addTestMember(db, b, oB, "owner");
  member = await addTestMember(db, a, m, "member");
});

afterAll(() => cleanup(db, accounts, users));

afterEach(async () => {
  vi.restoreAllMocks();
  await db
    .delete(customDomains)
    .where(eq(customDomains.accountId, owner.accountId));
  await db
    .delete(customDomains)
    .where(eq(customDomains.accountId, other.accountId));
});

function targetOn() {
  vi.spyOn(customDomainsConfig, "target").mockReturnValue(TARGET);
}

/** DNS that answers with the given records. */
function fakeDns(records: {
  txt?: Record<string, string>;
  cname?: Record<string, string>;
}): DnsResolver {
  return {
    txt: async (host) => {
      const v = records.txt?.[host];
      if (v === undefined) throw new Error("ENOTFOUND");
      return [[v]];
    },
    cname: async (host) => {
      const v = records.cname?.[host];
      if (v === undefined) throw new Error("ENODATA");
      return [v];
    },
  };
}

/** DNS set up correctly for `domain`. */
function goodDns(domain: { hostname: string; verifyToken: string }) {
  const r = dnsRecords(domain);
  return fakeDns({
    txt: { [r.txt.name]: r.txt.value },
    cname: { [domain.hostname]: `${TARGET}.` },
  });
}

describe("hostnames", () => {
  it("normalizes what people paste", () => {
    expect(normalizeHostname(" https://Feedback.Acme.com/roadmap?x=1 ")).toBe(
      "feedback.acme.com",
    );
    expect(normalizeHostname("feedback.acme.com.")).toBe("feedback.acme.com");
  });

  it("accepts hosts under an owned domain only", () => {
    expect(isCustomHostname("feedback.acme.com")).toBe(true);
    expect(isCustomHostname("roadmap.acme.co.uk")).toBe(true);
    expect(isCustomHostname("acme.localhost")).toBe(true);
    expect(isCustomHostname("acme.com")).toBe(false); // root: no CNAME
    expect(isCustomHostname("10.0.0.1")).toBe(false);
    expect(isCustomHostname("bad_host.acme.com")).toBe(false);
    expect(isCustomHostname("-x.acme.com")).toBe(false);
  });
});

describe("setting a domain", () => {
  it("is for owners and admins on a plan with custom domains", async () => {
    targetOn();
    await expect(
      setDomain(db, member, { hostname: "feedback.acme.test" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    vi.spyOn(billing, "enabled").mockReturnValue(true);
    await db
      .insert(accountBilling)
      .values({ accountId: owner.accountId, plan: "startup", status: "active" })
      .onConflictDoNothing();
    await expect(
      setDomain(db, owner, { hostname: "feedback.acme.test" }),
    ).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("never takes our own domain or its subdomains", () => {
    const app = "app.example.com";
    expect(isOurDomain("app.example.com", app)).toBe(true);
    expect(isOurDomain("acme.app.example.com", app)).toBe(true);
    expect(isOurDomain("feedback.acme.com", app)).toBe(false);
    expect(isOurDomain("myapp.example.com", app)).toBe(false);
  });

  it("development accepts *.localhost hosts (verified without DNS)", async () => {
    targetOn();
    const d = await setDomain(db, owner, { hostname: "acme-dev.localhost" });
    expect(await verifyDomain(db, d.id, fakeDns({}))).toMatchObject({
      status: "active",
    });
  });

  it("replaces the old domain with a new token, per account", async () => {
    targetOn();
    const first = await setDomain(db, owner, { hostname: "a.acme.test" });
    const second = await setDomain(db, owner, { hostname: "b.acme.test" });
    expect(second.id).toBe(first.id);
    expect(second.hostname).toBe("b.acme.test");
    expect(second.verifyToken).not.toBe(first.verifyToken);
    expect(await getDomain(db, other)).toBeNull();
    expect(await removeDomain(db, owner)).toBe("b.acme.test");
    expect(await getDomain(db, owner)).toBeNull();
  });
});

describe("verification", () => {
  it("needs the account's own TXT token and the CNAME", async () => {
    targetOn();
    const mine = await setDomain(db, owner, { hostname: "feedback.acme.test" });
    // Another account claims the same host: allowed while pending.
    const theirs = await setDomain(db, other, {
      hostname: "feedback.acme.test",
    });

    // CNAME alone (TXT missing): still pending, with the reason.
    const cnameOnly = fakeDns({ cname: { [mine.hostname]: TARGET } });
    expect(await verifyDomain(db, theirs.id, cnameOnly)).toMatchObject({
      status: "pending",
      error: expect.stringContaining("TXT"),
    });
    // The other account's DNS has Acme's token, so only Acme goes live.
    expect(await verifyDomain(db, theirs.id, goodDns(mine))).toMatchObject({
      status: "pending",
    });
    expect(await verifyDomain(db, mine.id, goodDns(mine))).toMatchObject({
      status: "active",
      error: null,
      changed: "active",
    });
    // Even with the right token, a second account can't activate it.
    expect(await verifyDomain(db, theirs.id, goodDns(theirs))).toMatchObject({
      status: "failed",
      error: "Another account already uses this domain.",
    });
  });

  it("wrong CNAME target is reported", async () => {
    targetOn();
    const d = await setDomain(db, owner, { hostname: "feedback.acme.test" });
    const r = dnsRecords(d);
    const dns = fakeDns({
      txt: { [r.txt.name]: r.txt.value },
      cname: { [d.hostname]: "elsewhere.example." },
    });
    expect(await verifyOwnDomain(db, owner, dns)).toMatchObject({
      status: "pending",
      error: `feedback.acme.test needs a CNAME record pointing to ${TARGET}.`,
    });
  });

  it("pending gives up after 48 h; active fails after 3 bad checks", async () => {
    targetOn();
    const d = await setDomain(db, owner, { hostname: "feedback.acme.test" });
    const none = fakeDns({});
    const later = new Date(Date.now() + 49 * 3600 * 1000);
    expect(await verifyDomain(db, d.id, none, later)).toMatchObject({
      status: "failed",
    });
    // Fixed DNS brings it back.
    expect(await verifyDomain(db, d.id, goodDns(d))).toMatchObject({
      status: "active",
      changed: "active",
    });
    expect((await verifyDomain(db, d.id, none))?.status).toBe("active");
    expect((await verifyDomain(db, d.id, none))?.status).toBe("active");
    expect(await verifyDomain(db, d.id, none)).toMatchObject({
      status: "failed",
      changed: "failed",
    });
  });

  it("schedules pending domains and stale active ones", async () => {
    targetOn();
    const d = await setDomain(db, owner, { hostname: "feedback.acme.test" });
    expect(await domainsDue(db)).toContain(d.id);
    await verifyDomain(db, d.id, goodDns(d));
    expect(await domainsDue(db)).not.toContain(d.id);
    const tomorrow = new Date(Date.now() + 25 * 3600 * 1000);
    expect(await domainsDue(db, tomorrow)).toContain(d.id);
  });
});

describe("serving", () => {
  it("maps an active host to its account; links follow it", async () => {
    targetOn();
    const d = await setDomain(db, owner, { hostname: "feedback.acme.test" });
    expect(await siteForHost(db, "feedback.acme.test")).toBeNull();
    const app = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
    expect(await publicSiteBase(db, owner.accountId, "acme")).toBe(
      `${app.origin}/acme`,
    );

    await verifyDomain(db, d.id, goodDns(d));
    expect(await siteForHost(db, "Feedback.Acme.test")).toMatchObject({
      accountId: owner.accountId,
    });
    expect(await publicSiteBase(db, owner.accountId, "acme")).toBe(
      `${app.protocol}//feedback.acme.test${app.port ? `:${app.port}` : ""}`,
    );
    expect(await publicSiteBase(db, other.accountId, "b")).toBe(
      `${app.origin}/b`,
    );
  });

  it("a downgrade switches the domain off without deleting it", async () => {
    targetOn();
    const d = await setDomain(db, other, { hostname: "roadmap.other.test" });
    await verifyDomain(db, d.id, goodDns(d));
    vi.spyOn(billing, "enabled").mockReturnValue(true); // B has no plan: Free
    expect(await siteForHost(db, "roadmap.other.test")).toBeNull();
    expect(await getDomain(db, other)).toMatchObject({ status: "active" });
  });

  it("tells the owners", async () => {
    targetOn();
    const d = await setDomain(db, owner, { hostname: "feedback.acme.test" });
    const notice = await domainNotice(db, d.id);
    expect(notice?.owners).toHaveLength(1);
    expect(notice?.owners[0]).toContain("dom-owner-a");
  });
});
