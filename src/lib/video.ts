// Video embeds in rich text (doc 25 A7): YouTube and Vimeo only. Stored as
// { provider, id } and turned into a privacy-friendly player URL here, so no
// user-supplied URL ever reaches an iframe.

export type VideoProvider = "youtube" | "vimeo";
export type VideoRef = { provider: VideoProvider; id: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;

/** A YouTube or Vimeo link (watch, short, embed or share form), or null. */
export function parseVideoUrl(input: string): VideoRef | null {
  let url: URL;
  try {
    url = new URL(
      /^[a-z]+:\/\//i.test(input.trim())
        ? input.trim()
        : `https://${input.trim()}`,
    );
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return youtube(parts[0]);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") return youtube(url.searchParams.get("v"));
    if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) {
      return youtube(parts[1]);
    }
    return null;
  }
  if (host === "vimeo.com") return vimeo(parts.at(-1));
  if (host === "player.vimeo.com" && parts[0] === "video") {
    return vimeo(parts[1]);
  }
  return null;
}

function youtube(id: string | null | undefined): VideoRef | null {
  return id && YOUTUBE_ID.test(id) ? { provider: "youtube", id } : null;
}

function vimeo(id: string | null | undefined): VideoRef | null {
  return id && VIMEO_ID.test(id) ? { provider: "vimeo", id } : null;
}

/** Checks stored attrs (they come from the client) and returns a clean ref. */
export function videoRef(attrs: unknown): VideoRef | null {
  const a = (attrs ?? {}) as { provider?: unknown; id?: unknown };
  if (a.provider === "youtube" && typeof a.id === "string")
    return youtube(a.id);
  if (a.provider === "vimeo" && typeof a.id === "string") return vimeo(a.id);
  return null;
}

/** Player URL: youtube-nocookie and Vimeo's do-not-track mode. */
export function videoEmbedUrl({ provider, id }: VideoRef) {
  return provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${id}`
    : `https://player.vimeo.com/video/${id}?dnt=1`;
}

/** Link to watch on the provider's site (emails can't play iframes). */
export function videoWatchUrl({ provider, id }: VideoRef) {
  return provider === "youtube"
    ? `https://www.youtube.com/watch?v=${id}`
    : `https://vimeo.com/${id}`;
}

export const VIDEO_ALLOW =
  "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen";
