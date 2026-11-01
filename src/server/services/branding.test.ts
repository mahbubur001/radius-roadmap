import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { contrastRatio, foregroundFor } from "@/lib/color";
import { fontHref } from "@/lib/fonts";
import type { BrandingInput } from "@/lib/schemas/branding";
import { db } from "@/server/db/client";
import { accountBilling } from "@/server/db/schema";
import { renderEmail } from "@/server/email/send";
import {
  addTestMember,
  cleanup,
  createTestAccount,
  createTestUser,
} from "@/test/factories";
import {
  effectiveBranding,
  getBranding,
  getEffectiveBranding,
  getEmailBrand,
  setFavicon,
  updateBranding,
} from "./branding";
import { type AccountContext, ForbiddenError } from "./context";
import { billing, PlanLimitError } from "./plan-limits";

// Account branding (doc 26 6C).

let owner: AccountContext; // account A
let member: AccountContext; // account A
let other: AccountContext; // owner, account B
const accounts: string[] = [];
const users: string[] = [];

const FAVICON = (accountId: string) =>
  `accounts/${accountId}/favicon/00000000-0000-4000-8000-000000000000.png`;

beforeAll(async () => {
  const [a, b] = [
    await createTestAccount(db, "brand-a"),
    await createTestAccount(db, "brand-b"),
  ];
  const [oA, oB, m] = [
    await createTestUser(db, "brand-owner-a"),
    await createTestUser(db, "brand-owner-b"),
    await createTestUser(db, "brand-member"),
  ];
  accounts.push(a, b);
  users.push(oA, oB, m);
  owner = await addTestMember(db, a, oA, "owner");
  other = await addTestMember(db, b, oB, "owner");
  member = await addTestMember(db, a, m, "member");
});

afterAll(() => cleanup(db, accounts, users));

afterEach(() => {
  vi.restoreAllMocks();
});

async function onPlan(accountId: string, plan: "startup" | "pro") {
  vi.spyOn(billing, "enabled").mockReturnValue(true);
  await db
    .insert(accountBilling)
    .values({ accountId, plan, status: "active" })
    .onConflictDoUpdate({
      target: accountBilling.accountId,
      set: { plan, status: "active" },
    });
}

describe("colour maths", () => {
  it("picks the readable text colour", () => {
    expect(foregroundFor("#1d4ed8")).toBe("#ffffff");
    expect(foregroundFor("#facc15")).toBe("#0f172a");
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1);
  });

  it("builds Google Fonts URLs", () => {
    expect(fontHref({ name: "Source Sans 3" })).toBe(
      "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&display=swap",
    );
  });
});

describe("saving", () => {
  it("is for owners and admins, per account", async () => {
    const input = {
      color: "#1D4ED8",
      font: "lora" as const,
      hidePoweredBy: true,
    };
    await expect(updateBranding(db, member, input)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await updateBranding(db, owner, input);
    expect(await getBranding(db, owner.accountId)).toEqual({
      color: "#1d4ed8",
      font: "lora",
      hidePoweredBy: true,
    });
    // Account B is untouched.
    expect(await getBranding(db, other.accountId)).toEqual({});
  });

  it("keeps the favicon when the form is saved", async () => {
    expect(await setFavicon(db, owner, FAVICON(owner.accountId))).toBeNull();
    await updateBranding(db, owner, {
      color: "",
      font: "",
      hidePoweredBy: false,
    });
    const saved = await getBranding(db, owner.accountId);
    expect(saved).toMatchObject({ color: null, font: null });
    expect(saved.favicon).toBe(FAVICON(owner.accountId));
    expect(await setFavicon(db, owner, null)).toBe(FAVICON(owner.accountId));
  });

  it("rejects unknown fonts and bad colours", async () => {
    await expect(
      updateBranding(db, owner, {
        color: "red",
        font: "",
        hidePoweredBy: false,
      }),
    ).rejects.toThrow();
    await expect(
      updateBranding(db, owner, {
        color: "",
        font: "comic-sans" as "lora",
        hidePoweredBy: false,
      }),
    ).rejects.toThrow();
  });
});

describe("plan gates", () => {
  it("Startup can't set colour, font, favicon or hide Powered by", async () => {
    await onPlan(other.accountId, "startup");
    const none: BrandingInput = { color: "", font: "", hidePoweredBy: false };
    for (const patch of [
      { color: "#123456" },
      { font: "inter" as const },
      { hidePoweredBy: true },
    ]) {
      await expect(
        updateBranding(db, other, { ...none, ...patch }),
      ).rejects.toBeInstanceOf(PlanLimitError);
    }
    await expect(
      setFavicon(db, other, FAVICON(other.accountId)),
    ).rejects.toBeInstanceOf(PlanLimitError);
    await updateBranding(db, other, none); // clearing is fine
  });

  it("after a downgrade, saved values stay but aren't applied", async () => {
    await onPlan(other.accountId, "pro");
    await updateBranding(db, other, {
      color: "#facc15",
      font: "inter" as const,
      hidePoweredBy: true,
    });
    await setFavicon(db, other, FAVICON(other.accountId));
    expect(await getEffectiveBranding(db, other.accountId)).toEqual({
      color: { value: "#facc15", foreground: "#0f172a" },
      font: { id: "inter", name: "Inter", serif: false },
      favicon: FAVICON(other.accountId),
      logo: true,
      poweredBy: false,
    });

    await onPlan(other.accountId, "startup");
    expect(await getEffectiveBranding(db, other.accountId)).toEqual({
      color: null,
      font: null,
      favicon: null,
      logo: true,
      poweredBy: true,
    });
    // Saving the unchanged form on the lower plan is allowed.
    await updateBranding(db, other, {
      color: "#facc15",
      font: "inter" as const,
      hidePoweredBy: true,
    });
    expect((await getBranding(db, other.accountId)).color).toBe("#facc15");
  });

  it("free plan shows Powered by and nothing else", () => {
    expect(
      effectiveBranding("free", { color: "#000000", hidePoweredBy: true }),
    ).toEqual({
      color: null,
      font: null,
      favicon: null,
      logo: false,
      poweredBy: true,
    });
  });
});

describe("emails", () => {
  it("end-user emails carry the account's brand; team emails don't", async () => {
    await onPlan(other.accountId, "pro");
    await updateBranding(db, other, {
      color: "#facc15",
      font: "",
      hidePoweredBy: false,
    });
    const brand = await getEmailBrand(db, other.accountId);
    expect(brand).toEqual({
      name: "brand-b",
      logoUrl: null,
      color: "#facc15",
      poweredBy: true,
    });
    const branded = await renderEmail({
      template: "subscribe-confirm",
      to: "a@example.test",
      props: { siteName: "B", url: "https://example.test/c", brand },
    });
    expect(branded.html).toContain("#facc15");
    expect(branded.text).toContain("brand-b · Powered by Radius Roadmap");

    const team = await renderEmail({
      template: "verify-email",
      to: "a@example.test",
      props: { name: "A", url: "https://example.test/v" },
    });
    expect(team.html).not.toContain("#facc15");
    expect(team.text).not.toContain("Powered by");
  });
});
