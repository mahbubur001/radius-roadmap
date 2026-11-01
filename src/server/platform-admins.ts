import { env } from "@/lib/env";

// Who is a platform admin (doc 28 C1). No server-only imports: src/proxy.ts
// uses it to 404 /admin for everyone else before anything renders.

export function platformAdminEmails(list = env.PLATFORM_ADMIN_EMAILS) {
  return new Set(
    (list ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdmin(
  email: string,
  verified: boolean,
  list = env.PLATFORM_ADMIN_EMAILS,
) {
  return verified && platformAdminEmails(list).has(email.toLowerCase());
}
