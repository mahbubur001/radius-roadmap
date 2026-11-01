import { eq } from "drizzle-orm";
import { foregroundFor, HEX_COLOR } from "@/lib/color";
import { findFont } from "@/lib/fonts";
import { type Feature, type PlanId, planIncludes } from "@/lib/plans";
import { type BrandingInput, brandingSchema } from "@/lib/schemas/branding";
import type { Db } from "@/server/db/client";
import {
  type AccountBranding,
  accountSettings,
  organization,
} from "@/server/db/schema";
import type { EmailBrand } from "@/server/email/types";
import { fileUrl } from "@/server/storage/url";
import { type AccountContext, assertRole } from "./context";
import { assertFeature, getAccountPlan } from "./plan-limits";

// Account branding (doc 26 6C): stored values, and what a plan applies (B7).
// Also runs in the worker (email branding): no server-only imports.

/** The feature each branding field needs (doc 26 §5). */
const GATES = {
  favicon: "whiteLabel",
  color: "whiteLabel",
  font: "customFonts",
  hidePoweredBy: "hidePoweredBy",
} as const satisfies Record<keyof AccountBranding, Feature>;

export async function getBranding(
  db: Db,
  accountId: string,
): Promise<AccountBranding> {
  const [row] = await db
    .select({ branding: accountSettings.branding })
    .from(accountSettings)
    .where(eq(accountSettings.accountId, accountId))
    .limit(1);
  return row?.branding ?? {};
}

async function saveBranding(
  db: Db,
  accountId: string,
  patch: Partial<AccountBranding>,
) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ branding: accountSettings.branding })
      .from(accountSettings)
      .where(eq(accountSettings.accountId, accountId))
      .for("update")
      .limit(1);
    const branding = { ...row?.branding, ...patch };
    await tx
      .insert(accountSettings)
      .values({ accountId, branding })
      .onConflictDoUpdate({
        target: accountSettings.accountId,
        set: { branding },
      });
  });
}

/**
 * Colour, font and "Powered by" (owners and admins). A gated value can only
 * be set or changed on a plan that includes it; clearing is always allowed,
 * and unchanged values saved before a downgrade are kept.
 */
export async function updateBranding(
  db: Db,
  ctx: AccountContext,
  input: BrandingInput,
) {
  assertRole(ctx, "admin");
  const parsed = brandingSchema.parse(input);
  const data = {
    color: parsed.color?.toLowerCase() || null,
    font: parsed.font || null,
    hidePoweredBy: parsed.hidePoweredBy,
  };
  const current = await getBranding(db, ctx.accountId);
  for (const key of ["color", "font", "hidePoweredBy"] as const) {
    const next = data[key];
    if (next && next !== (current[key] ?? null)) {
      await assertFeature(db, ctx.accountId, GATES[key]);
    }
  }
  await saveBranding(db, ctx.accountId, data);
}

/** Store (or clear) the favicon's storage key; returns the key it replaced. */
export async function setFavicon(
  db: Db,
  ctx: AccountContext,
  key: string | null,
) {
  assertRole(ctx, "admin");
  if (key) await assertFeature(db, ctx.accountId, GATES.favicon);
  const before = (await getBranding(db, ctx.accountId)).favicon ?? null;
  await saveBranding(db, ctx.accountId, { favicon: key });
  return before;
}

export type EffectiveBranding = {
  /** Brand colour and the text colour that reads on it; null = defaults. */
  color: { value: string; foreground: string } | null;
  font: { id: string; name: string; serif: boolean } | null;
  /** Favicon storage key. */
  favicon: string | null;
  /** The plan shows logos (Startup+); otherwise initials. */
  logo: boolean;
  poweredBy: boolean;
};

/** Branding as `plan` applies it: values it lacks fall back (doc 26 B7). */
export function effectiveBranding(
  plan: PlanId,
  branding: AccountBranding,
): EffectiveBranding {
  const has = (key: keyof AccountBranding) => planIncludes(plan, GATES[key]);
  // Re-checked: the colour is written into a <style> tag on public pages.
  const color =
    has("color") && branding.color && HEX_COLOR.test(branding.color)
      ? branding.color
      : null;
  const font = has("font") ? findFont(branding.font) : null;
  return {
    color: color ? { value: color, foreground: foregroundFor(color) } : null,
    font: font ? { id: font.id, name: font.name, serif: font.serif } : null,
    favicon: has("favicon") ? (branding.favicon ?? null) : null,
    logo: planIncludes(plan, "logo"),
    poweredBy: !(has("hidePoweredBy") && branding.hidePoweredBy),
  };
}

export async function getEffectiveBranding(db: Db, accountId: string) {
  const [plan, branding] = await Promise.all([
    getAccountPlan(db, accountId),
    getBranding(db, accountId),
  ]);
  return effectiveBranding(plan, branding);
}

/** Branding for emails the account's end users get (doc 26 B4). */
export async function getEmailBrand(
  db: Db,
  accountId: string,
): Promise<EmailBrand | undefined> {
  const [[account], brand] = await Promise.all([
    db
      .select({ name: organization.name, logo: organization.logo })
      .from(organization)
      .where(eq(organization.id, accountId))
      .limit(1),
    getEffectiveBranding(db, accountId),
  ]);
  if (!account) return undefined;
  return {
    name: account.name,
    logoUrl: brand.logo ? fileUrl(account.logo) : null,
    color: brand.color?.value ?? null,
    poweredBy: brand.poweredBy,
  };
}
