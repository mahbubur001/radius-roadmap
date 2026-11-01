import "server-only";
import { notFound } from "next/navigation";
import { getSession } from "@/server/session";
import { isPlatformAdmin } from "./platform-admins";

// Platform admins: the operator's staff (doc 28 C1). The list lives in an env
// var, so nothing in the app can grant it. src/proxy.ts already 404s /admin
// for everyone else; pages and actions check again here.

export { isPlatformAdmin, platformAdminEmails } from "./platform-admins";

export type AdminContext = { userId: string; email: string };

/** The signed-in platform admin, or a 404 for everyone else (doc 28 C2). */
export async function requirePlatformAdmin(): Promise<AdminContext> {
  const session = await getSession();
  if (
    !session ||
    !isPlatformAdmin(session.user.email, session.user.emailVerified)
  ) {
    notFound();
  }
  return { userId: session.user.id, email: session.user.email.toLowerCase() };
}
