import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { env } from "@/lib/env";
import { db } from "@/server/db/client";
import { enqueueEmail } from "@/server/queue/email";
import { grantInvitedWorkspaces } from "@/server/services/invitations";
import { getPlanLimits } from "@/server/services/plan-limits";

// Team members (dashboard users) only. End users who vote on public pages
// are `tracked_users`, scoped per account, and never live in these tables.
export const auth = betterAuth({
  appName: "Radius Roadmap",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg" }),
  // Team and account changes go through our services (role rules in
  // src/server/services/team.ts), so the matching HTTP endpoints are off.
  // Server-side auth.api calls are not affected by this list.
  disabledPaths: [
    "/organization/create",
    "/organization/update",
    "/organization/delete",
    "/organization/invite-member",
    "/organization/cancel-invitation",
    "/organization/add-member",
    "/organization/remove-member",
    "/organization/update-member-role",
    "/organization/leave",
  ],
  user: {
    changeEmail: {
      enabled: true,
      // The current address approves first; then Better Auth sends a
      // verification link to the new address via sendVerificationEmail.
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        void enqueueEmail({
          template: "change-email",
          to: user.email,
          props: { name: user.name, newEmail, url },
        });
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    sendResetPassword: async ({ user, url }) => {
      void enqueueEmail({
        template: "reset-password",
        to: user.email,
        props: { name: user.name, url },
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      void enqueueEmail({
        template: "verify-email",
        to: user.email,
        props: { name: user.name, url },
      });
    },
  },
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {},
  plugins: [
    // organization = Account (tenant). Roles: owner / admin / member.
    organization({
      schema: {
        invitation: {
          additionalFields: {
            // Workspaces a "member" invitee gets access to (doc 18 §3.2).
            workspaceIds: { type: "string[]", input: true, required: false },
          },
        },
      },
      invitationExpiresIn: 7 * 24 * 60 * 60, // seconds; matches INVITATION_TTL_MS
      membershipLimit: async (_user, org) =>
        (await getPlanLimits(db, org.id)).teammates,
      organizationHooks: {
        afterAcceptInvitation: async ({ invitation, user }) => {
          await grantInvitedWorkspaces(db, invitation, user.id);
        },
      },
    }),
    nextCookies(), // must stay last
  ],
});

export type Session = typeof auth.$Infer.Session;
