import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import { env } from "@/lib/env";
import { normalizePlan, PLANS } from "@/lib/plans";
import {
  type PlanOverrideInput,
  planOverrideSchema,
} from "@/lib/schemas/platform";
import type { Db } from "@/server/db/client";
import {
  member,
  organization,
  planOverrides,
  user,
  workspaces,
} from "@/server/db/schema";
import type { EmailJob } from "@/server/email/types";
import { NotFoundError } from "../context";
import { type AdminActor, audit } from "./audit";

// Plans set by a platform admin (doc 28 C4–C6). Worker-safe (daily emails).

const DAY = 24 * 3600 * 1000;

/** End of the chosen day, UTC: a plan "until 1 March" runs all of 1 March. */
export function endOfDay(isoDate: string) {
  return new Date(`${isoDate}T23:59:59.999Z`);
}

export async function getOverride(db: Db, accountId: string) {
  const [row] = await db
    .select()
    .from(planOverrides)
    .where(eq(planOverrides.accountId, accountId))
    .limit(1);
  return row ?? null;
}

export function overrideActive(
  row: { endsAt: Date | null } | null,
  now = new Date(),
) {
  return !!row && (!row.endsAt || row.endsAt > now);
}

/** Set or replace the override; reminders start over (C5). */
export async function setOverride(
  db: Db,
  admin: AdminActor,
  input: PlanOverrideInput,
) {
  const data = planOverrideSchema.parse(input);
  const [account] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, data.accountId))
    .limit(1);
  if (!account) throw new NotFoundError("Account not found.");
  const values = {
    plan: data.plan,
    endsAt: data.endsOn ? endOfDay(data.endsOn) : null,
    note: data.note || null,
    setBy: admin.email,
    warned7dAt: null,
    warned1dAt: null,
    endedNotifiedAt: null,
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(planOverrides)
      .values({ accountId: account.id, ...values })
      .onConflictDoUpdate({ target: planOverrides.accountId, set: values });
    await audit(tx, admin, "plan_override.set", account.id, {
      plan: values.plan,
      endsAt: values.endsAt?.toISOString() ?? null,
      note: values.note,
    });
  });
}

/** End the override now: the account falls back to Stripe or Free. */
export async function endOverride(
  db: Db,
  admin: AdminActor,
  accountId: string,
) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(planOverrides)
      .where(eq(planOverrides.accountId, accountId))
      .returning({ plan: planOverrides.plan });
    if (!row) throw new NotFoundError("No plan override.");
    await audit(tx, admin, "plan_override.ended", accountId, {
      plan: row.plan,
    });
  });
}

type Reminder = "7d" | "1d" | "ended";

/**
 * Reminder emails due now (C5): 7 days and 1 day before the end, and once it
 * has ended. Each kind is sent once per override (the marks are reset when
 * an admin changes it).
 */
export async function overrideReminders(db: Db, now = new Date()) {
  const due = await db
    .select({
      accountId: planOverrides.accountId,
      plan: planOverrides.plan,
      endsAt: planOverrides.endsAt,
      warned7dAt: planOverrides.warned7dAt,
      warned1dAt: planOverrides.warned1dAt,
      endedNotifiedAt: planOverrides.endedNotifiedAt,
      accountName: organization.name,
    })
    .from(planOverrides)
    .innerJoin(organization, eq(organization.id, planOverrides.accountId))
    .where(
      and(
        isNotNull(planOverrides.endsAt),
        lte(planOverrides.endsAt, new Date(now.getTime() + 7 * DAY)),
        or(
          isNull(planOverrides.warned7dAt),
          isNull(planOverrides.warned1dAt),
          isNull(planOverrides.endedNotifiedAt),
        ),
      ),
    );
  const out: { accountId: string; kind: Reminder; emails: EmailJob[] }[] = [];
  for (const row of due) {
    const left = (row.endsAt?.getTime() ?? 0) - now.getTime();
    const kind: Reminder | null =
      left <= 0
        ? row.endedNotifiedAt
          ? null
          : "ended"
        : left <= DAY
          ? row.warned1dAt
            ? null
            : "1d"
          : row.warned7dAt
            ? null
            : "7d";
    if (!kind) continue;
    const owners = await accountOwners(db, row.accountId);
    out.push({
      accountId: row.accountId,
      kind,
      emails: owners.emails.map(
        (to): EmailJob => ({
          template:
            kind === "ended" ? "plan-override-ended" : "plan-override-ending",
          to,
          props: {
            accountName: row.accountName,
            planName: PLANS[normalizePlan(row.plan)].name,
            endsAt: row.endsAt?.toISOString() ?? "",
            url: owners.billingUrl,
          },
        }),
      ),
    });
  }
  return out;
}

/** Record that a reminder went out. */
export async function markReminder(db: Db, accountId: string, kind: Reminder) {
  const now = new Date();
  await db
    .update(planOverrides)
    .set(
      kind === "7d"
        ? { warned7dAt: now }
        : kind === "1d"
          ? { warned1dAt: now, warned7dAt: now }
          : { endedNotifiedAt: now, warned1dAt: now, warned7dAt: now },
    )
    .where(eq(planOverrides.accountId, accountId));
}

async function accountOwners(db: Db, accountId: string) {
  const [owners, [first]] = await Promise.all([
    db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(eq(member.organizationId, accountId), eq(member.role, "owner")),
      ),
    db
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.accountId, accountId))
      .orderBy(workspaces.createdAt)
      .limit(1),
  ]);
  const origin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
  return {
    emails: owners.map((o) => o.email),
    billingUrl: `${origin}${first ? `/dashboard/${first.slug}/settings/billing` : "/"}`,
  };
}
