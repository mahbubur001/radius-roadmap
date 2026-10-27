import { z } from "zod";

export const roleSchema = z.enum(["owner", "admin", "member"]);

export const inviteSchema = z.object({
  email: z.email("Enter a valid email").trim().toLowerCase(),
  role: roleSchema,
  /** Only used for the "member" role; owners and admins see everything. */
  workspaceIds: z.array(z.uuid()),
});

export type InviteInput = z.infer<typeof inviteSchema>;

export const changeRoleSchema = z.object({
  memberId: z.string().min(1),
  role: roleSchema,
});

export const memberIdSchema = z.object({ memberId: z.string().min(1) });

export const memberWorkspacesSchema = z.object({
  memberId: z.string().min(1),
  workspaceIds: z.array(z.uuid()),
});

export const invitationIdSchema = z.object({ invitationId: z.string().min(1) });
