import "server-only";
import { env } from "@/lib/env";
import { wsSegment } from "@/lib/public-path";
import { hostOrigin } from "@/server/services/custom-domains";

/** The app's origin; public sites live under it (doc 19, D1 revised). */
export function appOrigin() {
  return new URL(env.NEXT_PUBLIC_APP_URL).origin;
}

/**
 * A workspace's public site URL, without a trailing slash: the default
 * workspace drops its slug (doc 26 §11). Append "/roadmap", "/updates"…
 * With the account's live custom domain (`activeHostname`), on that domain
 * (doc 26 D5); embed URLs leave it out and stay on the app domain.
 */
export function publicSiteUrl(
  accountSlug: string,
  workspaceSlug: string,
  defaultWorkspace: string | null,
  customHost?: string | null,
) {
  const base = customHost
    ? hostOrigin(customHost)
    : `${appOrigin()}/${accountSlug}`;
  return `${base}${wsSegment(workspaceSlug, defaultWorkspace)}`;
}
