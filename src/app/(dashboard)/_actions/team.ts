"use server";

import { z } from "zod";
import { env } from "@/lib/env";
import {
  changeRoleSchema,
  invitationIdSchema,
  inviteSchema,
  memberIdSchema,
  memberWorkspacesSchema,
} from "@/lib/schemas/team";
import { action } from "@/server/action";
import { db } from "@/server/db/client";
import { enqueueEmail } from "@/server/queue/email";
import {
  cancelInvitation,
  invitationEmail,
  invite,
  renewInvitation,
} from "@/server/services/invitations";
import {
  changeRole,
  leaveAccount,
  removeMember,
  setMemberWorkspaces,
  transferOwnership,
} from "@/server/services/team";
import { requireAccount } from "@/server/session";

export const inviteAction = action(inviteSchema, async (input) => {
  const ctx = await requireAccount();
  const inv = await invite(db, ctx, input);
  await enqueueEmail(
    await invitationEmail(db, ctx, inv.id, env.NEXT_PUBLIC_APP_URL),
  );
});

export const resendInvitationAction = action(
  invitationIdSchema,
  async ({ invitationId }) => {
    const ctx = await requireAccount();
    await renewInvitation(db, ctx, invitationId);
    await enqueueEmail(
      await invitationEmail(db, ctx, invitationId, env.NEXT_PUBLIC_APP_URL),
    );
  },
);

export const cancelInvitationAction = action(
  invitationIdSchema,
  async ({ invitationId }) => {
    const ctx = await requireAccount();
    await cancelInvitation(db, ctx, invitationId);
  },
);

export const changeRoleAction = action(
  changeRoleSchema,
  async ({ memberId, role }) => {
    const ctx = await requireAccount();
    await changeRole(db, ctx, memberId, role);
  },
);

export const setMemberWorkspacesAction = action(
  memberWorkspacesSchema,
  async ({ memberId, workspaceIds }) => {
    const ctx = await requireAccount();
    await setMemberWorkspaces(db, ctx, memberId, workspaceIds);
  },
);

export const removeMemberAction = action(
  memberIdSchema,
  async ({ memberId }) => {
    const ctx = await requireAccount();
    await removeMember(db, ctx, memberId);
  },
);

export const transferOwnershipAction = action(
  memberIdSchema,
  async ({ memberId }) => {
    const ctx = await requireAccount();
    await transferOwnership(db, ctx, memberId);
  },
);

export const leaveAccountAction = action(z.object({}), async () => {
  const ctx = await requireAccount();
  await leaveAccount(db, ctx);
});
