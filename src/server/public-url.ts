import "server-only";
import { env } from "@/lib/env";

/** Origin of an account's public site: <account-slug>.<PUBLIC_ROOT_DOMAIN>. */
export function publicSiteOrigin(accountSlug: string) {
  const { protocol } = new URL(env.NEXT_PUBLIC_APP_URL);
  return `${protocol}//${accountSlug}.${env.PUBLIC_ROOT_DOMAIN}`;
}

export function publicRoadmapUrl(accountSlug: string, workspaceSlug: string) {
  return `${publicSiteOrigin(accountSlug)}/${workspaceSlug}/roadmap`;
}
