// Calls to /api/widget on the Radius Roadmap app (doc 26 6B). No cookies:
// the visitor id lives in this site's localStorage and travels in a header.

export type WidgetConfig = {
  /** The account slug (required). */
  site: string;
  /** Workspace slug; the account's default workspace when left out. */
  workspace?: string;
  /** Unverified name and email to prefill the feedback form. */
  user?: { name?: string; email?: string };
  /** HS256 JWT signed on the customer's server (verified identity). */
  token?: string;
  /** CSS selector of the customer's own launcher. */
  selector?: string;
  /** false = wait for RadiusRoadmap.init(). */
  autoInit?: boolean;
};

export type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover: string | null;
  category: { name: string; color: string } | null;
  publishedAt: string;
  reactions: Record<string, number>;
};

export type Site = {
  workspace: { id: string; name: string; slug: string; logo: string | null };
  settings: {
    layout: "sidebar" | "popover";
    position: "right" | "left";
    launcher: "bell" | "none";
    color: string | null;
    title: string;
    reactions: boolean;
    feedback: boolean;
  };
  posts: Post[];
  siteUrl: string;
  mine: string[];
  emoji: { key: string; emoji: string; label: string }[];
  user: { name: string | null; email: string | null; verified: boolean } | null;
};

export function createApi(base: string, config: WidgetConfig) {
  const visitorKey = `rr-visitor:${config.site}`;

  async function call<T>(path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "x-rr-site": config.site };
    const visitor = localStorage.getItem(visitorKey);
    if (visitor) headers["x-rr-visitor"] = visitor;
    if (config.token) headers["x-rr-token"] = config.token;
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(`${base}/api/widget/${path}`, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (data.visitor) localStorage.setItem(visitorKey, data.visitor);
    if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
    return data as T;
  }

  const ws = config.workspace
    ? `&workspace=${encodeURIComponent(config.workspace)}`
    : "";
  return {
    config: () =>
      call<Site>(`config?site=${encodeURIComponent(config.site)}${ws}`),
    post: (slug: string) =>
      call<Post & { html: string | null }>(
        `posts/${encodeURIComponent(slug)}?site=${encodeURIComponent(config.site)}${ws}`,
      ),
    react: (workspace: string, updateId: string, emoji: string) =>
      call<{ reacted: boolean; count: number }>("reactions", {
        workspace,
        updateId,
        emoji,
      }),
    feedback: (body: {
      workspace: string;
      title: string;
      details: string;
      name?: string;
      email?: string;
    }) => call<{ pending: boolean }>("feedback", body),
    view: (workspace: string) => call("view", { workspace }),
  };
}

export type Api = ReturnType<typeof createApi>;
