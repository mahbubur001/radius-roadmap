import { useEffect, useRef, useState } from "preact/hooks";
import type { Api, Post, Site, WidgetConfig } from "./api";

// The widget UI (doc 26 6B): launcher with an unread badge, then a sidebar or
// popover with the latest posts, a post view and a "Send feedback" form.

export type Controls = { show(): void; hide(): void; toggle(): void };

type View =
  | { name: "list" }
  /** `html` undefined while loading, null when the post has no body. */
  | { name: "post"; post: Post; html?: string | null }
  | { name: "feedback" };

const date = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function App({
  api,
  config,
  site,
  onReady,
}: {
  api: Api;
  config: WidgetConfig;
  site: Site;
  onReady: (c: Controls) => void;
}) {
  const s = site.settings;
  const seenKey = `rr-seen:${config.site}:${site.workspace.slug}`;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ name: "list" });
  const [seen, setSeen] = useState(() => localStorage.getItem(seenKey) ?? "");
  const [posts, setPosts] = useState(site.posts);
  const [mine, setMine] = useState(() => new Set(site.mine));
  const viewed = useRef(false);
  const panel = useRef<HTMLDivElement>(null);

  const unread = posts.filter((p) => p.publishedAt > seen).length;

  useEffect(() => {
    onReady({
      show: () => setOpen(true),
      hide: () => setOpen(false),
      toggle: () => setOpen((o) => !o),
    });
  }, [onReady]);

  // Runs when the panel opens or closes; the rest is read at that moment.
  // biome-ignore lint/correctness/useExhaustiveDependencies: open/close only
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const newest = posts[0]?.publishedAt;
    if (newest && newest > seen) {
      localStorage.setItem(seenKey, newest);
      setSeen(newest);
    }
    if (!viewed.current) {
      viewed.current = true;
      void api.view(site.workspace.slug).catch(() => {});
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function react(post: Post, key: string) {
    const id = `${post.id}:${key}`;
    try {
      const res = await api.react(site.workspace.slug, post.id, key);
      setMine((m) => {
        const next = new Set(m);
        if (res.reacted) next.add(id);
        else next.delete(id);
        return next;
      });
      const update = (p: Post) =>
        p.id === post.id
          ? { ...p, reactions: { ...p.reactions, [key]: res.count } }
          : p;
      setPosts((list) => list.map(update));
      setView((v) => (v.name === "post" ? { ...v, post: update(v.post) } : v));
    } catch {
      // A failed reaction just doesn't change.
    }
  }

  async function openPost(post: Post) {
    setView({ name: "post", post });
    try {
      const full = await api.post(post.slug);
      setView({ name: "post", post, html: full.html });
    } catch {
      window.open(`${site.siteUrl}/updates/${post.slug}`, "_blank", "noopener");
    }
  }

  const side = s.position === "left" ? "left" : "right";
  return (
    <div
      class={`rr ${s.layout} ${side}`}
      style={s.color ? `--rr-accent:${s.color}` : undefined}
    >
      {s.launcher === "bell" ? (
        <button
          type="button"
          class="launcher"
          aria-label={unread ? `${s.title} (${unread} new)` : s.title}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <Bell />
          {unread ? (
            <span class="badge">{unread > 9 ? "9+" : unread}</span>
          ) : null}
        </button>
      ) : null}
      {open ? (
        <>
          {s.layout === "sidebar" ? (
            <button
              type="button"
              class="backdrop"
              aria-label="Close"
              tabIndex={-1}
              onClick={() => setOpen(false)}
            />
          ) : null}
          <div
            ref={panel}
            class="panel"
            role="dialog"
            aria-label={s.title}
            tabIndex={-1}
          >
            <header>
              {view.name === "list" ? (
                <strong>{s.title}</strong>
              ) : (
                <button
                  type="button"
                  class="back"
                  onClick={() => setView({ name: "list" })}
                >
                  ← Back
                </button>
              )}
              <button
                type="button"
                class="close"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>
            <div class="body">
              {view.name === "list" ? (
                <List
                  posts={posts}
                  site={site}
                  mine={mine}
                  onOpen={openPost}
                  onReact={react}
                />
              ) : view.name === "post" ? (
                <PostView
                  post={view.post}
                  html={view.html}
                  site={site}
                  mine={mine}
                  onReact={react}
                />
              ) : (
                <Feedback api={api} config={config} site={site} />
              )}
            </div>
            {s.feedback && view.name !== "feedback" ? (
              <footer>
                <button
                  type="button"
                  class="primary"
                  onClick={() => setView({ name: "feedback" })}
                >
                  Send feedback
                </button>
              </footer>
            ) : null}
            <a
              class="powered"
              href={site.siteUrl}
              target="_blank"
              rel="noopener"
            >
              Powered by Radius Roadmap
            </a>
          </div>
        </>
      ) : null}
    </div>
  );
}

function List({
  posts,
  site,
  mine,
  onOpen,
  onReact,
}: {
  posts: Post[];
  site: Site;
  mine: Set<string>;
  onOpen: (p: Post) => void;
  onReact: (p: Post, key: string) => void;
}) {
  if (!posts.length) return <p class="empty">Nothing published yet.</p>;
  return (
    <ul class="posts">
      {posts.map((p) => (
        <li key={p.id}>
          <Meta post={p} />
          <button type="button" class="title" onClick={() => onOpen(p)}>
            {p.title}
          </button>
          {p.excerpt ? <p class="excerpt">{p.excerpt}</p> : null}
          {site.settings.reactions ? (
            <Reactions post={p} site={site} mine={mine} onReact={onReact} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Meta({ post }: { post: Post }) {
  return (
    <div class="meta">
      {post.category ? (
        <span class="chip">
          <i style={`background:${post.category.color}`} />
          {post.category.name}
        </span>
      ) : null}
      <span>{date(post.publishedAt)}</span>
    </div>
  );
}

function PostView({
  post,
  html,
  site,
  mine,
  onReact,
}: {
  post: Post;
  html?: string | null;
  site: Site;
  mine: Set<string>;
  onReact: (p: Post, key: string) => void;
}) {
  return (
    <article class="post">
      {post.cover ? (
        // biome-ignore lint/performance/noImgElement: Preact widget, not Next.js
        <img class="cover" src={post.cover} alt="" />
      ) : null}
      <Meta post={post} />
      <h2>{post.title}</h2>
      {html === undefined ? (
        <p class="excerpt">Loading…</p>
      ) : html === null ? null : (
        // Rendered and sanitized by the server (src/lib/rich-text.ts).
        // biome-ignore lint/security/noDangerouslySetInnerHtml: server-sanitized post body
        <div class="content" dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {site.settings.reactions ? (
        <Reactions post={post} site={site} mine={mine} onReact={onReact} />
      ) : null}
      <a
        class="link"
        href={`${site.siteUrl}/updates/${post.slug}`}
        target="_blank"
        rel="noopener"
      >
        Open in a new tab
      </a>
    </article>
  );
}

function Reactions({
  post,
  site,
  mine,
  onReact,
}: {
  post: Post;
  site: Site;
  mine: Set<string>;
  onReact: (p: Post, key: string) => void;
}) {
  return (
    <div class="reactions">
      {site.emoji.map((e) => {
        const active = mine.has(`${post.id}:${e.key}`);
        const n = post.reactions[e.key] ?? 0;
        return (
          <button
            key={e.key}
            type="button"
            class={active ? "on" : ""}
            aria-pressed={active}
            aria-label={`${e.label} (${n})`}
            onClick={() => onReact(post, e.key)}
          >
            {e.emoji}
            {n ? <span>{n}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function Feedback({
  api,
  config,
  site,
}: {
  api: Api;
  config: WidgetConfig;
  site: Site;
}) {
  // Known when the page passed a token (verified) or user details.
  const known = site.user ?? config.user ?? null;
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [name, setName] = useState(known?.name ?? "");
  const [email, setEmail] = useState(known?.email ?? "");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");

  if (state === "sent") {
    return (
      <div class="sent">
        <strong>Thanks for the feedback!</strong>
        <p>The team will take a look.</p>
      </div>
    );
  }

  return (
    <form
      class="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError("");
        try {
          await api.feedback({
            workspace: site.workspace.slug,
            title,
            details,
            ...(site.user?.verified ? {} : { name, email }),
          });
          setState("sent");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Try again.");
          setState("idle");
        }
      }}
    >
      <label>
        What would you like?
        <input
          required
          minLength={3}
          maxLength={200}
          value={title}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
      </label>
      <label>
        More details (optional)
        <textarea
          rows={4}
          maxLength={5000}
          value={details}
          onInput={(e) => setDetails(e.currentTarget.value)}
        />
      </label>
      {site.user?.verified ? null : (
        <>
          <label>
            Your name
            <input
              maxLength={80}
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </label>
          <label>
            Your email
            <input
              type="email"
              required
              value={email}
              onInput={(e) => setEmail(e.currentTarget.value)}
            />
          </label>
        </>
      )}
      {error ? <p class="error">{error}</p> : null}
      <button type="submit" class="primary" disabled={state === "busy"}>
        {state === "busy" ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}

function Bell() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      <path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33" />
    </svg>
  );
}
