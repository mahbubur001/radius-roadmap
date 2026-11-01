"use server";

import { z } from "zod";
import {
  inviteCustomerSchema,
  planOverrideSchema,
  suspendSchema,
} from "@/lib/schemas/platform";
import { action } from "@/server/action";
import { db } from "@/server/db/client";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { invalidateSite } from "@/server/public-cache";
import { appOrigin } from "@/server/public-url";
import { enqueueEmail } from "@/server/queue/email";
import {
  cancelCustomerInvite,
  inviteCustomer,
  resendCustomerInvite,
} from "@/server/services/platform/customers";
import { endOverride, setOverride } from "@/server/services/platform/overrides";
import {
  suspendAccount,
  unsuspendAccount,
} from "@/server/services/platform/suspension";

// Platform admin actions (doc 28). Each checks the admin first; every
// service call writes the audit log.

const byAccount = z.object({ accountId: z.string().min(1) });

export const inviteCustomerAction = action(
  inviteCustomerSchema,
  async (input) => {
    const admin = await requirePlatformAdmin();
    const { accountId, email } = await inviteCustomer(
      db,
      admin,
      input,
      appOrigin(),
    );
    await enqueueEmail(email);
    return { accountId };
  },
);

export const resendCustomerInviteAction = action(
  byAccount,
  async ({ accountId }) => {
    const admin = await requirePlatformAdmin();
    await enqueueEmail(
      await resendCustomerInvite(db, admin, accountId, appOrigin()),
    );
  },
);

export const cancelCustomerInviteAction = action(
  byAccount,
  async ({ accountId }) => {
    const admin = await requirePlatformAdmin();
    return cancelCustomerInvite(db, admin, accountId);
  },
);

/** Plan changes affect public gates (logo, embeds…), so the site cache goes. */
export const setOverrideAction = action(planOverrideSchema, async (input) => {
  const admin = await requirePlatformAdmin();
  await setOverride(db, admin, input);
  invalidateSite(input.accountId);
});

export const endOverrideAction = action(byAccount, async ({ accountId }) => {
  const admin = await requirePlatformAdmin();
  await endOverride(db, admin, accountId);
  invalidateSite(accountId);
});

export const suspendAction = action(
  suspendSchema,
  async ({ accountId, reason }) => {
    const admin = await requirePlatformAdmin();
    await suspendAccount(db, admin, accountId, reason);
    invalidateSite(accountId);
  },
);

export const unsuspendAction = action(byAccount, async ({ accountId }) => {
  const admin = await requirePlatformAdmin();
  await unsuspendAccount(db, admin, accountId);
  invalidateSite(accountId);
});
