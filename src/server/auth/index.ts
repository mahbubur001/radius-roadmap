import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { env } from "@/lib/env";
import { db } from "@/server/db/client";
import { enqueueEmail } from "@/server/queue/email";

// Team members (dashboard users) only. End users who vote on public pages
// are `tracked_users`, scoped per account, and never live in these tables.
export const auth = betterAuth({
  appName: "Radius Roadmap",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg" }),
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
      sendInvitationEmail: async (data) => {
        void enqueueEmail({
          template: "invitation",
          to: data.email,
          props: {
            inviterName: data.inviter.user.name,
            accountName: data.organization.name,
            url: `${env.NEXT_PUBLIC_APP_URL}/accept-invite/${data.id}`,
          },
        });
      },
    }),
    nextCookies(), // must stay last
  ],
});

export type Session = typeof auth.$Infer.Session;
