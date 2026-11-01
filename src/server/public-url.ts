import "server-only";
import { env } from "@/lib/env";
import { wsSegment } from "@/lib/public-path";

/** The app's origin; public sites live under it (doc 19, D1 revised). */
export function appOrigin() {
  return new URL(env.NEXT_PUBLIC_APP_URL).origin;
}

/**
 * A workspace's public site URL, without a trailing slash: the default
 * workspace drops its slug (doc 26 §11). Append "/roadmap", "/updates"…
 */
export function publicSiteUrl(
  accountSlug: string,
  workspaceSlug: string,
  defaultWorkspace: string | null,
) {
  return `${appOrigin()}/${accountSlug}${wsSegment(workspaceSlug, defaultWorkspace)}`;
}
