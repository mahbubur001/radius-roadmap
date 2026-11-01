// Public site paths (doc 26 §11). The account's default workspace (its
// oldest) lives right under the account: /<account>/roadmap. Any other
// workspace keeps its slug: /<account>/<workspace>/roadmap.

export const SITE_MODULES = [
  "roadmap",
  "updates",
  "ideas",
  "articles",
] as const;
export type SiteModule = (typeof SITE_MODULES)[number];

export function isSiteModule(
  segment: string | undefined,
): segment is SiteModule {
  return (SITE_MODULES as readonly string[]).includes(segment ?? "");
}

/** "" for the default workspace, else "/<slug>"; append it to the site URL. */
export function wsSegment(slug: string, defaultWorkspace: string | null) {
  return slug === defaultWorkspace ? "" : `/${slug}`;
}

/** "/<workspace>/…" → "/…" when it is the default workspace's path. */
export function shortenPath(path: string, defaultWorkspace: string | null) {
  if (!defaultWorkspace) return path;
  const prefix = `/${defaultWorkspace}`;
  if (path === prefix) return "";
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
}

/** wsSegment for a loaded public workspace. */
export function wsPath(ws: { slug: string; isDefault: boolean }) {
  return ws.isDefault ? "" : `/${ws.slug}`;
}
