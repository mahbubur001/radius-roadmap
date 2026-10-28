import "server-only";
import { env } from "@/lib/env";
import { publicPath } from "@/lib/paths";

/** The app's origin; public sites live under it (doc 19, D1 revised). */
export function appOrigin() {
  return new URL(env.NEXT_PUBLIC_APP_URL).origin;
}

export function publicRoadmapUrl(accountSlug: string, workspaceSlug: string) {
  return `${appOrigin()}${publicPath(accountSlug, workspaceSlug, "roadmap")}`;
}
